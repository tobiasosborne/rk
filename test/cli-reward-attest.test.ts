// Tests for `rk reward attest` (src/cli/reward-attest.ts, rk-tlwb): the ONE writer of the
// provenance records Gate 8 Check 4b's independence route reads. What is load-bearing here is not
// that a file appears — it is that the file cannot say something untrue without an operator
// explicitly typing the lie: the claim must exist in the registry, the author seam is never
// invented or defaulted from the running process, a cited source must be a file that exists, the
// reviewed-bytes hash is derived from the shard on disk rather than asserted, and an existing
// record is never silently clobbered. The command then re-runs the real backing decision and
// reports what the gate will actually say, including when the answer is "this does not back".
//
// L1 red-green: written before src/cli/reward-attest.ts existed (import error = RED); each
// assertion re-reddened by perturbing the implementation (see the wave report).

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rewardDispatch } from "../src/cli/reward";
import { parseProvenanceRecord } from "../src/reward/provenance-record";
import { sha256Hex } from "../src/gates/sha256";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

const SHARD = [
  "---",
  "id: lem-a",
  "kind: lemma",
  "status: proved-mod-audit",
  "af: none",
  "prover: claude|claude|claude-opus-4-8|claim-session",
  "provenance: .rk/provenance-lem-a.json",
  "contract: A claim an independent verifier examined.",
  "---",
  "",
  "Body.",
].join("\n");

/** A repo holding one pma claim shard that already points at its canonical record path. */
function repo(shard = SHARD): string {
  const root = mkdtempSync(join(tmpdir(), "rk-attest-"));
  dirs.push(root);
  mkdirSync(join(root, "argument"), { recursive: true });
  writeFileSync(join(root, "argument", "lem-a.md"), shard, "utf8");
  return root;
}

const ARGS = (root: string, ...extra: string[]) => [
  "attest", "--root", root,
  "--claim", "lem-a",
  "--author", "gpt|codex|gpt-5.6-sol|019fe0f0-f003-7eb0-b754-3a856f591a8c",
  "--role", "verifier",
  "--reason", "Hostile verification survived; the balanced-split constant was corrected.",
  ...extra,
];

describe("rk reward attest — writes the record Check 4b reads", () => {
  test("a complete attestation writes a schema-valid record and reports that it backs", async () => {
    const root = repo();
    const { out, lines } = capture();
    expect(await rewardDispatch(ARGS(root), out)).toBe(0);

    const path = join(root, ".rk", "provenance-lem-a.json");
    expect(existsSync(path)).toBe(true);
    const parsed = parseProvenanceRecord(readFileSync(path, "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.claimId).toBe("lem-a");
    expect(parsed.record.role).toBe("verifier");
    // The reviewed-bytes hash is DERIVED from the shard on disk, never taken on faith.
    expect(parsed.record.claimSha256).toBe(sha256Hex(new TextEncoder().encode(SHARD)));
    expect(lines.join("\n")).toContain("backs");
  });

  test("--claim-sha256 records the bytes actually reviewed, and the command says it will not back", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await rewardDispatch(ARGS(root, "--claim-sha256", "a".repeat(64)), out);
    expect(code).toBe(0);
    const parsed = parseProvenanceRecord(readFileSync(join(root, ".rk", "provenance-lem-a.json"), "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.claimSha256).toBe("a".repeat(64));
    expect(lines.join("\n")).toContain("does NOT back");
  });
});

describe("rk reward attest — a record it cannot know to be true is refused", () => {
  test("a claim id that is no registry shard is refused and nothing is written", async () => {
    const root = repo();
    const { out, lines } = capture();
    const args = ARGS(root).map((a) => (a === "lem-a" ? "lem-ghost" : a));
    expect(await rewardDispatch(args, out)).toBe(1);
    expect(existsSync(join(root, ".rk", "provenance-lem-ghost.json"))).toBe(false);
    expect(lines.join("\n")).toContain("lem-ghost");
  });

  test("a non-canonical author seam is refused; the command never supplies one of its own", async () => {
    const root = repo();
    const { out } = capture();
    const args = ARGS(root).map((a) => (a.startsWith("gpt|") ? "codex" : a));
    expect(await rewardDispatch(args, out)).toBe(1);
    expect(existsSync(join(root, ".rk", "provenance-lem-a.json"))).toBe(false);
  });

  test("--author, --role, --reason and --claim are all required; a missing one is a usage error", async () => {
    for (const flag of ["--claim", "--author", "--role", "--reason"]) {
      const root = repo();
      const args = ARGS(root);
      const i = args.indexOf(flag);
      args.splice(i, 2);
      const { out } = capture();
      expect(await rewardDispatch(args, out)).toBe(2);
      expect(existsSync(join(root, ".rk", "provenance-lem-a.json"))).toBe(false);
    }
  });

  test("--source naming a path absent from the repo is refused (a cited transcript must exist)", async () => {
    const root = repo();
    const { out, lines } = capture();
    expect(await rewardDispatch(ARGS(root, "--source", "docs/worker-output/never-ran.log"), out)).toBe(1);
    expect(existsSync(join(root, ".rk", "provenance-lem-a.json"))).toBe(false);
    expect(lines.join("\n")).toContain("never-ran.log");

    mkdirSync(join(root, "docs", "worker-output"), { recursive: true });
    writeFileSync(join(root, "docs", "worker-output", "ran.log"), "model: gpt-5.6-sol\n", "utf8");
    const second = capture();
    expect(await rewardDispatch(ARGS(root, "--source", "docs/worker-output/ran.log"), second.out)).toBe(0);
    const parsed = parseProvenanceRecord(readFileSync(join(root, ".rk", "provenance-lem-a.json"), "utf8"));
    expect(parsed.ok && parsed.record.sourceRef).toBe("docs/worker-output/ran.log");
  });

  test("an existing record is never silently overwritten; --force is explicit", async () => {
    const root = repo();
    const first = capture();
    expect(await rewardDispatch(ARGS(root), first.out)).toBe(0);
    const original = readFileSync(join(root, ".rk", "provenance-lem-a.json"), "utf8");

    const second = capture();
    const changed = ARGS(root).map((a) => (a.startsWith("Hostile") ? "A different, later story." : a));
    expect(await rewardDispatch(changed, second.out)).toBe(1);
    expect(readFileSync(join(root, ".rk", "provenance-lem-a.json"), "utf8")).toBe(original);
    expect(second.lines.join("\n")).toContain("--force");

    const third = capture();
    expect(await rewardDispatch([...changed, "--force"], third.out)).toBe(0);
    expect(readFileSync(join(root, ".rk", "provenance-lem-a.json"), "utf8")).not.toBe(original);
  });

  test("--out is confined to a .json file directly under .rk/ — no traversal, no nesting", async () => {
    for (const out of ["../escape.json", ".rk/nested/rec.json", "docs/rec.json", ".rk/rec.txt"]) {
      const root = repo();
      const cap = capture();
      expect(await rewardDispatch(ARGS(root, "--out", out), cap.out)).toBe(1);
      expect(existsSync(join(root, ".rk"))).toBe(false);
    }
  });
});

// REPAIR WAVE 2026-08-12, Tier A finding 1 (docs/reviews/2026-08-12-waveA-tlwb-io5l-codex.md).
// The reviewer's exploit: the command hashed the shard, WROTE the record, and only then printed
// "add this `provenance:` line to the frontmatter" — an instruction whose execution changes the
// very bytes the record had just bound, so an operator who followed the tool's own next-step
// produced a record `rk check` immediately reports as stale. The declaration is now a
// PRECONDITION of hashing: no record is written until the shard already points at it.
describe("rk reward attest — the printed next-step can never invalidate the record", () => {
  const UNDECLARED = SHARD.replace("provenance: .rk/provenance-lem-a.json\n", "");

  test("a shard that does not declare the record yet is refused BEFORE the hash is taken", async () => {
    const root = repo(UNDECLARED);
    const { out, lines } = capture();
    expect(await rewardDispatch(ARGS(root), out)).toBe(1);
    expect(existsSync(join(root, ".rk", "provenance-lem-a.json"))).toBe(false);
    const text = lines.join("\n");
    expect(text).toContain("provenance: .rk/provenance-lem-a.json");
    expect(text).toContain("argument/lem-a.md");
    expect(text).toContain("re-run");
  });

  test("following the printed instruction and re-running binds the FINAL bytes and backs", async () => {
    const root = repo(UNDECLARED);
    const first = capture();
    expect(await rewardDispatch(ARGS(root), first.out)).toBe(1);

    // The operator does exactly what the refusal told them to do.
    writeFileSync(join(root, "argument", "lem-a.md"), SHARD, "utf8");
    const second = capture();
    expect(await rewardDispatch(ARGS(root), second.out)).toBe(0);
    const parsed = parseProvenanceRecord(readFileSync(join(root, ".rk", "provenance-lem-a.json"), "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Bound to the bytes that CARRY the declaration — the post-instruction bytes, not the pre-.
    expect(parsed.record.claimSha256).toBe(sha256Hex(new TextEncoder().encode(SHARD)));
    expect(second.lines.join("\n")).toContain("backs");
  });

  test("the derived-hash record states which bytes the author must have reviewed", async () => {
    const root = repo();
    const { out, lines } = capture();
    expect(await rewardDispatch(ARGS(root), out)).toBe(0);
    expect(lines.join("\n")).toContain("AS THEY ARE NOW");
  });
});

describe("rk reward attest — help", () => {
  test("`rk reward attest --help` prints usage and writes nothing", async () => {
    const root = repo();
    const { out, lines } = capture();
    expect(await rewardDispatch(["attest", "--help", "--root", root], out)).toBe(0);
    expect(existsSync(join(root, ".rk"))).toBe(false);
    expect(lines.join("\n")).toContain("rk reward attest");
  });
});
