/**
 * @module storage/IProposalStore
 *
 * Storage abstraction for persisted IdentityProposal snapshots.
 *
 * Per Family E's Proposal boundary and ADR-7, every produced
 * IdentityProposal is persisted verbatim at the moment it is produced,
 * so that a Confirmation can later be evaluated against a fixed,
 * inspectable artifact rather than a value re-derived on demand (which
 * would silently drift if normalizer logic changes over time).
 *
 * No uniqueness constraint exists on this store, by design (ADR-7):
 * replay/versioning semantics for proposals are explicitly undecided,
 * and this store must not silently foreclose them. save() always
 * inserts a new row. listByCandidateFingerprint() therefore returns a
 * collection, never assuming one proposal per fingerprint.
 */

import type { IdentityProposal } from "../core/models/IdentityProposal.js";
import type { CandidateFingerprint } from "../core/models/CandidateIdentity.js";
import type { UUID } from "../core/types/common.js";

/**
 * Storage-layer envelope. Keeps persistence-assigned identity (id,
 * createdAt) separate from the domain model -- IdentityProposal itself
 * never acquires a persistence-generated ID.
 */
export interface PersistedProposal {
  readonly id: UUID;
  readonly proposal: IdentityProposal;
  readonly createdAt: Date;
}

export interface IProposalStore {
  /**
   * Persists a new, immutable snapshot of the given IdentityProposal.
   * Always inserts a new row -- never updates or dedupes against an
   * existing one.
   */
  save(proposal: IdentityProposal): Promise<PersistedProposal>;

  /**
   * Fetch a single persisted proposal by its storage-assigned id.
   * Returns null if no matching row exists.
   */
  fetchById(id: UUID): Promise<PersistedProposal | null>;

  /**
   * Returns every persisted proposal sharing the given
   * candidateFingerprint, most recent first. The architecture does not
   * define a single-authoritative-proposal-per-fingerprint model, so
   * this always returns a collection, even if it contains zero or one
   * elements.
   */
  listByCandidateFingerprint(
    candidateFingerprint: CandidateFingerprint,
  ): Promise<readonly PersistedProposal[]>;
}