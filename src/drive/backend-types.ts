// PURITY: pure — no fs/network/clock (L3). M3.2's PINNED backend interface (IMPLEMENTATION_PLAN.md
// M3.2 row: "Backends: claude + codex adapters, backend registry with per-role×tier assignment +
// fallbacks; family identity recorded for the cross-vendor rule"). This file's shape is the
// contract the parallel M3.3 session/cache-manager lane (src/drive/{session-manager,scheduler,
// accounting,session}.ts) imports READ-ONLY — do not change the method shape here without
// updating that lane's briefing first.
//
// `WorkerBackend` is the one seam every headless CLI (claude, codex, a future backend) implements:
// `createSession` opens the shared-context turn ONCE per (role, tier, claim) per docs/worker-
// contract.md section (a) — a session-capable backend (claude) actually spawns a real session and
// sends `sharedContext`; a `dispatchModel:"flat"` backend (codex, per the Q1 ruling) sends
// NOTHING yet and returns a synthetic id, remembering `sharedContext` itself so `runTurn` can
// re-assemble a flat prompt on every call. `runTurn` dispatches exactly one item as one turn and
// returns the process-level `WorkerResult` envelope (src/drive/worker-result.ts) — never a
// verdict document directly; `bindVerdicts`/`resolveTurn` (already landed, M3.1) are what turn
// that envelope into a verdict, unchanged by this WP.
//
// `SessionSpec`/`TurnItem` are this WP's own request-shape slice — narrower than docs/
// worker-contract.md section (b)'s full `WorkerRequest` (no `budget`, no discriminated
// `session.mode`): the full request/session-isolation validation is src/drive/session.ts's job
// (M3.1, unchanged here). This module only carries what a `WorkerBackend` IMPLEMENTATION needs to
// do its own job — the driver loop that constructs a full `WorkerRequest` and calls through
// `validateSessionRequest` before ever reaching a backend is a future WP's responsibility.

import type { ModelFamily, Role, Tier } from "./vocab";
import type { WorkerResult, WorkerUsage } from "./worker-result";
import type { ConfirmedVerifierFence } from "./verifier-fence";

/** What `createSession` needs: the shared context to send once, and enough of the isolation tuple
 * (docs/worker-contract.md section (a)) for a backend to log/attribute the session correctly.
 * `model` is remembered by the backend implementation itself (there is no `model` field on
 * `TurnItem` below) — a resumed turn must use the SAME model the session was created with, never
 * a value re-derived from the turn. */
export interface SessionSpec {
  role: Role;
  tier: Tier;
  claimId: string;
  model: string;
  sharedContext: string;
  timeoutMs: number;
}

/** What `runTurn` needs for exactly one item. `outputSchemaRef` names the raw-output shape
 * (shape (a), src/drive/verdict-raw.ts) the worker should target for this tier — NOT the
 * driver-constructed document (shape (b)); a backend MAY use it to constrain generation (e.g. a
 * `--json-schema`-style CLI flag) but is not required to. `maxOutputTokens` is this turn's own
 * output cap; `timeoutMs` is this turn's own deadline — distinct from `SessionSpec.timeoutMs`,
 * which bounds only session creation. */
export interface TurnItem {
  itemId: string;
  turnId: string;
  content: string;
  /** Structured, store-confirmed evidence for the only inputs this verifier turn may treat as
   * already verified. The rendered content repeats it for the worker process; prose cannot add. */
  assumedVerified?: readonly ConfirmedVerifierFence[];
  outputSchemaRef: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

/** One registered backend. `modelFamily` is a closed driver-registry value (`src/drive/vocab.ts`'s
 * `MODEL_FAMILIES`) — set once, at construction, from the backend/model pairing the registry knows
 * about, NEVER read from anything the backend process itself prints (docs/worker-contract.md
 * section (e), review blocker 5's lesson, restated for this WP: a backend module must not let its
 * own `runTurn` infer `modelFamily` from response content). `capabilities.sessionResume` mirrors
 * `src/drive/vocab.ts`'s `DispatchModel` at the type level (`true` = "session", `false` = "flat")
 * — kept as a plain boolean here (not the `DispatchModel` string enum) because this interface is
 * pinned to exactly this shape; a caller needing the string form maps
 * `sessionResume ? "session" : "flat"` itself. */
export interface WorkerBackend {
  name: string;
  modelFamily: ModelFamily;
  capabilities: { sessionResume: boolean };
  /** M3 repair-wave blocker 8 (docs/reviews/2026-07-19-m3-milestone-review-codex.md): opening a
   * session-capable backend's session is not free — e.g. `ClaudeBackend.createSession` (src/drive/
   * backend-claude.ts) spawns a REAL `claude -p` call carrying `sharedContext` and gets back a real
   * usage envelope. `usage` is OPTIONAL/additive (a `dispatchModel:"flat"` backend that sends
   * nothing on `createSession`, per the Q1 ruling, legitimately has none to report, and every
   * pre-existing `{ sessionId }`-only implementation still type-checks unchanged) so the SC4
   * accounting layer (src/drive/report.ts, src/drive/l5-dispatch.ts) is no longer STRUCTURALLY
   * blind to session-creation cost — a caller that has real usage to report now has somewhere to
   * put it, closing the "session-creation usage... absent" accounting gap. Populating this field on
   * `ClaudeBackend`/`CodexBackend` themselves is a follow-up (out of this WP's file scope). */
  createSession(spec: SessionSpec): Promise<{ sessionId: string; usage?: WorkerUsage }>;
  runTurn(sessionId: string, item: TurnItem): Promise<WorkerResult>;
}
