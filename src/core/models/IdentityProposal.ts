/**
 * @module core/models/IdentityProposal
 *
 * A candidate identity conclusion produced by automated computation.
 * Structurally distinct from BusinessRecord: it omits every
 * authoritative-only field (id, authority fingerprint, and all pipeline
 * status fields), so it cannot be structurally assigned wherever a
 * BusinessRecord is required.
 *
 * Per the frozen Family E architecture, an IdentityProposal is never
 * authoritative and must never be written to the authority boundary
 * directly. It exists only as a future input to a Confirmation
 * responsibility, which does not yet exist in this codebase. This type
 * is not consumed by any production pipeline code.
 */

import type {
  CandidateFields,
  CandidateFingerprint,
} from "./CandidateIdentity.js";
import type { UUID } from "../types/common.js";

export type { CandidateFingerprint };

export interface IdentityProposal extends CandidateFields {
  readonly candidateFingerprint: CandidateFingerprint;

  /**
   * The raw_results.id this proposal was computed from. Required per
   * ADR-7: proposals must self-describe their evidence lineage rather
   * than relying on a side-channel provenance parameter, so that "what
   * a confirmation evaluated" remains traceable back to a specific
   * piece of evidence.
   */
  readonly rawResultId: UUID;

  // Deliberately absent, and must remain absent:
  //   id                    — assigned only when a record becomes authoritative
  //   fingerprint           — the authority-boundary uniqueness key
  //   normalizationStatus   — pipeline-mechanics status, authoritative-record-only
  //   deduplicationStatus   — pipeline-mechanics status, authoritative-record-only
  //   exportStatus          — pipeline-mechanics status, authoritative-record-only
}
