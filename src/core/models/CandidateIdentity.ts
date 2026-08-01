/**
 * @module core/models/CandidateIdentity
 *
 * Neutral core model shared by every projection of normalized candidate
 * identity data (BusinessRecord, IdentityProposal). Lives in core/models
 * so that domain model types do not depend on normalizer implementation
 * code — the normalizer package depends on this, not the other way
 * around.
 */

import type { ExternalIdMap, BusinessHours } from "./BusinessRecord.js";
import type { Address, GeoCoordinates } from "../types/geo.js";
import type { E164Phone, RunID, QueryID } from "../types/common.js";

/**
 * Candidate fields shared by every projection (BusinessRecord,
 * IdentityProposal), prior to fingerprint computation.
 */
export interface CandidateFields {
  readonly externalIds: ExternalIdMap;
  readonly name: string;
  readonly normalizedName: string;
  readonly address: Address;
  readonly geo: GeoCoordinates | null;
  readonly phone: string | null;
  readonly normalizedPhone: E164Phone | null;
  readonly website: string | null;
  readonly categories: readonly string[];
  readonly primaryCategory: string | null;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly hours: BusinessHours | null;
  readonly priceLevel: 1 | 2 | 3 | 4 | null;
  readonly services: readonly string[] | null;
  readonly sourceProvider: string;
  readonly sourceUrl: string | null;
  readonly collectedAt: Date;
  readonly runId: RunID;
  readonly queryId: QueryID;
}

/**
 * Branded candidate-matching key. Distinct, at the type level, from
 * Fingerprint (the authority-boundary uniqueness key on BusinessRecord),
 * even though both are produced by the same, unmodified
 * fingerprintRecord() computation. The distinction is one of meaning at
 * the proposal boundary, not of algorithm.
 */
export type CandidateFingerprint = string & {
  readonly __candidateFingerprint: unique symbol;
};
