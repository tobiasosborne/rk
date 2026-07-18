// PURITY: pure — no fs/network/clock (L3). Gate 4 (provenance) registry + report-label parsers:
// an INDEPENDENT re-parse of argument/lemmas/*.md (docs/gate-contracts.md Gate 4 Inputs:
// "re-parsed independently of the linker gate; fields read: id, status, af, provenance, kind" —
// check-provenance.py:120-132) and report/sections/*.tex `\label{}` scanning
// (check-provenance.py:135-143), plus the registry<->report join key (`labelsOf`,
// check-provenance.py:230-237). PROVENANCE.md/UNWIRED.md/tab:status parsing lives in the sibling
// shard provenance-md.ts (kept separate to stay under the ~200-line shard target).

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { listDir, parseFrontmatter } from "./snapshot";

const LABEL_TOKEN = "[a-z]+:[A-Za-z0-9-]+";
export const LABEL_FULL_RE = new RegExp(`^${LABEL_TOKEN}$`);
const LABEL_DEF_RE = new RegExp(`\\\\label\\{(${LABEL_TOKEN})\\}`, "g");
const REPORT_TOK_RE = new RegExp(`report\\s+(${LABEL_TOKEN})`, "g");
const LEMMA_DIR = "argument/lemmas";

export interface RegistryShard {
  id: string;
  /** repo-relative path to this shard's own file — every id-keyed finding is attributed back to
   * a real path (Shared conventions' uniform SEVERITY path:line format). */
  path: string;
  status?: string;
  af: string;
  provenance: string;
}

/** `parseProvenanceRegistry`'s return: the successfully-parsed shards plus every registry file
 * this gate DECLINED to parse, named explicitly — never a bare count folded away (rk-v18, review
 * finding 4). */
export interface RegistryParseResult {
  shards: RegistryShard[];
  /** repo-relative paths of `argument/lemmas/*.md` files discovered but excluded because their
   * frontmatter is missing or unterminated, sorted. Kept separate from `shards` (rather than
   * dropped) so `provenance.ts` can report BOTH the raw registry universe and the surviving
   * parsed set — collapsing them back into one number would silently shrink the coverage
   * denominator around exactly the shards this gate refused to look at. */
  skipped: string[];
}

/** check-provenance.py:120-132 `parse_registry` — independent re-parse of argument/lemmas/*.md,
 * reading only the fields this gate needs. A shard with missing/unterminated frontmatter is
 * excluded from `shards` here (`fm is None: continue`, check-provenance.py:128-129) but named in
 * `skipped`, never dropped outright: the linker gate (Gate 2) is the one that reports the
 * frontmatter-validity ERROR (`linker-01`), so this gate must not re-issue that ERROR — but per
 * docs/gate-contracts.md Shared conventions ("a skip is always visible with a count", CLAUDE.md
 * L2) it must not silently shrink its own coverage denominator around the exclusion either
 * (rk-v18; `registrySkipWarning` below turns `skipped` into the visible WARN + coverage total).
 * An `id:`-less shard defaults to the filename stem (`fm.setdefault("id", path.stem)`,
 * check-provenance.py:130) rather than being excluded — a genuine difference from the linker
 * gate's own F12 fix (linker-parse.ts), because AISM's check-provenance.py itself never crashes
 * on a missing `id:` (it has no `l["id"]` bracket-access chain the way argument.py's checks do),
 * so there is no crash to convert into a finding here. */
export function parseProvenanceRegistry(snapshot: RepoSnapshot): RegistryParseResult {
  const shards: RegistryShard[] = [];
  const skipped: string[] = [];
  const names = listDir(snapshot, LEMMA_DIR)
    .filter((n) => n.endsWith(".md") && n !== "README.md" && n !== "INDEX.md")
    .sort();
  for (const name of names) {
    const path = `${LEMMA_DIR}/${name}`;
    const fm = parseFrontmatter(snapshot.get(path) ?? "");
    if (!fm.present || !fm.terminated) {
      skipped.push(path);
      continue;
    }
    shards.push({
      id: fm.fields.id ?? name.slice(0, -".md".length),
      path,
      status: fm.fields.status,
      af: fm.fields.af !== undefined ? fm.fields.af : "none",
      provenance: fm.fields.provenance ?? "",
    });
  }
  return { shards, skipped };
}

/** Gate 4's own visible-skip duty over `skipped` (rk-v18, review finding 4): `checked`/`total`
 * for the coverage line (total = raw registry inputs discovered, checked = the surviving parsed
 * set — never collapsed to the same number), plus a single aggregate WARN naming every excluded
 * path when `skipped` is non-empty. This is deliberately a WARN, not a duplicate ERROR: Gate 2
 * (the linker) already ERRORs the same defect (`linker-01`, missing/unterminated frontmatter) —
 * this WARN's job is only to keep Gate 4's OWN coverage denominator honest, not to re-report a
 * validity failure Gate 2 already owns. [Tier-A / L6: this WARN-vs-ERROR choice is a validity-
 * surface decision — flagged for Fable ratification at the rk-4wm milestone review, per
 * docs/reviews/2026-07-18-m0.3-milestone-review-codex.md finding 4.] */
export function registrySkipReport(
  shards: RegistryShard[],
  skipped: string[],
): { checked: number; total: number; warning?: Finding } {
  const checked = shards.length;
  const total = checked + skipped.length;
  if (skipped.length === 0) return { checked, total };
  return {
    checked,
    total,
    warning: {
      severity: "WARN",
      path: skipped[0]!,
      message:
        `${skipped.length} registry file(s) excluded from provenance re-parse (missing/` +
        `unterminated frontmatter; Gate 2 reports the validity ERROR for this): ${skipped.join(", ")}`,
    },
  };
}

export interface TexLabels {
  labels: Set<string>;
  /** label -> the sections/ file that first defines it (finding attribution; AISM's own console
   * output has no path at all for this check, check-provenance.py:251-259). */
  definedIn: Map<string, string>;
}

/** Drops a TeX `%`-comment to end-of-line, honouring an escaped `\%` (check-provenance.py:86-100
 * `strip_tex_comment`) — a commented-out `\label` must not count as a live label. Exported: the
 * sibling `provenance-md.ts` shard reuses it for tab:status body scanning. */
export function stripTexComment(line: string): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "\\" && i + 1 < line.length) {
      out += line.slice(i, i + 2);
      i++;
      continue;
    }
    if (c === "%") break;
    out += c;
  }
  return out;
}

/** `\label{}` names defined in `report/sections/*.tex` (check-provenance.py:135-143). */
export function texLabels(snapshot: RepoSnapshot): TexLabels {
  const labels = new Set<string>();
  const definedIn = new Map<string, string>();
  const names = listDir(snapshot, "report/sections")
    .filter((n) => n.endsWith(".tex"))
    .sort();
  for (const name of names) {
    const path = `report/sections/${name}`;
    const content = snapshot.get(path) ?? "";
    for (const line of content.split("\n")) {
      const stripped = stripTexComment(line);
      for (const m of stripped.matchAll(LABEL_DEF_RE)) {
        const lab = m[1]!;
        labels.add(lab);
        if (!definedIn.has(lab)) definedIn.set(lab, path);
      }
    }
  }
  return { labels, definedIn };
}

/** Report labels a registry shard maps to: every explicit `report <label>` token in `provenance`
 * (added UNCONDITIONALLY, even when the label does not resolve to any `\label{}` — this is the
 * documented parser quirk behind `provenance-06`'s "does not double-fire the anchor check": a
 * dangling forward label still makes `labelsOf` non-empty), plus the first-hyphen-to-colon
 * transform of the shard's id, but ONLY when that transformed label actually exists in `texlabels`
 * (check-provenance.py:230-237). */
export function labelsOf(shard: RegistryShard, tex: TexLabels): Set<string> {
  const labs = new Set<string>();
  for (const m of shard.provenance.matchAll(REPORT_TOK_RE)) labs.add(m[1]!);
  const hyphenIdx = shard.id.indexOf("-");
  const cand = hyphenIdx === -1 ? shard.id : `${shard.id.slice(0, hyphenIdx)}:${shard.id.slice(hyphenIdx + 1)}`;
  if (tex.labels.has(cand)) labs.add(cand);
  return labs;
}

/** Explicit `report <label>` tokens only (no id-transform fallback) — check 1 (forward labels)
 * iterates these directly, since the fallback candidate is by construction always already in
 * `texlabels` and can never itself be dangling. */
export function forwardTokens(shard: RegistryShard): string[] {
  return [...shard.provenance.matchAll(REPORT_TOK_RE)].map((m) => m[1]!);
}
