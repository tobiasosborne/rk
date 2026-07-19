// PURITY: pure — no fs/network/clock (L3). Minimal HTML string helpers for the render core, zero
// runtime deps (L4). The render surfaces build strings directly rather than pulling a templating
// dependency; the ONE thing that must never be got wrong is escaping — a registry `contract` or an
// fr `artifact` free-text string rendered raw would both corrupt the markup AND let content
// masquerade as structure (a truthfulness failure, not merely an XSS one). `esc` is the single
// escape function every surface routes text through; test/render/html.test.ts pins it.

/** Escapes the five HTML-significant characters so arbitrary text (a contract, a path, a message)
 * renders as literal text, never as markup. Ampersand first so it never double-escapes the
 * entities the later replacements introduce. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes text destined for a double-quoted attribute value. Same set as `esc` (which already
 * handles `"`); named separately so call sites read intentionally at attribute boundaries. */
export function escAttr(text: string): string {
  return esc(text);
}

/** A `<span>` badge carrying a class list and escaped text — the atom every status/taint chip is
 * built from. */
export function badge(cssClasses: string[], text: string): string {
  return `<span class="${escAttr(cssClasses.join(" "))}">${esc(text)}</span>`;
}

/** Joins class names, dropping empties, for inline use. */
export function classAttr(...classes: (string | false | undefined)[]): string {
  return escAttr(classes.filter((c): c is string => !!c).join(" "));
}
