// PURITY: pure — no fs/network/clock (L3). Gate 6 (report-shards) TeX-comment-header + `\include`
// parsing helpers, split out of shards.ts to stay under CLAUDE.md's 280-line shard cap (the R12
// shardsPrefix-requiredness addition, src/gates/shards.ts, needed the room). Ground truth:
// docs/gate-contracts.md "Gate 6 — report-shards" Inputs table, ported from
// check-report-shards.sh:28-30,62-64,83-84.

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

export interface HeaderHit {
  value: string;
  line: number;
}

/** `sed 's/^% KEY:[[:space:]]*(.+)$/\1/p' | head -n 1` equivalent — first-wins per
 * docs/gate-contracts.md Gate 6 Inputs table ("a duplicate line within the same file is not an
 * error"). */
export function firstHeader(content: string, key: string): HeaderHit | undefined {
  const re = new RegExp(`^% ${key}:\\s*(.+)$`);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (m) return { value: m[1]!, line: i + 1 };
  }
  return undefined;
}

/** `mapfile` equivalent — every matching line, in order (SHARD-SUMMARY's cardinality IS checked,
 * unlike the other three headers — see Gate 6 Inputs table). */
export function allHeaders(content: string, key: string): string[] {
  const re = new RegExp(`^% ${key}:\\s*(.+)$`);
  return content
    .split("\n")
    .map((line) => re.exec(line)?.[1])
    .filter((v): v is string => v !== undefined);
}

/** Every `\include{...}` target on a non-comment line of `content`, in order (check-report-
 * shards.sh:28-30). A comment line (leading `%`, after trimming) is excluded entirely. */
export function parseIncludes(content: string): Array<{ target: string; line: number }> {
  const out: Array<{ target: string; line: number }> = [];
  const re = /\\include\{([^}]+)\}/g;
  content.split("\n").forEach((line, idx) => {
    if (/^\s*%/.test(line)) return;
    let m: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) last = m;
    if (last) out.push({ target: last[1]!, line: idx + 1 });
  });
  return out;
}
