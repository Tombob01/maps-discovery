/**
 * @module storage/IRawResultStore
 *
 * Storage abstraction for raw ProviderResult objects produced by providers
 * before normalisation.
 *
 * Methods are limited to those required by current callers:
 *   save()  - called by DiscoveryRunner once per yielded ProviderResult
 *   fetch() - called by RunCoordinator via fetchRawResult closure
 *
 * Implementations:
 *   InMemoryRawResultStore       - dev / test (volatile)
 *   PostgresRawResultRepository  - production (durable)
 */

import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { UUID } from "../core/types/common.js";

export interface IRawResultStore {
  /**
   * Persist a single ProviderResult.
   * Keyed by (runId, providerId, providerResultId). Idempotent - saving the
   * same identity twice is safe.
   *
   * Returns `true` if a new row was written, or `false` if the operation
   * was a no-op because a result with the same identity already existed
   * (e.g. rediscovered via an overlapping query within the same run).
   */
  save(result: ProviderResult): Promise<boolean>;

  /**
   * Fetch a ProviderResult by its providerResultId.
   * Returns null if no matching result exists.
   */
  fetch(id: string): Promise<ProviderResult | null>;

  /**
   * Fetch a ProviderResult by the persisted raw_results.id (UUID primary
   * key), as opposed to fetch()'s providerResultId key. Introduced for
   * proposal lineage (ADR-7): IdentityProposal.rawResultId and
   * proposals.raw_result_id both reference this UUID, not
   * providerResultId. Returns null if no matching result exists.
   */
  fetchById(id: UUID): Promise<ProviderResult | null>;

  /**
   * Persist a single ProviderResult, same idempotency semantics as
   * save(), but additionally returns the raw_results.id UUID assigned
   * to this identity. Additive alongside save() -- does not replace it.
   * Introduced so callers (e.g. a future proposal-production trigger)
   * can obtain the UUID at persistence time without a second round-trip.
   *
   * Returns { id, isNew: true } when a new row was written, or
   * { id, isNew: false } with the PREVIOUSLY assigned id when the
   * operation was a no-op because a result with the same identity
   * already existed.
   */
  saveAndGetId(result: ProviderResult): Promise<{ id: UUID; isNew: boolean }>;

  /**
   * OPTIONAL capability. Persists a single ProviderResult with the same
   * idempotency semantics as saveAndGetId(), but additionally allows an
   * existing duplicate identity's row to have its website filled in --
   * narrowly, only when the existing row currently has none. Never
   * overwrites an existing non-empty website (a business later exposing
   * a *different* website is explicitly out of scope and must leave the
   * existing website untouched). Never updates any other field of the
   * existing payload -- name, phone, address, rating, hours, etc. all
   * survive unchanged.
   *
   * Optional so existing implementations and test doubles remain valid
   * without change; callers (e.g. DiscoveryRunner) feature-detect this
   * method and fall back to plain saveAndGetId() when absent, or when
   * the incoming occurrence has no website to offer.
   *
   * `website` is the actual, already-validated, non-empty website
   * string extracted by the caller from the incoming occurrence's
   * payload -- callers must not call this method at all when no such
   * value exists (there is no boolean/empty-string calling convention
   * to guard against here; the type itself is the contract).
   *
   * Returns:
   *   - isNew: true                  -> a new row was inserted
   *   - isNew: false, updated: true  -> existing row's website field
   *     was filled in; every other existing field is preserved exactly
   *   - isNew: false, updated: false -> existing row unchanged
   *     (it already had a website)
   */
  saveAndGetIdWithWebsiteFill?(
    result: ProviderResult,
    website: string,
  ): Promise<{ id: UUID; isNew: boolean; updated: boolean }>;
}
