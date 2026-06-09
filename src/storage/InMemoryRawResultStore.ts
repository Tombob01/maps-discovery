/**
 * @module storage/InMemoryRawResultStore
 *
 * In-memory implementation of IRawResultStore.
 * Used in tests and development. Volatile - data lost on process exit.
 */

import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { IRawResultStore } from "./IRawResultStore.js";

export class InMemoryRawResultStore implements IRawResultStore {
  private readonly results = new Map<string, ProviderResult>();

  async save(result: ProviderResult): Promise<void> {
    this.results.set(result.providerResultId, result);
  }

  async fetch(id: string): Promise<ProviderResult | null> {
    return this.results.get(id) ?? null;
  }

  /** Total stored results. Used by tests for assertion. */
  get size(): number {
    return this.results.size;
  }
}
