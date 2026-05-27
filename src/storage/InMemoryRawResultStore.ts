/**
 * @module storage/InMemoryRawResultStore
 *
 * In-memory store for raw ProviderResult objects produced by providers
 * before normalization.
 *
 * Used in the runtime path as the fetchRawResult implementation until a
 * Postgres-backed raw_results table is added. Thread-safe for single-process
 * use (Node.js event loop).
 *
 * Design:
 *   - Providers call store.save(result) after each page of results.
 *   - RunCoordinator calls store.fetch(id) via its fetchRawResult option.
 *   - clear(runId) is called after a run completes to free memory.
 */

import type { ProviderResult } from "../core/models/ProviderResult.js";

export class InMemoryRawResultStore {
  private readonly results = new Map<string, ProviderResult>();

  /**
   * Save a ProviderResult. The result.providerResultId field is used as the key.
   * Overwrites any existing entry with the same id (idempotent).
   */
  save(result: ProviderResult): void {
    this.results.set(result.providerResultId, result);
  }

  /**
   * Save multiple results in one call.
   */
  saveMany(results: readonly ProviderResult[]): void {
    for (const r of results) {
      this.results.set(r.providerResultId, r);
    }
  }

  /**
   * Fetch a single result by id. Returns null if not found.
   * This is the shape expected by RunCoordinatorOptions.fetchRawResult.
   */
  async fetch(id: string): Promise<ProviderResult | null> {
    return this.results.get(id) ?? null;
  }

  /**
   * Remove all results for a given runId to free memory after a run.
   */
  clearRun(runId: string): void {
    for (const [id, result] of this.results) {
      if (result.runId === runId) {
        this.results.delete(id);
      }
    }
  }

  /** Total number of stored results (for testing / diagnostics). */
  get size(): number {
    return this.results.size;
  }
}
