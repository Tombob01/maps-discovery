/**
 * @module storage/IConfirmationStore
 *
 * Storage abstraction for persisted Confirmation events.
 *
 * Per ADR-6 (Confirmation Lifecycle Model) and Phase 3B-A's proposal
 * identity resolution, idempotency is defined by the triple
 * (proposalId, decision, confirmedBy): an identical resubmission is a
 * no-op that returns the existing persisted row, while a resubmission
 * that differs in decision or confirmedBy is stored as a new,
 * independent historical event. This store intentionally diverges from
 * IProposalStore.save() (which always inserts unconditionally, by
 * design, since proposal replay semantics are undecided per ADR-7) --
 * confirmation idempotency is a settled architectural requirement, not
 * an open question.
 *
 * No update() or delete() method exists on this interface, per ADR-3:
 * confirmation history is never overwritten or destroyed.
 */

import type { Confirmation } from "../core/models/Confirmation.js";
import type { UUID } from "../core/types/common.js";

export interface PersistedConfirmation {
  readonly id: UUID;
  readonly confirmation: Confirmation;
  readonly createdAt: Date;
}

export interface IConfirmationStore {
  /**
   * Persists a Confirmation. Idempotent on (proposalId, decision,
   * confirmedBy): an identical resubmission returns the existing
   * persisted row rather than creating a duplicate. A resubmission
   * that differs in decision or confirmedBy for the same proposalId
   * is stored as a new row.
   */
  save(confirmation: Confirmation): Promise<PersistedConfirmation>;

  /**
   * Fetch a single persisted confirmation by its storage-assigned id.
   * Returns null if no matching row exists.
   */
  fetchById(id: UUID): Promise<PersistedConfirmation | null>;

  /**
   * Returns every persisted confirmation for the given proposalId,
   * most recent first. Multiple confirmations may exist for the same
   * proposal over its lifetime (re-review, dispute, differing
   * reviewers), per ADR-6.
   */
  listByProposalId(proposalId: UUID): Promise<readonly PersistedConfirmation[]>;
}