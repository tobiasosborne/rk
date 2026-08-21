// PURITY: pure — no fs/network/clock (L3). Gate 2 Check 17 wiring: parsed signatures, convention
// profile, route-scoped entailment, structural findings, and coverage. Ground truth:
// docs/gate-contracts.md Check 17 and NOTES-2026-08-20-qpcp-campaign-plan.md section 6.

import type { Finding } from "./framework";
import type { GateConfig } from "./config";
import type { RepoSnapshot } from "./snapshot";
import type { Lemma } from "./linker-lemma";
import type { Signature } from "./signature";
import { conventionProfilePath, parseConventionProfile, type ConventionProfile } from "./signature-profile";
import { checkRoute, scopeLabel, validateSignatureVocabulary } from "./signature-entail";
import { conjoinSignature, type ConjunctionIssue } from "./signature-context";
import { kindStatusIncoherent, signatureDemanded } from "./linker-signature-policy";

function err(path: string, line: number | undefined, code: string, message: string): Finding {
  return { severity: "ERROR", path, line, message: `[${code}] ${message}`, structural: true };
}

function warn(path: string, line: number | undefined, code: string, message: string): Finding {
  return { severity: "WARN", path, line, message: `[${code}] ${message}` };
}

function contradictionMessage(subject: string, issue: ConjunctionIssue): string {
  const reason = issue.reason === "empty"
    ? "no value satisfies both declared intervals"
    : "no maximum lower bound in the declared order; this is a conservative refusal because rk cannot represent the conjunction as one interval";
  return `${subject}: ${scopeLabel(issue.scope)} '${issue.key}' is contradictory — ${reason}`;
}

export interface SignatureCheckResult {
  findings: Finding[];
  /** Coverage fragment for the linker's single coverage line — always present, in every state. */
  note: string;
}

interface Loaded {
  signatures: Map<string, Signature>;
  lineOf: Map<string, number>;
  findings: Finding[];
}

/** Reads every shard's ```signature block. A malformed block yields its own ERROR and is NOT
 * registered as a signature — but the shard IS recorded as "has a block", so the missing-signature
 * rule below cannot report the same fault a second time under a different name. */
function loadSignatures(lemmas: readonly Lemma[]): Loaded & { blockPresent: Set<string> } {
  const signatures = new Map<string, Signature>();
  const lineOf = new Map<string, number>();
  const blockPresent = new Set<string>();
  const findings: Finding[] = [];
  for (const l of lemmas) {
    const block = l.signatureBlock ?? { state: "absent" };
    if (block.state === "absent") continue;
    blockPresent.add(l.id);
    if (block.state === "malformed") {
      findings.push(err(l.path, block.line, block.code, `${l.id}: ${block.message}`));
      continue;
    }
    signatures.set(l.id, block.signature);
    lineOf.set(l.id, block.line);
  }
  return { signatures, lineOf, blockPresent, findings };
}

/** Resolves the configured convention profile off the snapshot. Fail-closed by construction: every
 * unusable state returns `undefined` plus one loud ERROR, and the caller then runs NO vocabulary or
 * entailment checking rather than checking against a guessed lattice. */
function resolveProfile(
  snapshot: RepoSnapshot,
  config: GateConfig,
): { profile?: ConventionProfile; finding?: Finding; note: string } {
  const name = config.conventionProfile;
  if (name === undefined) {
    return {
      finding: err(
        ".rk/config.json",
        1,
        "profile-unreadable",
        "shards carry signatures but `.rk/config.json` names no `conventionProfile` — Check 17's " +
          "vocabulary (keys, values, lattices) has no source, so no signature can be validated. " +
          "Set `conventionProfile` (e.g. \"qpcp.v1\") or remove the signature blocks.",
      ),
      note: "profile: none configured",
    };
  }
  const path = conventionProfilePath(name);
  const text = snapshot.get(path);
  if (text === undefined) {
    return {
      finding: err(path, 1, "profile-unreadable", `convention profile '${name}' is named by .rk/config.json but ${path} does not exist`),
      note: `profile '${name}': unreadable (absent)`,
    };
  }
  const parsed = parseConventionProfile(name, text);
  if (!parsed.ok) {
    return {
      finding: err(path, 1, "profile-unreadable", `convention profile '${name}' is unusable: ${parsed.why}`),
      note: `profile '${name}': unreadable (malformed)`,
    };
  }
  return { profile: parsed.profile, note: `profile '${name}': ok` };
}

/** The routes Check 17 walks for one shard: each declared route UNION its unconditional `deps`
 * (docs/gate-contracts.md Gate 2 Inputs: "`deps` are required under every route"), or `deps` alone
 * as the single implicit route when none is declared. A shard with neither still yields ONE empty
 * route, so its own `post` is still checked against its own `pre`. */
export function routesOf(l: Lemma): string[][] {
  if (l.routes.length === 0) return [[...new Set(l.deps)]];
  return l.routes.map((r) => [...new Set([...l.deps, ...r])]);
}

/** Check 17. Returns findings plus the coverage fragment — which is emitted in EVERY state,
 * including "not adopted" and "profile unreadable", so a reader never has to guess whether the
 * check ran (CLAUDE.md L2). */
export function checkSignatures(
  snapshot: RepoSnapshot,
  lemmas: readonly Lemma[],
  defIds: ReadonlySet<string>,
  config: GateConfig,
): SignatureCheckResult {
  const findings: Finding[] = [];
  const { signatures, lineOf, blockPresent, findings: parseFindings } = loadSignatures(lemmas);
  findings.push(...parseFindings);

  const mode = config.signatures;
  const pathOf = new Map(lemmas.map((l) => [l.id, l.path]));

  // Required-ness (memo section 6). A shard whose block is present-but-malformed is NOT also
  // reported as missing: one fault, one finding.
  if (mode !== undefined) {
    for (const l of lemmas) {
      if (kindStatusIncoherent(l, true)) {
        findings.push(err(
          l.path, 1, "kind-status-incoherent",
          `${l.id}: kind '${l.kind}' cannot carry signed-result status '${l.status}' once signatures are adopted — ` +
            `an open problem or obstruction is not simultaneously a proved/cited/consensus result`,
        ));
      }
      if (!signatureDemanded(l, mode) || blockPresent.has(l.id)) continue;
      const message =
        `${l.id}: a '${l.kind ?? "unknown"}' shard (status '${l.status ?? "absent"}', af '${l.af}') carries no ` +
        `\`\`\`signature block, and .rk/config.json sets ` +
        `signatures: "${mode}"` +
        (mode === "required"
          ? " — a result with no declared regime cannot be checked against the regime it is applied in"
          : " (adopted, not yet enforced — set signatures: \"required\" to make this an ERROR)");
      findings.push(
        mode === "required"
          ? err(l.path, 1, "signature-missing", message)
          : warn(l.path, 1, "signature-missing", message),
      );
    }
  }

  if (signatures.size === 0) {
    return { findings, note: signatureNote(mode, undefined, 0, 0, 0, 0) };
  }

  const { profile, finding: profileFinding, note: profileNote } = resolveProfile(snapshot, config);
  if (profileFinding) findings.push(profileFinding);
  if (!profile) {
    return { findings, note: signatureNote(mode, profileNote, signatures.size, 0, 0, 0) };
  }

  // (a) object resolution, (c) closed vocabulary, and the profile join — per shard.
  for (const [id, sig] of [...signatures].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const path = pathOf.get(id) ?? "argument";
    const line = lineOf.get(id);
    if (sig.profile !== profile.name) {
      findings.push(
        err(path, line, "profile-mismatch", `${id}: signature names profile '${sig.profile}' but this repo's configured profile is '${profile.name}' — a predicate checked against the wrong lattice reports green`),
      );
      continue;
    }
    for (const p of [...sig.pre, ...sig.post].sort((a, b) => (a.obj < b.obj ? -1 : 1))) {
      if (!defIds.has(p.obj)) {
        findings.push(err(path, line, "dangling-object", `${id}: signature object '${p.obj}' resolves to no definitions/*.md shard`));
      }
    }
    const vocabularyIssues = validateSignatureVocabulary(sig, profile);
    for (const issue of vocabularyIssues) {
      findings.push(err(path, line, issue.code, `${id}: ${issue.message}`));
    }
    if (vocabularyIssues.length === 0) {
      const own = conjoinSignature(sig, profile).issues.filter((issue) => issue.source !== "post");
      for (const issue of own) {
        findings.push(err(path, line, "signature-contradictory", contradictionMessage(id, issue)));
      }
    }
  }

  // (b) entailment on every route.
  let routesChecked = 0;
  let entailmentsChecked = 0;
  let unsignedRouteMembers = 0;
  for (const l of lemmas) {
    const sig = signatures.get(l.id);
    if (!sig || sig.profile !== profile.name) continue;
    const line = lineOf.get(l.id);
    for (const route of routesOf(l)) {
      routesChecked++;
      const r = checkRoute({ shardId: l.id, signature: sig, route, signatureOf: signatures, profile });
      entailmentsChecked += r.entailmentsChecked;
      unsignedRouteMembers += r.membersWithoutSignature.length;
      const routeLabel = route.length === 0 ? "(no dependencies)" : `[${route.join("; ")}]`;
      for (const { memberId, failure } of r.failures) {
        findings.push(
          err(
            l.path,
            line,
            "regime-unentailed",
            `${l.id}: on route ${routeLabel}, dependency '${memberId}' requires ${scopeLabel(failure.scope)} ` +
              `'${failure.key}' = ${failure.required}, which the context does not entail ` +
              `(context holds: ${failure.available.length === 0 ? "nothing for that key" : failure.available.join(", ")}) — ` +
              `'${memberId}' is unavailable here, so its post is NOT added to the context`,
          ),
        );
      }
      for (const { memberId, issue } of r.postContradictions) {
        findings.push(err(
          l.path,
          line,
          "signature-contradictory",
          contradictionMessage(`${l.id}: on route ${routeLabel}, dependency '${memberId}' post`, issue) +
            ` — '${memberId}' is unavailable here, so none of its post is added to the context`,
        ));
      }
      for (const failure of r.postUnsupported) {
        findings.push(
          warn(
            l.path,
            line,
            "post-unsupported",
            `${l.id}: on route ${routeLabel}, its own post ${scopeLabel(failure.scope)} '${failure.key}' = ` +
              `${failure.required} is not supplied by the route (context holds: ` +
              `${failure.available.length === 0 ? "nothing for that key" : failure.available.join(", ")}) — ` +
              `WARN, not ERROR: a PROOF may legitimately supply what no dependency does`,
          ),
        );
      }
    }
  }

  return { findings, note: signatureNote(mode, profileNote, signatures.size, routesChecked, entailmentsChecked, unsignedRouteMembers) };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The coverage fragment, emitted in EVERY state. "not adopted", "adopted but zero shards carry
 * one", "adopted with an unreadable profile", and "checked S/R/E" are four different facts a
 * reader must never have to guess between (CLAUDE.md L2). Adoption governs whether a signature is
 * DEMANDED; a present one is always checked, which is why the counts appear even when the repo
 * has not adopted signatures at all. */
function signatureNote(
  mode: string | undefined,
  profileNote: string | undefined,
  shards: number,
  routes: number,
  entailments: number,
  unsignedRouteMembers: number,
): string {
  const unsigned = `; unsigned route members: ${unsignedRouteMembers}`;
  if (shards === 0) {
    return (mode === undefined ? "signatures: absent (not adopted)" : `signatures: ${mode}, 0 shards carry one`) + unsigned;
  }
  const counts = `${plural(shards, "shard")} / ${plural(routes, "route")} / ${plural(entailments, "entailment")}`;
  const adoption = mode ?? "not adopted; a present block is still checked";
  return `signatures: ${counts} (${adoption}${profileNote ? `, ${profileNote}` : ""})${unsigned}`;
}
