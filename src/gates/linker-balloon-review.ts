// PURITY: pure — no fs/network/clock (L3). Split from linker-parse.ts (rk-c83, hard-cap-280 wave):
// the balloon mandatory-review routing predicate — a DECISION rule over an already-parsed
// `BalloonCounter`, not part of the shard-scanning job `linker-parse.ts` owns. Consumed by
// `linker-graph.ts` (checkMandatoryReview) and `linker-render.ts` (the board-facing flag).

import type { BalloonCounter } from "../graph/types";

/** M3 blocker 7c: true iff a shard's persisted balloon state has crossed the mandatory-review
 * threshold `src/drive/driver-balloon.ts`'s `routeBalloon` defines — reconstructed here from the
 * persisted counter alone, since the routing decision ITSELF is never persisted (only the count +
 * classification history; see `driver-run.ts`'s `handleBalloon`, which marks the shard on EVERY
 * balloon, not only mandatory-review ones). Two independent ways in:
 *   - a REPEAT balloon (`count >= 2`) is ALWAYS mandatory-review regardless of classification
 *     (`routeBalloon`'s `priorBalloonCount >= 1` clause — the persisted `count` already includes
 *     the balloon that made it a repeat, so `>= 2` here is `>= 1` prior-count there);
 *   - a `genuine-gap` classification is ALWAYS mandatory-review even on the very first balloon,
 *     so its presence ANYWHERE in the classification history is sufficient on its own. */
export function isMandatoryReview(balloons: BalloonCounter): boolean {
  return balloons.count >= 2 || balloons.classifications.includes("genuine-gap");
}
