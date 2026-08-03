// Unit + integration tests for src/cli/check-regen.ts — the edge that produces Gate 7's
// `render-site-v1` expected bytes (rk-xbsx, 2026-07-25).
//
// The whole point of this module is a TAXONOMY: a byte difference between the artifact and a
// fresh regeneration has three possible causes (drift / non-reproducibility / degraded fidelity)
// and only the first may be called STALE. `classifyRegen` is deliberately pure so the taxonomy
// itself can be asserted directly, without having to make a real `fr export` misbehave on demand;
// the degraded-fidelity branch is ALSO proven end-to-end below, because that one CAN be forced
// deterministically (a real `.frontier/log.jsonl` plus an unreachable `fr` binary is exactly the
// `log-fallback` state src/store/fr-load.ts reports).

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyRegen, type RegenAttempt } from "../src/cli/check-regen";
import { checkCommand } from "../src/cli/check";
import { renderCommand } from "../src/cli/render";
import { loadSnapshot } from "../src/store/snapshot-load";
import type { SourceStatuses } from "../src/render/diagnostics-view";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Every source authoritative or legitimately never engaged — the state in which a byte
 * difference IS drift and nothing else. */
const CLEAN: SourceStatuses = { af: "export", fr: "export", bd: "read" };
const ABSENT: SourceStatuses = { af: "absent", fr: "absent", bd: "absent" };

function attempt(bytes: string, sources: SourceStatuses = CLEAN): RegenAttempt {
  return { bytes, sources };
}

describe("classifyRegen: the three causes of a byte difference, never conflated", () => {
  test("two agreeing attempts, every source authoritative -> ok:true with NO degraded marker (a difference here means drift)", () => {
    const r = classifyRegen(attempt("<html>a</html>"), attempt("<html>a</html>"));
    expect(r.ok).toBe(true);
    expect(r).toEqual({ ok: true, bytes: "<html>a</html>" });
  });

  test("a source that was never engaged is NOT degradation — an fr-less campaign must stay verifiable", () => {
    // This is the regression guard on the guard: treating `absent` as degradation would give
    // every repo without af/fr/bd an unclearable finding on every check, which is the coercion
    // shape B1 removed from Gate 4's anchor check.
    const r = classifyRegen(attempt("<html>a</html>", ABSENT), attempt("<html>a</html>", ABSENT));
    expect(r).toEqual({ ok: true, bytes: "<html>a</html>" });
  });

  test("a reduced-fidelity reader -> ok:true + degraded naming it (the gate withholds the drift verdict)", () => {
    const degraded: SourceStatuses = { af: "export", fr: "log-fallback", bd: "read" };
    const r = classifyRegen(attempt("<html>a</html>", degraded), attempt("<html>a</html>", degraded));
    expect(r.ok).toBe(true);
    expect(r.ok && r.degraded).toBe("fr: log fallback (reduced fidelity)");
  });

  test("degradation in EITHER attempt is reported, and both readers are named together", () => {
    const a: SourceStatuses = { af: "ledger-fallback", fr: "export", bd: "read" };
    const b: SourceStatuses = { af: "export", fr: "log-fallback", bd: "read" };
    const r = classifyRegen(attempt("<html>a</html>", a), attempt("<html>a</html>", b));
    expect(r.ok && r.degraded).toBe("af: ledger fallback (reduced fidelity); fr: log fallback (reduced fidelity)");
  });

  test("two DISAGREEING attempts -> ok:false: an unstable generator has no well-defined 'expected' side", () => {
    const r = classifyRegen(attempt("<html>line1\nline2</html>"), attempt("<html>line1\nCHANGED</html>"));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("NOT reproducible within a single 'rk check' run");
    expect(r.ok === false && r.reason).toContain("first at line 2");
    // fail closed, but never as drift: the word STALE must not be claimed here
    expect(r.ok === false && r.reason).toContain("NO drift verdict can be drawn");
  });

  test("non-reproducibility OUTRANKS degradation — an unstable read is not merely low-fidelity", () => {
    const degraded: SourceStatuses = { af: "export", fr: "log-fallback", bd: "read" };
    const r = classifyRegen(attempt("<html>a</html>", degraded), attempt("<html>b</html>", degraded));
    expect(r.ok).toBe(false);
  });
});

// The end-to-end half. `fr` is pointed at a guaranteed-absent binary while `.frontier/log.jsonl`
// EXISTS, which is precisely src/store/fr-load.ts's `present: true, degraded: true` state ->
// `fr: log-fallback`. Every render/check in this block therefore runs with a reduced-fidelity fr
// reader, and the artifact difference below must NOT be called drift.
describe("rk check (end to end): a difference measured against a degraded read is never a STALE", () => {
  const FAKE_CMD = ["/definitely/does/not/exist/rk-check-regen-test-binary"] as const;

  function scaffold(prefix: string): string {
    const root = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(root);
    mkdirSync(join(root, "argument"), { recursive: true });
    mkdirSync(join(root, ".frontier"), { recursive: true });
    // A real (if minimal) fr ledger: present on disk, so `fr` is ENGAGED, but the binary is
    // unreachable -> only the reduced-fidelity log reader can serve it.
    writeFileSync(join(root, ".frontier", "log.jsonl"), "");
    return root;
  }

  test("degraded fr + hand-edited artifact -> ERROR that explicitly refuses to attribute drift", async () => {
    const root = scaffold("rk-check-regen-degraded-");
    mkdirSync(join(root, "build", "site"), { recursive: true });
    writeFileSync(join(root, "build", "site", "index.html"), "<html>hand-edited, not a real render</html>\n");
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(
      join(root, ".rk", "generated.json"),
      JSON.stringify({ schema_version: "1", entries: [{ path: "build/site/index.html", generator: "render-site-v1" }] }),
    );

    const lines: string[] = [];
    const code = await checkCommand(["--root", root], { log: (l: string) => lines.push(l) }, loadSnapshot, {
      frCommand: FAKE_CMD,
      afCommand: FAKE_CMD,
    });
    const text = lines.join("\n");

    expect(text).toContain("NOT attributable to artifact drift");
    expect(text).toContain("fr: log fallback (reduced fidelity)");
    expect(text).not.toContain("build/site/index.html is STALE");
    expect(code).toBe(1); // fail closed: unattributable is still never "fresh"
  });

  // Proves the PROBE IS WIRED, not merely that `classifyRegen` would classify correctly if it
  // were called twice. A single regeneration cannot detect this state at all: it would compare
  // the artifact against whichever of the two mutually-inconsistent renders it happened to get
  // and report a confident STALE. The fake `fr` below serves two invocations (one whole
  // regeneration: buildGraphDocument's join read + loadFrResiduals's display read) and then fails,
  // so the second regeneration sees a different fr source status and renders different bytes —
  // exactly the "external state is now a freshness input" hazard rk-xbsx was filed for.
  test("an fr export that stops answering mid-check -> 'not reproducible', never a STALE", async () => {
    const root = scaffold("rk-check-regen-unstable-");
    const stateDir = mkdtempSync(join(tmpdir(), "rk-check-regen-state-"));
    dirs.push(stateDir);
    const counter = join(stateDir, "count");
    const script = join(stateDir, "fake-fr");
    writeFileSync(
      script,
      `#!/bin/sh\nn=$(cat "${counter}" 2>/dev/null || echo 0)\nn=$((n+1))\necho "$n" > "${counter}"\n` +
        `if [ "$n" -le 2 ]; then echo '{"log":[],"verdicts":[],"derived":{"deadRoutes":[]}}'; exit 0; fi\nexit 1\n`,
      { mode: 0o755 },
    );

    mkdirSync(join(root, "build", "site"), { recursive: true });
    writeFileSync(join(root, "build", "site", "index.html"), "<html>whatever is on disk</html>\n");
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(
      join(root, ".rk", "generated.json"),
      JSON.stringify({ schema_version: "1", entries: [{ path: "build/site/index.html", generator: "render-site-v1" }] }),
    );

    const lines: string[] = [];
    const code = await checkCommand(["--root", root], { log: (l: string) => lines.push(l) }, loadSnapshot, {
      frCommand: [script],
      afCommand: FAKE_CMD,
    });
    const text = lines.join("\n");

    expect(text).toContain("NOT reproducible within a single 'rk check' run");
    expect(text).not.toContain("build/site/index.html is STALE");
    expect(code).toBe(1); // fail closed
  });

  test("degraded fr + a genuine `rk render` artifact -> still CLEAN (a degraded read that agrees is no defect)", async () => {
    const root = scaffold("rk-check-regen-degraded-clean-");
    const renderLines: string[] = [];
    const rc = await renderCommand(["--root", root], { log: (l: string) => renderLines.push(l) }, {
      frCommand: FAKE_CMD,
      afCommand: FAKE_CMD,
    });
    expect(rc).toBe(0);

    const lines: string[] = [];
    const code = await checkCommand(["--root", root], { log: (l: string) => lines.push(l) }, loadSnapshot, {
      frCommand: FAKE_CMD,
      afCommand: FAKE_CMD,
    });
    const text = lines.join("\n");

    expect(text).not.toContain("NOT attributable to artifact drift");
    expect(text).not.toContain("build/site/index.html is STALE");
    expect(text).not.toContain("cannot be regenerated for verification");
    expect(code).toBe(0);
  });

  // LB4 (2026-08-03 M3-close review): `regenerateOnce` summed only TWO of the producer's four
  // structural-loss classes, so a build refused for a corrupt retraction ledger reported
  // "0 structural-loss entries: see rk render for detail" — a count that contradicts the refusal it
  // is explaining, and a pointer to a command that (before LB4) enumerated nothing either. RED
  // before both halves were fixed.
  test("LB4: a corrupt retraction ledger makes the Gate 7 regeneration refuse with a NONZERO, NAMED loss count", async () => {
    const root = scaffold("rk-check-regen-retraction-loss-");
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "retractions.jsonl"), "{truncated\n");
    writeFileSync(
      join(root, ".rk", "generated.json"),
      JSON.stringify({ schema_version: "1", entries: [{ path: "build/site/index.html", generator: "render-site-v1" }] }),
    );

    const lines: string[] = [];
    const code = await checkCommand(["--root", root], { log: (l: string) => lines.push(l) }, loadSnapshot, {
      frCommand: FAKE_CMD,
      afCommand: FAKE_CMD,
    });
    const text = lines.join("\n");

    expect(text).toContain("structurally incomplete");
    expect(text).toContain("1 structural-loss entry");
    expect(text).not.toContain("0 structural-loss entries");
    expect(text).toContain("retraction store:"); // the entry is NAMED, not deferred to another command
    expect(code).toBe(1);
  });
});
