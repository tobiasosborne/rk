// M1.1 template-set acceptance (bead rk-b8p). Makes the acceptance bar mechanical: the residue
// grep (c) is the exact form of "a domain expert finds no AISM-specific residue". The layout
// forbid-list encodes audit findings R1/R11/R13/R14 (docs/memos/2026-07-18-aism-residue-audit.md).
//
// L1 red-green: each assertion was watched fail first — plant a residue string in a .tmpl and (c)
// goes red; drop a required slot and (b) goes red; corrupt a header classification and (a) goes
// red; point a manifest entry at a missing template and (d) goes red. Restore, green.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontmatter } from "../../src/gates/snapshot";
import { AF_STATES, KINDS, MATH_STATUS } from "../../src/gates/linker-lemma";
import { fillTemplate } from "../../src/scaffold/slots";
import { NORTH_STAR_SHARD_ID, NORTH_STAR_SHARD_PATH } from "../../src/scaffold/north-star";
import { SANCTIONED_RUNS_INFRASTRUCTURE } from "../../src/gates/runs";
import { appendManifestRow, emptySourcesDocument, parseManifestTable } from "../../src/refs/manifest";
import { sourceId } from "../../src/types";

const TEMPLATES_ROOT = join(import.meta.dir, "..", "..", "templates");

// Every .tmpl under templates/ (recursive), as paths relative to templates/.
function findTmpl(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(abs).isDirectory()) out.push(...findTmpl(abs, rel));
    else if (entry.endsWith(".tmpl")) out.push(rel);
  }
  return out;
}

const TMPL_FILES = findTmpl(TEMPLATES_ROOT);
const read = (rel: string) => readFileSync(join(TEMPLATES_ROOT, rel), "utf8");

const VALID_CLASSIFICATIONS = ["authored-append-only", "rewritten-whole", "generated", "campaign-seed"];

// Templates that physically cannot carry a leading `<!-- ROLE: ... -->` HTML-comment header, for
// two DIFFERENT reasons:
//  - argument/north-star.md.tmpl stamps a REGISTRY SHARD, not a document: Gate 2's frontmatter
//    must be the first non-blank content of the file (src/gates/snapshot.ts's `parseFrontmatter`
//    returns `present: false` for anything else).
//  - .gitignore.tmpl stamps a .gitignore: an HTML comment is not a comment in gitignore syntax —
//    a line reading `<!-- ROLE: ... -->` would be a literal, nonsense ignore PATTERN, not
//    documentation (rk-zva).
//  - runs/probe-channel.sh.tmpl stamps an executable shell script: `<!--` is not a bash comment,
//    and a shebang must be the file's FIRST line to work at all (rk-z93m).
// None is skipped silently — describe-block (a2) below asserts the equivalent contract for
// all three (the manifest declares the class; the body states it in prose using its OWN comment
// syntax), and (g) additionally parses the shard template with the linker's own parser.
const NO_HTML_HEADER_TMPL_FILES = new Set([
  "argument/north-star.md.tmpl",
  ".gitignore.tmpl",
  "runs/probe-channel.sh.tmpl",
]);

// Constitution slots that must appear EXACTLY ONCE (uniqueness matters — a duplicated north-star
// or phase declaration is an authoring error). PROJECT_NAME is deliberately excluded: it recurs
// in the title and body by design.
const REQUIRED_UNIQUE_SLOTS = [
  "RK_SLOT_GOAL",
  "RK_SLOT_NORTH_STAR",
  "RK_SLOT_COMPUTE_BUDGET",
  "RK_SLOT_MODEL_POLICY",
  "RK_SLOT_PHASE",
  "RK_SLOT_AUDIT_CADENCE",
  "RK_SLOT_BRITTLENESS_SOFT_CAP",
];

// Case-insensitive residue tokens. A stamped repo carrying any of these fails rk-b8p by
// inspection (audit R12 landing-blocker made a grep).
const RESIDUE_TOKENS = ["aism", "almost-idempotent", "stochastic", "osborne", "tobias"];

// Layout residue the scaffold must never bake (audit R11/R13/R14).
const FORBIDDEN_PATHS = [
  "report/",
  "LEARNINGS.md",
  "SHARD_CATALOG.md",
  "argument/INDEX.md",
  "argument/DAG.md",
  "INDEX.md",
];

describe("templates / sanity", () => {
  test("the expected .tmpl set is present", () => {
    expect(TMPL_FILES.sort()).toEqual(
      [
        ".gitignore.tmpl",
        "CLAUDE.md.tmpl",
        "CONVENTIONS.md.tmpl",
        "FINDINGS.md.tmpl",
        "HANDOFF.md.tmpl",
        "PRD.md.tmpl",
        "docs/worklog.md.tmpl",
        "definitions/README.md.tmpl",
        "argument/README.md.tmpl",
        "argument/north-star.md.tmpl",
        "runs/probe-channel.sh.tmpl",
        "refs/manifest/SOURCES.md.tmpl",
      ].sort(),
    );
  });
});

// rk-tyl6 (found live by ../rk-campaign-D): the first `rk refs add` in a freshly stamped repo
// crashed because refs/manifest/SOURCES.md did not exist — and crashed AFTER writing the lock and
// checksums, losing the manifest row. `add` now seeds the file itself, but a scaffold that ships
// the registry it documents is the belt to that braces: the researcher can see the catalogue (and
// its never-fabricate-a-hash policy) before the first source, not after.
describe("templates / (i) the stamped refs/manifest seed (rk-tyl6)", () => {
  const manifest = JSON.parse(readFileSync(join(TEMPLATES_ROOT, "manifest.json"), "utf8"));
  const body = read("refs/manifest/SOURCES.md.tmpl");

  test("the template is byte-identical to the seed `rk refs add`/`adopt` write themselves", () => {
    // One canonical document, three writers. If they ever diverge, a repo's SOURCES.md would
    // depend on WHICH command happened to create it — the same class of drift that made `add`
    // and `adopt` disagree about a missing file in the first place.
    expect(body).toBe(emptySourcesDocument());
  });

  test("it stamps an EMPTY registry table that the manifest parser and writer both accept", () => {
    expect(parseManifestTable(body)).toEqual([]);
    const withRow = appendManifestRow(body, {
      sourceId: sourceId("paper-2508.00001"),
      citation: "A. Author, *A Paper*",
      locator: "arxiv:2508.00001",
      retrieved: "2026-08-14",
      localPath: "refs/paper-2508.00001/2508.00001.pdf",
      sha16: "0123456789abcdef",
      role: "",
    });
    expect(parseManifestTable(withRow)).toHaveLength(1);
    // No slots: a registry seed has nothing campaign-specific in it, so nothing to substitute.
    expect(body).not.toContain("{{RK_SLOT_");
  });

  test("it is stamped authored-append-only under a stamped refs/manifest/ directory", () => {
    const entry = manifest.stamped.find((e: { path: string }) => e.path === "refs/manifest/SOURCES.md");
    expect(entry).toBeDefined();
    expect(entry.template).toBe("refs/manifest/SOURCES.md.tmpl");
    // It grows by appended rows and is never re-stamped — exactly the manifest's own definition
    // of authored-append-only (a campaign-seed is stamped WITH content it then rewrites in place).
    expect(entry.classification).toBe("authored-append-only");
    const paths: string[] = manifest.stamped.map((e: { path: string }) => e.path);
    expect(paths).toContain("refs/manifest/");
    // Ordering: the directory must be declared before the file inside it.
    expect(paths.indexOf("refs/manifest/")).toBeLessThan(paths.indexOf("refs/manifest/SOURCES.md"));
  });

  // The deliberate half of the companion fix, and the reason it is NOT what the bead asked for:
  // stamping empty machine artifacts would silence two truthful gate signals in a fresh repo.
  // src/gates/defs.ts:203 WARNs "manifest absent: refs/manifest/checksums.sha256 (cannot verify
  // cited hashes)" only when the file is ABSENT, and src/gates/refs-extraction.ts's readLockFacts
  // reports "sources.lock.json absent" -> nothing is hash-pinned. An empty stamped file would flip
  // both to "present" while nothing is actually pinned or verifiable. `add`/`adopt` create them on
  // first use (both already had create-if-absent fallbacks), which is the honest moment.
  test("no machine artifact is stamped — only SOURCES.md lives under refs/manifest/", () => {
    const underManifestDir: string[] = manifest.stamped
      .map((e: { path: string }) => e.path)
      .filter((p: string) => p.startsWith("refs/manifest/") && p !== "refs/manifest/");
    expect(underManifestDir).toEqual(["refs/manifest/SOURCES.md"]);
  });
});

describe("templates / (a) ROLE-UPDATE-POLICY-TRIGGER headers", () => {
  for (const rel of TMPL_FILES.filter((r) => !NO_HTML_HEADER_TMPL_FILES.has(r))) {
    test(`${rel} carries a header with a valid classification`, () => {
      const body = read(rel);
      // The header is the leading HTML comment; it must carry all three fields in order.
      const header = body.slice(0, body.indexOf("-->"));
      expect(header).toContain("ROLE:");
      const upIdx = header.indexOf("UPDATE POLICY:");
      const trIdx = header.indexOf("TRIGGER:");
      expect(upIdx).toBeGreaterThanOrEqual(0);
      expect(trIdx).toBeGreaterThan(upIdx);
      // The classification is declared in the UPDATE POLICY segment, exactly one, never mixed
      // (PRD §3). Scope the match to that segment so unrelated prose (e.g. "generated by
      // rk render" in a router line) cannot count as a second classification.
      const updatePolicy = header.slice(upIdx, trIdx);
      const found = VALID_CLASSIFICATIONS.filter((c) => updatePolicy.includes(c));
      expect(found).toHaveLength(1);
    });
  }
});

// The header exemption above is a NAMED exemption, never a silent skip (CLAUDE.md L2): a template
// in this set still has to declare what happens to it after stamping, it just cannot do so in a
// leading HTML comment. It declares it twice — mechanically in the manifest, and in prose in the
// body a researcher actually reads (in whatever comment syntax that file's own format uses).
describe("templates / (a2) header-exempt templates declare their post-stamp class in prose instead", () => {
  const manifest = JSON.parse(readFileSync(join(TEMPLATES_ROOT, "manifest.json"), "utf8"));

  for (const rel of TMPL_FILES.filter((r) => NO_HTML_HEADER_TMPL_FILES.has(r))) {
    test(`${rel} is manifest-classified campaign-seed and says so in its body`, () => {
      const entries = manifest.stamped.filter((e: { template: string | null }) => e.template === rel);
      expect(entries).toHaveLength(1);
      expect(entries[0].classification).toBe("campaign-seed");
      // `campaign-seed` means: stamped once, campaign-owned thereafter, NEVER re-stamped by
      // `rk upgrade`. The body must say that, because the manifest is not what a user reads.
      const body = read(rel);
      expect(body.toLowerCase()).toContain("rk upgrade");
      expect(body.toLowerCase()).toMatch(/never (re-?stamps|rewrites|overwrites)/);
    });
  }
});

describe("templates / (b) constitution required slots", () => {
  const body = read("CLAUDE.md.tmpl");
  const count = (slot: string) => body.split(`{{${slot}}}`).length - 1;

  for (const slot of REQUIRED_UNIQUE_SLOTS) {
    test(`{{${slot}}} appears exactly once`, () => {
      expect(count(slot)).toBe(1);
    });
  }

  test("shard-prefix and project-name slots are present (R12: per-repo, never a literal)", () => {
    expect(count("RK_SLOT_SHARD_PREFIX")).toBeGreaterThanOrEqual(1);
    expect(count("RK_SLOT_PROJECT_NAME")).toBeGreaterThanOrEqual(1);
  });

  test("the session-close audit trigger references the cadence slot and blocks close", () => {
    // Trigger must exist now and be exercisable (M1.1 acceptance): it names the cadence slot,
    // the exceed condition, and the block.
    const section = body.slice(body.indexOf("Session close"));
    expect(section).toContain("{{RK_SLOT_AUDIT_CADENCE}}");
    expect(section.toLowerCase()).toContain("cycles-since-last-audit");
    expect(section).toContain("BLOCKED");
  });
});

describe("templates / (c) residue grep — the acceptance bar", () => {
  for (const rel of TMPL_FILES) {
    test(`${rel} contains no AISM/TJO residue token`, () => {
      const lower = read(rel).toLowerCase();
      for (const token of RESIDUE_TOKENS) {
        expect(lower).not.toContain(token);
      }
    });
  }

  test("manifest.json contains no residue token", () => {
    const lower = readFileSync(join(TEMPLATES_ROOT, "manifest.json"), "utf8").toLowerCase();
    for (const token of RESIDUE_TOKENS) {
      expect(lower).not.toContain(token);
    }
  });
});

describe("templates / (d) manifest.json", () => {
  const manifest = JSON.parse(readFileSync(join(TEMPLATES_ROOT, "manifest.json"), "utf8"));

  test("parses and carries a semver template_version", () => {
    expect(manifest.template_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("every stamped entry's template file exists in templates/", () => {
    for (const entry of manifest.stamped) {
      if (entry.template === null) {
        expect(entry.classification).toBe("directory");
        continue;
      }
      expect(existsSync(join(TEMPLATES_ROOT, entry.template))).toBe(true);
      expect(VALID_CLASSIFICATIONS).toContain(entry.classification);
    }
  });

  test("every .tmpl on disk is referenced by at least one stamped entry", () => {
    const referenced = new Set(
      manifest.stamped.map((e: { template: string | null }) => e.template).filter(Boolean),
    );
    for (const rel of TMPL_FILES) expect(referenced.has(rel)).toBe(true);
  });

  test("the layout stamps exactly PRD:79-85 and bakes no forbidden residue path", () => {
    const paths: string[] = manifest.stamped.map((e: { path: string }) => e.path);
    for (const forbidden of FORBIDDEN_PATHS) {
      expect(paths.some((p) => p === forbidden || p.startsWith(forbidden))).toBe(false);
    }
    // The four content layers, refs, docs/worklog.md, and the four state dirs are all present.
    for (const required of [
      "definitions/",
      "argument/",
      "proofs/",
      "runs/",
      "refs/",
      "build/",
      ".rk/",
      ".frontier/",
      ".beads/",
      "docs/worklog.md",
      "CLAUDE.md",
      "AGENTS.md",
      "PRD.md",
      "HANDOFF.md",
      "CONVENTIONS.md",
      "FINDINGS.md",
      ".gitignore",
    ]) {
      expect(paths).toContain(required);
    }
  });

  // rk-zva (generality audit 2026-07-25, finding m6): PRD section 3 leaves build/ "gitignored or
  // committed per config" but nothing was ever stamped either way, so a first commit swept in
  // generated site output by accident. rk's own default is explicit and self-documenting.
  test(".gitignore is stamped campaign-seed and ignores build/, explicitly and self-documented", () => {
    const entry = manifest.stamped.find((e: { path: string }) => e.path === ".gitignore");
    expect(entry).toBeDefined();
    expect(entry.template).toBe(".gitignore.tmpl");
    expect(entry.classification).toBe("campaign-seed");
    const body = read(".gitignore.tmpl");
    expect(body.split("\n").map((l: string) => l.trim())).toContain("build/");
    expect(body.toLowerCase()).toContain("ignored");
  });

  test("CLAUDE.md and AGENTS.md stamp from the same template (byte-identical constitution)", () => {
    const claude = manifest.stamped.find((e: { path: string }) => e.path === "CLAUDE.md");
    const agents = manifest.stamped.find((e: { path: string }) => e.path === "AGENTS.md");
    expect(claude.template).toBe(agents.template);
    expect(claude.template).toBe("CLAUDE.md.tmpl");
  });

  // rk-o1y: the M1.4 upgrade stub exists to notice exactly this kind of template-content change
  // — a stamped repo carrying an older template_version must MISMATCH a binary carrying this one.
  test("template_version was bumped to 1.8.0 for the stamped probe channel and the runs-gate allowance (rk-z93m)", () => {
    expect(manifest.template_version).toBe("1.8.0");
  });

  // A version bump whose changes are INVISIBLE to a per-file diff (a brand-new stamped path, a new
  // `.rk/config.json` key — neither of which exists in the older repo to diff against) makes
  // `rk upgrade`'s manual-diff plan actively misleading. The changelog is what `rk upgrade` prints
  // so the plan names what a diff cannot show.
  test("every stamped template_version has a changelog entry, newest first", () => {
    expect(Array.isArray(manifest.changelog)).toBe(true);
    expect(manifest.changelog.length).toBeGreaterThanOrEqual(1);
    expect(manifest.changelog[0].version).toBe(manifest.template_version);
    for (const e of manifest.changelog) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Array.isArray(e.changes)).toBe(true);
      expect(e.changes.length).toBeGreaterThanOrEqual(1);
      for (const c of e.changes) expect(typeof c).toBe("string");
    }
  });

  test("the north-star shard is stamped, campaign-seed, at the path the code names", () => {
    const entry = manifest.stamped.find((e: { path: string }) => e.path === NORTH_STAR_SHARD_PATH);
    expect(entry).toBeDefined();
    expect(entry.template).toBe("argument/north-star.md.tmpl");
    expect(entry.classification).toBe("campaign-seed");
    // The shard's id MUST equal its filename stem (Gate 2 check 1) — assert the manifest path and
    // the code constant agree, so a rename of one without the other cannot ship.
    expect(basename(entry.path, ".md")).toBe(NORTH_STAR_SHARD_ID);
  });

  test("definitions/README.md and argument/README.md are stamped, rewritten-whole (rk-o1y)", () => {
    for (const [path, template] of [
      ["definitions/README.md", "definitions/README.md.tmpl"],
      ["argument/README.md", "argument/README.md.tmpl"],
    ]) {
      const entry = manifest.stamped.find((e: { path: string }) => e.path === path);
      expect(entry).toBeDefined();
      expect(entry.template).toBe(template);
      expect(entry.classification).toBe("rewritten-whole");
    }
  });
});

// rk-o1y: the stamped schema docs must be derived from docs/gate-contracts.md Gates 1-2 — field
// names and allowed enums cited precisely — with one complete minimal example shard each, so a
// newcomer can author a first shard without reverse-engineering the gates via iterative WARNs.
describe("templates / (e) shard schema docs (rk-o1y)", () => {
  const defsReadme = read("definitions/README.md.tmpl");
  const argReadme = read("argument/README.md.tmpl");

  test("definitions/README.md.tmpl cites every Gate 1 frontmatter field and enum value", () => {
    for (const token of [
      "id", "term", "aliases", "kind", "status", "source", "locus", "sha256", "consensus",
      "cited", "consensus", "original", // kind enum
      "draft", "locked", // status enum
    ]) {
      expect(defsReadme).toContain(token);
    }
    // one complete, fenced, generic example shard — not real campaign content
    expect(defsReadme).toContain("def-widget");
    expect(defsReadme).toMatch(/```markdown\n---\nid: def-widget/);
  });

  test("argument/README.md.tmpl cites every Gate 2 frontmatter field and enum value", () => {
    for (const token of [
      "id", "kind", "contract", "defs", "deps", "routes", "status", "af", "provenance", "owner", "workspace",
      "lemma", "proposition", "theorem", "corollary", "open-problem", "obstruction", // kind enum
      "none", "seeded", "validated", // af enum
    ]) {
      expect(argReadme).toContain(token);
    }
    expect(argReadme).toContain("lem-widget-bound");
    expect(argReadme).toMatch(/```markdown\n---\nid: lem-widget-bound/);
  });

  test("neither schema doc carries campaign-flavored content (generic widget example only)", () => {
    for (const forbidden of ["idempotent", "stochastic", "conjecture C", "af-orchestrate"]) {
      expect(defsReadme.toLowerCase()).not.toContain(forbidden.toLowerCase());
      expect(argReadme.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  // rk-gvx (M1-review F1): the README must teach the ACTUAL Gate 2 discovery contract
  // (argument/**/*.md, recursive), never argument/lemmas/ as the sole shard location.
  test("argument/README.md.tmpl teaches recursive argument/**/*.md discovery, not lemmas/-only", () => {
    expect(argReadme).toContain("argument/**/*.md");
    expect(argReadme.toLowerCase()).toMatch(/may live\s+anywhere under/);
    expect(argReadme).not.toMatch(/Shards live under `argument\/lemmas\/`/);
  });

  // rk-gvx: assumption flagged for the orchestrator to verify at merge — a concurrent lane is
  // adding multi-line YAML list support for deps:/defs:/routes: to the frontmatter parser
  // (src/gates/snapshot.ts's parseFrontmatter), alongside the existing single-line `;`-list form.
  test("argument/README.md.tmpl teaches both the single-line ';'-list and multi-line YAML list forms", () => {
    expect(argReadme).toContain("deps: lem-a; lem-b");
    expect(argReadme).toMatch(/deps:\n {2}- lem-a\n {2}- lem-b/);
    expect(argReadme).toMatch(/routes:\n {2}- \[a; b\]\n {2}- \[c\]/);
  });

  // rk-mdx (M1-review F2): source: internal is not unconditionally valid — defs.ts:153 rejects it
  // once a non-empty manifest lacks a registered 'internal' source-id.
  test("definitions/README.md.tmpl states the manifest requirement for source: internal", () => {
    expect(defsReadme).toContain("refs/manifest/checksums.sha256");
    expect(defsReadme.toLowerCase()).toContain("rejected");
  });
});

// rk-huq / rk-19i (M1-review B4/B5): template-truthfulness regressions — the stamped constitution
// must describe ACTUAL rk behavior, never a promise the binary doesn't keep.
describe("templates / (f) constitution truthfulness (rk-huq, rk-19i)", () => {
  const claude = read("CLAUDE.md.tmpl");

  test("the consolidation-ward transition names fr orient and both graceful-skip conditions (rk-huq)", () => {
    const section = claude.slice(claude.indexOf("## 3. Phase"), claude.indexOf("## 4."));
    expect(section).toContain("fr orient");
    expect(section.toLowerCase()).toContain("visible skip notice");
    expect(section).toContain("docs/worklog.md");
  });

  // rk-19i (M2.6): the freshness gate now exists — the constitution must say so plainly, never
  // hedge it as a future promise. `rk render` itself (the M2.4 HTML output) may still be absent
  // from a given binary, which the text is allowed to say; the freshness GATE's own present-tense
  // behavior (hand-editing a DECLARED generated file fails `rk check` today) must not be hedged.
  test("freshness-gate behavior is stated as present-tense fact, not hedged as a future capability (rk-19i)", () => {
    // Whitespace-normalized: the CLAIM is the contract, the line wrap is not (a reflow of the
    // router paragraph must not be able to turn this assertion red or, worse, green).
    const flat = claude.replace(/\s+/g, " ");
    expect(flat).toContain("hand-editing one of those files fails `rk check` today");
    expect(claude).toContain(".rk/generated.json");
    expect(claude.toLowerCase()).not.toContain("a freshness check that fails");
  });

  // The 1.3.0 constitution hedged `rk render` as "a rendering command that may not exist yet in
  // this binary" and never named `rk verify`/`graph`/`refs`/`doctor` — text written before M2.4
  // shipped. A constitution that understates its own tool sends the researcher to hand-roll
  // subsystems the binary already ships (generality audit 2026-07-25, finding M2).
  // rk-tlwb: Check 4b v2 requires a JSON provenance record before a proved-mod-audit close banks,
  // and for two days no rk subcommand wrote one and no template said the record existed —
  // campaign A drew 12 [reward-tier-unbacked] errors, one per pma close, for recording real
  // cross-vendor verification as prose. A stamped campaign must be told the shape, the location,
  // and the timing (the author seam is only recoverable while the worker's transcript is open).
  test("the constitution tells a campaign how and when to produce provenance records (rk-tlwb)", () => {
    const section = claude.slice(claude.indexOf("### Recording an independent verification"), claude.indexOf("## 6."));
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("rk reward attest");
    // The three facts a campaign cannot reconstruct from the error message alone.
    expect(section).toContain(".rk/provenance-<shard-id>.json");
    expect(section).toContain("sha256");
    // The campaign-A incident itself: real verification, recorded as prose, banked nothing.
    expect(section.replace(/\s+/g, " ")).toContain("A prose report is not a record");
    // Honesty stance: recorded and checkable, never authenticated.
    expect(section.replace(/\s+/g, " ")).toContain("recorded and checkable, never authenticated");
  });

  test("the constitution names every shipped command and no longer hedges rk render", () => {
    for (const cmd of ["rk check", "rk phase", "rk graph", "rk render", "rk refs", "rk verify", "rk doctor", "rk upgrade"]) {
      expect(claude).toContain(cmd);
    }
    expect(claude).not.toContain("may not exist yet in this binary");
  });

  // The concretely damaging half of M2: stamped L1 told the user to recompute hashes and grep
  // quotes BY HAND for every `cited` claim, while `rk refs` ships exactly that.
  test("L1 points at rk refs rather than hand-hashing and hand-grepping (finding M2)", () => {
    const l1 = claude.slice(claude.indexOf("**L1 —"), claude.indexOf("**L2 —"));
    expect(l1).toContain("rk refs add");
    expect(l1).toContain("rk refs quote");
    expect(l1).not.toContain("grep -F");
    expect(l1.toLowerCase()).not.toContain("recompute the hash");
  });

  // Finding M3: `northStarId` and `workers` are load-bearing config keys documented only inside
  // rk's own docs, which are never stamped into a campaign.
  test("the constitution documents the .rk/config.json keys the tool actually reads (finding M3)", () => {
    for (const key of ["northStarId", "workers", "shardsPrefix", "linkerBrittlenessSoftCap", "phase"]) {
      expect(claude).toContain(key);
    }
    // northStarId's documentation must state the guarantee it powers AND the fail-closed rule —
    // a key documented as "the north star's id" teaches nothing about why it matters.
    const nsSection = claude.slice(claude.indexOf("`northStarId`"));
    expect(nsSection.toLowerCase()).toContain("critical path");
    expect(nsSection.toLowerCase()).toContain("cross-vendor");
    // `workers` must name the role/tier vocabulary a user has to type, not just the key name.
    for (const token of ["prover", "verifier", "reviewer", "l5", "hard"]) {
      expect(claude).toContain(token);
    }
  });

  // Finding M5, and its twin in the constitution the audit did not name: `shardsPrefix` is Gate
  // 6's LaTeX report-shard namespace, NOT a registry-id convention. Rule 4 stamped
  // "ids using the campaign's shard prefix ({{RK_SLOT_SHARD_PREFIX}}-...)", contradicting both
  // stamped schema READMEs (`def-widget`, `lem-widget-bound`).
  test("no stamped template tells the user to prefix registry ids with the shard prefix (finding M5)", () => {
    for (const rel of TMPL_FILES) {
      const body = read(rel);
      expect(body).not.toMatch(/\{\{RK_SLOT_SHARD_PREFIX\}\}-(def|lem|thm|prop|cor|op|obs)\b/);
    }
  });

  test("CONVENTIONS.md.tmpl teaches the real id convention and scopes the shard prefix to report shards", () => {
    const conv = read("CONVENTIONS.md.tmpl");
    const flat = conv.replace(/\s+/g, " "); // wrap-insensitive: a reflow must not flip this
    expect(conv).toContain("def-");
    // each of the six argument-layer prefixes named AND glossed, not just alluded to
    for (const layer of ["lem", "thm", "prop", "cor", "op", "obs"]) expect(flat).toContain(`\`${layer}\` (`);
    expect(conv).toContain("no campaign-wide prefix");
    expect(conv).toContain("shardsPrefix");
    expect(conv.toLowerCase()).toContain("report");
  });
});

// The strongest assertion available about a stamped shard: run the LINKER's own parser over the
// slot-substituted template and check the record it produces, rather than token-matching the text
// (bead rk-ssu: token matching cannot catch semantic drift between templates and gates).
describe("templates / (g) the seeded north-star shard parses as a Gate 2 registry shard", () => {
  const NORTH_STAR = "Every widget with property P is close to a gadget";
  const stamped = fillTemplate(read("argument/north-star.md.tmpl"), {
    RK_SLOT_NORTH_STAR_ID: NORTH_STAR_SHARD_ID,
    RK_SLOT_NORTH_STAR: NORTH_STAR,
    RK_SLOT_PROJECT_NAME: "my-conjecture",
  });

  test("frontmatter is present, terminated, and free of malformed lines", () => {
    const fm = parseFrontmatter(stamped);
    expect(fm.present).toBe(true);
    expect(fm.terminated).toBe(true);
    expect(fm.malformedLines).toEqual([]);
  });

  test("id equals the filename stem and every enum field is a value Gate 2 accepts", () => {
    const fm = parseFrontmatter(stamped);
    expect(fm.fields.id).toBe(NORTH_STAR_SHARD_ID);
    expect(fm.fields.id).toBe(basename(NORTH_STAR_SHARD_PATH, ".md"));
    expect(KINDS.has(fm.fields.kind!)).toBe(true);
    expect(MATH_STATUS.has(fm.fields.status!)).toBe(true);
    expect(AF_STATES.has(fm.fields.af!)).toBe(true);
  });

  test("the contract is the north-star string byte-for-byte (the anti-drift join key)", () => {
    const fm = parseFrontmatter(stamped);
    expect(fm.fields.contract).toBe(NORTH_STAR);
  });

  // A seeded north star must start at the BOTTOM of the rigour ladder. Stamping anything the
  // ladder treats as rigorous (`proved`/`cited`/`consensus`) would make a brand-new campaign's
  // dashboard claim its unproven target result is established — the cardinal error (L0).
  test("the seeded status is not a rigorous rung", () => {
    const fm = parseFrontmatter(stamped);
    expect(["proved", "cited", "consensus"]).not.toContain(fm.fields.status);
    expect(fm.fields.status).toBe("conjecture");
  });

  test("no unfilled slot survives substitution", () => {
    expect(stamped).not.toContain("{{RK_SLOT_");
  });
});

// rk-6cmx / rk-oeal (remediation wave 2, 2026-08-12): campaign C ran a full research window with
// its reward ledger at exactly zero because the stamped constitution had no reward/predict
// section at all, and separately the template carried NONE of the probe/brief/hostile-seat/
// worker-lifecycle protocol three campaigns had already proven out — each was hand-ported per
// campaign, and hand-porting had already failed once (the reward-ledger gap itself). These tests
// assert `rk init` now stamps every one of those sections, each with its own scar citation, and
// that the §5 provenance-attestation ordering fix (declare in frontmatter BEFORE attesting, never
// after) landed too.
describe("templates / (h) reward/predict + probe/brief/hostile/worker-lifecycle protocol (rk-6cmx, rk-oeal)", () => {
  const claude = read("CLAUDE.md.tmpl");

  test("§4a: predict-before-attempt, rk reward sync cadence, escrow, and the zero-ledger scar", () => {
    const section = claude.slice(claude.indexOf("## 4a."), claude.indexOf("## 4b."));
    expect(section.length).toBeGreaterThan(0);
    expect(section.toLowerCase()).toContain("predict-before-attempt");
    expect(section).toContain("Brier");
    expect(section).toContain("rk reward sync");
    expect(section).toContain("--round");
    expect(section.toLowerCase()).toContain("escrow");
    expect(section.toLowerCase()).toContain("vests pro-rata");
    // the motivating scar: a full window, zero reward events, because the section didn't exist
    expect(section).toContain("closes, no reduces, no prunes");
    expect(section).toContain("rk reward attest");
  });

  test("§4b: boundary-probe protocol I.1-I.3, each amendment present with its scar", () => {
    const section = claude.slice(claude.indexOf("## 4b."), claude.indexOf("## 4c."));
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("(I.1)");
    expect(section).toContain("(I.2)");
    expect(section).toContain("(I.3)");
    expect(section).toContain("NEGATIVE CONTROL");
    expect(section).toContain("PROBE DEBT");
    expect(section.toLowerCase()).toContain("do not re-litigate");
    expect(section.toLowerCase()).toContain("orphaning a hash");
  });

  test("§4c: brief format (obligation+model+records+failure-modes, STOP) and the hostile seat, each measured", () => {
    const section = claude.slice(claude.indexOf("## 4c."), claude.indexOf("## 4d."));
    expect(section.length).toBeGreaterThan(0);
    expect(section.toLowerCase()).toContain("do not steer technique");
    expect(section).toContain("STOPS");
    expect(section).toContain("three times in four");
    expect(section).toContain("all eleven");
    expect(section.toLowerCase()).toContain("hostile seat");
  });

  test("§4d: worker lifecycle — pattern-kill, wake-on-completion, run-unique paths, stdin redirect", () => {
    const section = claude.slice(claude.indexOf("## 4d."), claude.indexOf("## 5."));
    expect(section.length).toBeGreaterThan(0);
    expect(section.toLowerCase()).toContain("no pattern-kill");
    // the one deliberately-marked bead id exception (task instructions: pending ratification only)
    expect(section).toContain("rk-7the");
    expect(section.toLowerCase()).toContain("pending upstream ratification");
    expect(section.toLowerCase()).toContain("lossy signal");
    expect(section).toContain("one in three");
    expect(section.toLowerCase()).toContain("run-unique");
    expect(section).toContain("/dev/null");
  });

  test("the probe channel is stamped campaign-seed and owns the sanctioned ledger path (rk-z93m)", () => {
    const manifest = JSON.parse(readFileSync(join(TEMPLATES_ROOT, "manifest.json"), "utf8"));
    const entry = manifest.stamped.find((e: { path: string }) => e.path === "runs/probe-channel.sh");
    expect(entry).toBeDefined();
    expect(entry.template).toBe("runs/probe-channel.sh.tmpl");
    // campaign-seed: a campaign tunes the channel to its own runtime, and `rk upgrade` must never
    // overwrite that (the ledger's own entries were produced by THAT script, not this one).
    expect(entry.classification).toBe("campaign-seed");

    const body = read("runs/probe-channel.sh.tmpl");
    // A shebang only works as the file's first line — this is why the template is exempt from the
    // leading-HTML-comment header rule above.
    expect(body.startsWith("#!/usr/bin/env bash")).toBe(true);
    // The channel and the gate must agree on the ledger path, or the stamped script writes to a
    // file the gate then reports as a stray.
    expect(body).toContain("runs/probe-ledger.jsonl");
    // I.3's immutability rule has to be enforced by the script, not by the researcher's memory.
    expect(body).toContain("output.txt already exists");
    expect(body).toContain("sha256sum");
  });

  // Codex review 2026-08-14 (P1 :38, P2-5 :63, P2-6 :66-72). The BEHAVIOUR these repairs bought is
  // proved live in test/templates/probe-channel.test.ts, which drives the stamped script against
  // real bundles, real concurrency and real hostile filenames. What is asserted HERE is only what
  // a black-box run cannot show: the SHAPE of the critical section — one lock acquisition, taken
  // before the reservation and never released early, and a pre-run digest that is textually ahead
  // of the launch. A structurally different script that happened to pass the live-fire suite on a
  // fast machine would still be a regression.
  test("the channel's critical section is one flock, taken early, with no shell command string (codex 2026-08-14)", () => {
    const body = read("runs/probe-channel.sh.tmpl");
    const code = body
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");

    // P2-6: `flock -c '<interpolated string>'` re-parses ledger fields through a shell — an
    // apostrophe in a filename broke it. The lock is taken on a file descriptor instead.
    expect(code).not.toMatch(/flock\s[^\n]*\s-c\s/);
    expect(code).toContain('exec 9<"$ROOT/runs"');
    // Exactly one acquisition and no early release: the lock spans reservation, run, hash, append.
    expect(code.match(/^flock /gm) ?? []).toHaveLength(1);
    expect(code).not.toContain("flock -u");

    const lockIdx = code.indexOf("flock -w");
    const reserveIdx = code.indexOf("already has a ledger entry");
    const preHashIdx = code.indexOf('SSHA=$(sha256sum "$BDIR/$SCRIPT"');
    const runIdx = code.indexOf('"${RUNNER[@]}" </dev/null >output.txt');
    const postHashIdx = code.indexOf('SSHA_AFTER=$(sha256sum "$BDIR/$SCRIPT"');
    const appendIdx = code.indexOf('printf \'%s\\n\' "$ENTRY" >> "$LEDGER"');
    for (const idx of [lockIdx, reserveIdx, preHashIdx, runIdx, postHashIdx, appendIdx]) {
      expect(idx).toBeGreaterThan(0);
    }
    // P1: reserve AFTER the lock; P2-5: hash BEFORE the launch and again after; append last.
    expect(lockIdx).toBeLessThan(reserveIdx);
    expect(reserveIdx).toBeLessThan(preHashIdx);
    expect(preHashIdx).toBeLessThan(runIdx);
    expect(runIdx).toBeLessThan(postHashIdx);
    expect(postHashIdx).toBeLessThan(appendIdx);

    // P2-6: names are rejected rather than escaped — the allowlist is the whole defence, so it is
    // pinned here. Widening it must be a deliberate edit in two places.
    expect(code).toContain("NAME_RE='^[A-Za-z0-9][A-Za-z0-9._/-]*$'");
    // No zero-dependency JSON escaping snuck in behind the allowlist (L4: the channel must not
    // start requiring python3 for a .sh probe).
    expect(code).not.toContain("import json");
  });

  // rk-z93m: the runs gate's sanctioned-name allowance and what `rk init` actually stamps under
  // runs/ are two halves of one contract. If a future template stamps another file there without
  // adding it to the gate's list, the freshly-stamped repo fails its own first `rk check` with a
  // stray-file WARN — the exact failure this bead fixed. This test is that binding.
  test("every file stamped directly under runs/ is sanctioned by the runs gate (gate/scaffold binding)", () => {
    const manifest = JSON.parse(readFileSync(join(TEMPLATES_ROOT, "manifest.json"), "utf8"));
    const stampedUnderRuns = manifest.stamped
      .filter((e: { path: string; template: string | null }) => e.template !== null && e.path.startsWith("runs/"))
      .map((e: { path: string }) => e.path.slice("runs/".length));
    // One level only: a file in a runs/ SUBdirectory is bundle content, not top-level
    // infrastructure, and the allowance deliberately does not reach it.
    for (const name of stampedUnderRuns) {
      expect(name).not.toContain("/");
      expect(SANCTIONED_RUNS_INFRASTRUCTURE).toContain(name);
    }
    // And the list itself is exactly the two names the constitution and the gate both document —
    // pinned so widening it is a deliberate, visible edit here as well as in the gate.
    expect([...SANCTIONED_RUNS_INFRASTRUCTURE]).toEqual(["probe-channel.sh", "probe-ledger.jsonl"]);
    // The ledger is NOT stamped: the channel creates it on first append (an empty JSONL file
    // carries no ROLE header and teaches nothing), but the gate sanctions the name either way.
    expect(stampedUnderRuns).toEqual(["probe-channel.sh"]);
  });

  test("no bead id other than the deliberately pending-ratification one appears in the stamped constitution", () => {
    // A domain expert stamping a fresh campaign must find no rk-repo-specific residue: bead ids
    // are internal bookkeeping for THIS repo and meaningless elsewhere, so only the one clause
    // task instructions marked as a deliberate pending-ratification exception may carry one.
    const beadIds = claude.match(/\brk-[a-z0-9]{4}\b/g) ?? [];
    expect(new Set(beadIds)).toEqual(new Set(["rk-7the"]));
  });

  test("§4b I.3 names the stamped channel, both sanctioned file names, and the rename hazard (rk-z93m)", () => {
    const section = claude.slice(claude.indexOf("## 4b."), claude.indexOf("## 4c."));
    const flat = section.replace(/\s+/g, " ");
    // The two names are the whole contract between the constitution and the runs gate.
    for (const name of SANCTIONED_RUNS_INFRASTRUCTURE) expect(section).toContain(`runs/${name}`);
    // How to actually invoke it — the stamped file is not executable, so the constitution must
    // not tell a researcher to run it as `runs/probe-channel.sh` and walk them into a 126.
    expect(section).toContain("bash runs/probe-channel.sh");
    // The failure mode the bead is about: the gate only sanctions these EXACT names.
    expect(flat.toLowerCase()).toContain("rename either file");
    expect(section).toContain("probe-ledger.jsonl.bak");
  });

  test("§4b I.3 documents the hardened channel's exit codes, the reservation rule, and the exec bit", () => {
    // R2 (2026-08-14) gave the stamped channel ledger-backed reservation (exit 4), bounded lock
    // wait (exit 5), and poisoned-on-self-modification (exit 6); the constitution text had never
    // caught up, so a worker hitting one of those had no constitution text to read.
    const section = claude.slice(claude.indexOf("## 4b."), claude.indexOf("## 4c."));
    for (const code of ["`2`", "`3`", "`4`", "`5`", "`6`"]) expect(section).toContain(code);
    expect(section.toLowerCase()).toContain("ledger");
    expect(section.toLowerCase()).toContain("not the filesystem");
    expect(section).toContain("POISONED");
    // rk init has no per-file mode concept (deliberately declined, not a gap left unexplained):
    // the stamped script is not executable, so the constitution must say to run it via `bash`.
    expect(section).toContain("not executable");
    expect(section).toContain("bash runs/probe-channel.sh");
  });

  test("§5 provenance subsection: declare-then-attest ordering, not attest-then-declare", () => {
    const section = claude.slice(
      claude.indexOf("### Recording an independent verification"),
      claude.indexOf("## 6."),
    );
    const declareIdx = section.indexOf("Declare first");
    const attestIdx = section.indexOf("Then attest");
    expect(declareIdx).toBeGreaterThan(0);
    expect(attestIdx).toBeGreaterThan(declareIdx);
    // the stale post-hoc phrasing this replaced must be fully gone, not just reworded around
    expect(section).not.toContain("Then add the record to the claim shard's frontmatter — the command prints the exact line");
    // the reordering rationale itself must be stated, not just implied by example ordering
    expect(section.toLowerCase()).toContain("declare before you attest");
  });
});
