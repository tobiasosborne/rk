// PURITY: pure — no fs/network/clock (L3). The encoding-layer extraction of the single JSON object
// a verifier/prover turn is required to be, PLUS a DIAGNOSTIC-ONLY classifier of WHY an extraction
// failed. Split out of src/drive/driver-live.ts so the classifier and the extractor share ONE
// fence-strip implementation (never a forked second copy) and so this validity-adjacent logic is a
// pure, individually-tested unit.
//
// ACCEPTANCE vs DIAGNOSIS (rk-d1n): `extractSingleJsonObject` is the ACCEPTANCE rule (whole-remainder
// single balanced object; ambiguous still fails). `classifyExtractionFailure` is DIAGNOSIS ONLY — it
// labels a failure's mode for the `parse-failed` evidence record and changes NO acceptance semantics.
// The M3.5 live evidence (attempt 11): claude-as-verifier bootstrap-challenge turns died `worker exit
// 12` while the record banked only a 500-char snippet with no parse-error detail, so an unterminated
// string (model stopped mid-`reason`) could not be told apart from trailing content after the object.

/** The single JSON object a turn must be, or a failure. See `classifyExtractionFailure` for the WHY. */
export function extractSingleJsonObject(rawText: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  const candidate = stripSingleFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { ok: false };
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return { ok: true, value: parsed as Record<string, unknown> };
  return { ok: false };
}

/** Removes at most one surrounding ```-fence from `s` (after trimming). A fence is recognized only
 * when the opening line is a bare ``` optionally followed by a simple language tag (e.g. ```json)
 * and a matching closing ``` exists — otherwise the input is returned trimmed but unchanged, so a
 * value that merely CONTAINS backticks is never mangled. */
export function stripSingleFence(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const firstNl = t.indexOf("\n");
  if (firstNl === -1) return t;
  const tag = t.slice(3, firstNl).trim();
  if (tag !== "" && !/^[A-Za-z0-9_-]+$/.test(tag)) return t; // opening line carried more than a language tag — not a clean fence
  const closeIdx = t.lastIndexOf("```");
  if (closeIdx <= firstNl) return t; // no closing fence after the opening line
  return t.slice(firstNl + 1, closeIdx).trim();
}

/** The diagnostic failure-mode label for a rejected extraction. DIAGNOSTIC-ONLY — acceptance
 * semantics never read this. */
export type ParseFailureClass = "unterminated" | "trailing-content" | "no-object" | "multiple-objects" | "other";

/** Classifies WHY `extractSingleJsonObject` rejected `rawText`, and captures the `JSON.parse` error
 * message. Pure, cheap, DIAGNOSTIC-ONLY (ambiguous output still FAILS; this only labels the mode for
 * the evidence record). Classification rule (post-fence candidate):
 *   1. candidate JSON.parses to a valid non-object value (array/primitive) → "no-object"
 *   2. else scan a balanced top-level {…} from the first non-whitespace char:
 *      - a string or brace is still open at end-of-text → "unterminated" (the model stopped mid-object)
 *      - the object closes, then another "{" follows → "multiple-objects"
 *      - the object closes, then other non-whitespace follows → "trailing-content"
 *      - the object closes with nothing after but JSON.parse still failed (malformed internals), or an
 *        object appears only AFTER leading non-JSON text → "other"
 *      - no "{" appears anywhere → "no-object"
 * `parseError` is "" only when the candidate parsed cleanly (case 1); otherwise the JSON.parse message
 * (e.g. "Unterminated string in JSON at position N"). */
export function classifyExtractionFailure(rawText: string): { classification: ParseFailureClass; parseError: string } {
  const candidate = stripSingleFence(rawText);
  let parseError = "";
  try {
    const parsed = JSON.parse(candidate);
    // Parsed cleanly. The extractor still rejected it, so it is not the required single object — an
    // array or primitive means no top-level object was emitted. (A clean object would have been
    // ACCEPTED and this function never called; classify defensively as "other" if it somehow is.)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return { classification: "other", parseError };
    return { classification: "no-object", parseError };
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }
  const scan = scanTopLevelObject(candidate);
  if (scan.kind === "unterminated") return { classification: "unterminated", parseError };
  if (scan.kind === "no-object") {
    // No object begins the candidate. If one appears later (leading prose/CoT then a JSON object),
    // that is a surrounded object, not a genuine "no object at all".
    return { classification: candidate.includes("{") ? "other" : "no-object", parseError };
  }
  const rest = candidate.slice(scan.end).replace(/^\s+/, "");
  if (rest.length === 0) return { classification: "other", parseError }; // balanced braces, object internals malformed
  if (rest.startsWith("{")) return { classification: "multiple-objects", parseError };
  return { classification: "trailing-content", parseError };
}

type ScanResult = { kind: "no-object" } | { kind: "unterminated" } | { kind: "closed"; end: number };

/** Scans `s` for a balanced top-level `{…}` starting at its first non-whitespace character, honoring
 * JSON string quoting/escapes so a brace or quote INSIDE a string never miscounts. Returns where the
 * first top-level object closes (`end`, exclusive), or `unterminated` if a string/brace is still open
 * at end-of-text, or `no-object` if the first non-whitespace char is not `{`. */
function scanTopLevelObject(s: string): ScanResult {
  let i = 0;
  while (i < s.length && isWhitespace(s[i]!)) i++;
  if (i >= s.length || s[i] !== "{") return { kind: "no-object" };
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { kind: "closed", end: i + 1 };
    }
  }
  return { kind: "unterminated" };
}

function isWhitespace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";
}
