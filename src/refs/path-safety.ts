// PURITY: pure — no fs/network/clock (L3). Guards against path traversal when a repo-relative
// path recorded in refs/manifest/{sources.lock.json,SOURCES.md} is joined into a real
// filesystem path (src/refs/status.ts, quote-locate.ts, add.ts).
//
// DIVERGENCE from fetch-refs.py (TJO correction, 2026-07-17: AISM is a reference implementation,
// not canon — divergences are expected and reported, not treated as parity breaks). Python's
// `install()` (fetch-refs.py:137-140) joins a lock-file `path` straight into a filesystem path
// with no validation at all: a malformed or malicious sources.lock.json entry
// (`path: "../../etc/passwd"`) would write outside refs/. Neither PRD C7 nor
// docs/gate-contracts.md specifies this case, but it is a genuine correctness gap, not a
// parity question. Classification: rk-correct — rk closes it, AISM does not.

/** True iff `relPath` is a safe repo-relative path: no leading `/`, no `..` path segment
 * (anywhere in the path, not just at the start), non-empty. A `..` that appears only as a
 * substring of a legitimate segment (`foo..bar`) is NOT a traversal and is accepted. */
export function isSafeRelPath(relPath: string): boolean {
  if (relPath === "") return false;
  if (relPath.startsWith("/")) return false;
  const segments = relPath.split("/");
  return segments.every((seg) => seg !== "..");
}

export function assertSafeRelPath(relPath: string): void {
  if (!isSafeRelPath(relPath)) {
    throw new Error(
      `unsafe path (traversal or absolute path rejected): '${relPath}' — refs/ paths must be ` +
        `relative and must not contain a '..' segment`,
    );
  }
}
