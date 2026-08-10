// EDGE — reads validity ledgers and hashes driver-supplied current bytes, then hands plain state to
// verifier-fence.ts's pure validator. One bad fence excludes its whole target from dispatch.

import { sha256Bytes } from "../refs/hash";
import { readL5Store } from "./l5-store-io";
import { readRetractionStore } from "./retraction-store-io";
import {
  validateVerifierFences,
  type AssumedVerified,
  type ConfirmedVerifierFence,
  type VerifierFenceCoverage,
  type VerifierFenceRefusal,
} from "./verifier-fence";

export interface FenceDispatchMember {
  itemId: string;
}

export interface AdmittedFenceDispatchMember<T extends FenceDispatchMember> {
  member: T;
  confirmedFences: ConfirmedVerifierFence[];
}

export interface FenceDispatchRefusal {
  itemId: string;
  refusals: VerifierFenceRefusal[];
}

export interface FenceDispatchScreen<T extends FenceDispatchMember> {
  admitted: Array<AdmittedFenceDispatchMember<T>>;
  refusals: FenceDispatchRefusal[];
  coverage: VerifierFenceCoverage;
}

/** Screens every structured entry belonging to `members`; coverage always counts each supplied
 * entry exactly once. Claim identities and current bytes are supplied by the driver, not inferred
 * from prose. Missing claim bytes therefore fail closed as `current-hash-missing`. */
export function screenVerifierFences<T extends FenceDispatchMember>(
  root: string,
  members: readonly T[],
  content: ReadonlyMap<string, string>,
  assumedVerified: ReadonlyMap<string, readonly AssumedVerified[]> = new Map(),
): FenceDispatchScreen<T> {
  const total = members.reduce((sum, member) => sum + (assumedVerified.get(member.itemId)?.length ?? 0), 0);
  if (total === 0) {
    return {
      admitted: members.map((member) => ({ member, confirmedFences: [] })),
      refusals: [],
      coverage: { checked: 0, total: 0, confirmed: 0, refused: 0 },
    };
  }

  const currentHashes = new Map<string, string>();
  for (const [claimId, bytes] of content) {
    currentHashes.set(claimId, sha256Bytes(new TextEncoder().encode(bytes)));
  }
  const state = { l5: readL5Store(root), retractions: readRetractionStore(root), currentHashes };
  const admitted: Array<AdmittedFenceDispatchMember<T>> = [];
  const refusals: FenceDispatchRefusal[] = [];
  let confirmed = 0;
  let refused = 0;
  for (const member of members) {
    const result = validateVerifierFences(assumedVerified.get(member.itemId) ?? [], state);
    confirmed += result.coverage.confirmed;
    refused += result.coverage.refused;
    if (result.refusals.length > 0) refusals.push({ itemId: member.itemId, refusals: result.refusals });
    else admitted.push({ member, confirmedFences: result.confirmed });
  }
  return {
    admitted,
    refusals,
    coverage: { checked: total, total, confirmed, refused },
  };
}
