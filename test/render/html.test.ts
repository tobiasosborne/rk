// src/render/html.ts — escaping is the one thing the render core must never get wrong: unescaped
// free-text (a contract, an fr artifact path) would corrupt markup AND let content masquerade as
// structure. These pin `esc`.

import { describe, expect, test } from "bun:test";
import { esc, badge, classAttr } from "../../src/render/html";

describe("render/html — escaping", () => {
  test("all five HTML-significant characters are escaped, ampersand first (no double-escape)", () => {
    expect(esc("<a> & \"x\" 'y'")).toBe("&lt;a&gt; &amp; &quot;x&quot; &#39;y&#39;");
  });

  test("a would-be tag injected via text renders as literal text", () => {
    expect(esc("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("badge escapes both its classes and its text", () => {
    expect(badge(["rk-s-proved"], "a<b")).toBe('<span class="rk-s-proved">a&lt;b</span>');
  });

  test("classAttr drops falsy classes and escapes", () => {
    expect(classAttr("a", false, undefined, "b")).toBe("a b");
  });
});
