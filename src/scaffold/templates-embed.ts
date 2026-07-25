// EDGE — compile-time data embed, not a runtime fs read. Bun's `with { type: "text" }` import
// assertion inlines each template's contents as a string literal at BUILD time (verified: a
// `bun build --compile` binary still returns the correct text after the source .txt/.tmpl file is
// deleted from disk) — so `bun build --compile src/cli.ts --outfile dist/rk` produces one
// self-contained binary with no runtime dependency on `templates/` existing next to it (CLAUDE.md
// L4: zero runtime deps; a distributed `rk` binary must not require its own source checkout
// alongside it). `templates/manifest.json` is a plain JSON import (the same mechanism
// `src/cli/doctor.ts` already uses for `rk.compat.json`).
//
// Not PURITY-marked: these are static data imports, not logic, so the purity grep's forbidden-
// pattern scan is irrelevant here — but this file does not perform any fs/network/clock CALL
// either, so nothing here would trip it if it were marked. Left unmarked to keep the marker's
// meaning ("this file's own code was checked against the forbidden-pattern list") honest — there
// is no logic here to check.

import manifestJson from "../../templates/manifest.json";
import claudeMdTmpl from "../../templates/CLAUDE.md.tmpl" with { type: "text" };
import prdTmpl from "../../templates/PRD.md.tmpl" with { type: "text" };
import handoffTmpl from "../../templates/HANDOFF.md.tmpl" with { type: "text" };
import conventionsTmpl from "../../templates/CONVENTIONS.md.tmpl" with { type: "text" };
import findingsTmpl from "../../templates/FINDINGS.md.tmpl" with { type: "text" };
import worklogTmpl from "../../templates/docs/worklog.md.tmpl" with { type: "text" };
import definitionsReadmeTmpl from "../../templates/definitions/README.md.tmpl" with { type: "text" };
import argumentReadmeTmpl from "../../templates/argument/README.md.tmpl" with { type: "text" };
import northStarShardTmpl from "../../templates/argument/north-star.md.tmpl" with { type: "text" };

import type { Manifest } from "./manifest-types";

export const TEMPLATE_MANIFEST: Manifest = manifestJson as Manifest;

/** Keyed by the manifest's own `template` field (e.g. "CLAUDE.md.tmpl", "docs/worklog.md.tmpl") —
 * `src/scaffold/plan.ts`'s `planStamp` looks each stamped entry's template up here. Adding a new
 * `.tmpl` file requires a new import line above AND a new entry here; `test/templates/
 * templates.test.ts`'s "every .tmpl on disk is referenced by at least one stamped entry" plus this
 * WP's own `test/scaffold/templates-embed.test.ts` both catch a forgotten one (a manifest entry
 * whose template name has no match here surfaces as `planStamp`'s `<template-missing>` marker,
 * never a silent skip). */
export const TEMPLATE_TEXT: Record<string, string> = {
  "CLAUDE.md.tmpl": claudeMdTmpl,
  "PRD.md.tmpl": prdTmpl,
  "HANDOFF.md.tmpl": handoffTmpl,
  "CONVENTIONS.md.tmpl": conventionsTmpl,
  "FINDINGS.md.tmpl": findingsTmpl,
  "docs/worklog.md.tmpl": worklogTmpl,
  "definitions/README.md.tmpl": definitionsReadmeTmpl,
  "argument/README.md.tmpl": argumentReadmeTmpl,
  "argument/north-star.md.tmpl": northStarShardTmpl,
};
