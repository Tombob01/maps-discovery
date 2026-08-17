/**
 * @module storage/InMemoryRawResultStore
 *
 * In-memory implementation of IRawResultStore.
 * Used in tests and development. Volatile - data lost on process exit.
 */

import { randomUUID } from "node:crypto";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { IRawResultStore } from "./IRawResultStore.js";
import type { UUID } from "../core/types/common.js";

export class InMemoryRawResultStore implements IRawResultStore {
  private readonly results = new Map<string, ProviderResult>();
  // UUID-keyed index supporting fetchById(), mirroring raw_results.id.
  // Populated only when save() writes a genuinely new row (isNew === true),
  // matching Postgres: a duplicate identity hits ON CONFLICT DO NOTHING and
  // never gets a new id either.
  private readonly resultsById = new Map<UUID, ProviderResult>();
  // Test/development-only: maps the same identityKey() used by
  // seenIdentities/save() to the UUID assigned on that identity's first
  // save(). Keyed by full (runId, providerId, providerResultId) identity,
  // NOT providerResultId alone, since provider_result_id is not unique
  // on its own (uq_raw_results_provider_result is a composite constraint).
  private readonly assignedIds = new Map<string, UUID>();
  // Tracks identities already saved, scoped by (runId, providerId,
  // providerResultId) to mirror the Postgres uq_raw_results_provider_result
  // constraint. Used only to compute save()'s return value; `results` above
  // keeps its original providerResultId-only keying so fetch() behavior
  // (not run-scoped, last write wins) is unchanged.
  private readonly seenIdentities = new Set<string>();

  private identityKey(result: ProviderResult): string {
    return `${result.runId}::${result.providerId}::${result.providerResultId}`;
  }

  async save(result: ProviderResult): Promise<boolean> {
    const key = this.identityKey(result);
    const isNew = !this.seenIdentities.has(key);
    if (isNew) {
      this.seenIdentities.add(key);
      this.results.set(result.providerResultId, result);
      const id = randomUUID() as UUID;
      this.resultsById.set(id, result);
      this.assignedIds.set(key, id);
    }
    return isNew;
  }

  async fetch(id: string): Promise<ProviderResult | null> {
    return this.results.get(id) ?? null;
  }

  async fetchById(id: UUID): Promise<ProviderResult | null> {
    return this.resultsById.get(id) ?? null;
  }

  /**
   * Test/development-only accessor: returns the UUID assigned to the
   * given result's identity (run_id, provider_id, provider_result_id) on
   * its first save(), or null if that identity was never saved.
   * Concrete-class-only -- mirrors the existing `size` accessor's
   * precedent and is intentionally NOT part of IRawResultStore, since
   * PostgresRawResultRepository has no equivalent concept (its UUID is
   * DB-generated). Reuses identityKey() as the single source of truth
   * for raw-result identity, matching save()'s actual idempotency unit
   * and the DB's real uq_raw_results_provider_result constraint --
   * never keyed by providerResultId alone.
   */
  getAssignedId(result: ProviderResult): UUID | null {
    return this.assignedIds.get(this.identityKey(result)) ?? null;
  }

  async saveAndGetId(result: ProviderResult): Promise<{ id: UUID; isNew: boolean }> {
    const key = this.identityKey(result);
    const existingId = this.assignedIds.get(key);
    if (existingId !== undefined) {
      return { id: existingId, isNew: false };
    }
    const isNew = await this.save(result);
    // save() only returns false here if a concurrent/duplicate identity
    // was recorded between the check above and this call; under this
    // class's single-threaded synchronous Map operations that cannot
    // happen, so isNew is always true at this point.
    void isNew;
    const id = this.assignedIds.get(key);
    if (id === undefined) {
      throw new Error(
        "InMemoryRawResultStore.saveAndGetId(): no id assigned after save()",
      );
    }
    return { id, isNew: true };
  }

  async saveAndGetIdWithWebsiteFill(
    result: ProviderResult,
    website: string,
  ): Promise<{ id: UUID; isNew: boolean; updated: boolean }> {
    const key = this.identityKey(result);
    const existingId = this.assignedIds.get(key);

    if (existingId === undefined) {
      const isNew = await this.save(result);
      void isNew;
      const id = this.assignedIds.get(key);
      if (id === undefined) {
        throw new Error(
          "InMemoryRawResultStore.saveAndGetIdWithWebsiteFill(): no id assigned after save()",
        );
      }
      return { id, isNew: true, updated: false };
    }

    const existing = this.resultsById.get(existingId);
    if (existing === undefined) {
      throw new Error(
        "InMemoryRawResultStore.saveAndGetIdWithWebsiteFill(): assigned id has no stored result",
      );
    }

    const existingPayload = (existing.rawPayload ?? {}) as Record<string, unknown>;
    const existingWebsite = existingPayload["website"];
    const existingHasWebsite =
      typeof existingWebsite === "string" && existingWebsite.trim().length > 0;

    if (existingHasWebsite) {
      return { id: existingId, isNew: false, updated: false };
    }

    const mergedResult: ProviderResult = {
      ...existing,
      rawPayload: { ...existingPayload, website },
    };
    this.results.set(result.providerResultId, mergedResult);
    this.resultsById.set(existingId, mergedResult);

    return { id: existingId, isNew: false, updated: true };
  }

  /** Total stored results. Used by tests for assertion. */
  get size(): number {
    return this.results.size;
  }
}
