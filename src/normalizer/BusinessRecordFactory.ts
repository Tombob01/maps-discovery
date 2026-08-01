/**
 * @module normalizer/BusinessRecordFactory
 *
 * The single canonical creator of BusinessRecord in this codebase.
 * Extracted verbatim from BusinessNormalizer.normalize()'s prior inline
 * shaping logic.
 *
 * TRANSITIONAL API NOTE (Phase 2 -> Phase 3):
 * create(candidate: CandidateBundle) is temporary API surface. It exists
 * solely so BusinessNormalizer can keep producing a BusinessRecord for the
 * still-live production pipeline during the Phase 2 -> Phase 3 transition.
 * It does NOT require a Confirmation and therefore does not yet fully
 * satisfy the Family E authority invariant. Before Phase 3 completion this
 * must be hardened to require (confirmation: Confirmation, proposal:
 * IdentityProposal) instead. No new callers of the CandidateBundle-based
 * overload may be added.
 */

import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { BusinessID } from "../core/types/common.js";
import type { CandidateBundle } from "./CandidateComputer.js";

export class BusinessRecordFactory {
  static create(candidate: CandidateBundle): BusinessRecord {
    const { computedFingerprint, ...candidateFields } = candidate;
    const id = computedFingerprint as unknown as BusinessID;

    return {
      ...candidateFields,
      id,
      fingerprint: computedFingerprint,
      normalizationStatus: "complete",
      deduplicationStatus: "pending",
      exportStatus: "pending",
    };
  }
}
