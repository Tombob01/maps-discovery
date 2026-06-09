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

export interface IRawResultStore {
  /**
   * Persist a single ProviderResult.
   * Keyed by providerResultId. Idempotent - saving the same id twice is safe.
   */
  save(result: ProviderResult): Promise<void>;

  /**
   * Fetch a ProviderResult by its providerResultId.
   * Returns null if no matching result exists.
   */
  fetch(id: string): Promise<ProviderResult | null>;
}
