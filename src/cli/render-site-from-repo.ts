// EDGE — the one repo-derived option assembly path shared by `rk render` and Gate 7 regeneration.

import { loadDefsData, type DefsData } from "../render/defs-edge";
import { loadFrResiduals, type FrResidualData } from "../render/fr-edge";
import { loadRunGallery, type RunGalleryData } from "../render/runs-edge";
import type { SourceStatuses } from "../render/diagnostics-view";
import { renderSite, type RenderedSite } from "../render/site";

export interface RepoSiteRender {
  site: RenderedSite;
  runGallery: RunGalleryData;
  defsData: DefsData;
  frResiduals: FrResidualData;
  renderWith(opts: { northStarId?: string; title?: string }): RenderedSite;
}

/** Loads every repo-derived render option exactly once, then exposes display-only rerendering. */
export function renderSiteFromRepo(
  root: string,
  doc: Parameters<typeof renderSite>[0],
  sources: SourceStatuses | undefined,
  opts: { northStarId?: string; title?: string; frCommand?: readonly string[] },
): RepoSiteRender {
  const runGallery = loadRunGallery(root);
  const defsData = loadDefsData(root);
  const frResiduals = loadFrResiduals(root, opts.frCommand ?? ["fr"]);
  const renderWith = (display: { northStarId?: string; title?: string }): RenderedSite =>
    renderSite(doc, {
      northStarId: display.northStarId,
      title: display.title,
      sources,
      runGallery,
      defsData,
      frResiduals,
    });
  return {
    site: renderWith({ northStarId: opts.northStarId, title: opts.title }),
    runGallery,
    defsData,
    frResiduals,
    renderWith,
  };
}
