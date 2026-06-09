/**
 * @module query-engine/IGeoCache
 *
 * Cache interface for resolved geo coordinates.
 * Kept behind an interface so the backing store can be swapped
 * (in-memory, Postgres, Redis) without changing resolver logic.
 */

import type { GeoCoordinates } from "../core/types/geo.js";

export interface IGeoCache {
  get(key: string): GeoCoordinates | undefined;
  set(key: string, value: GeoCoordinates): void;
}

/**
 * Default in-process implementation.
 * Lives for the lifetime of the process; cleared on restart.
 */
export class InMemoryGeoCache implements IGeoCache {
  private readonly store = new Map<string, GeoCoordinates>();

  get(key: string): GeoCoordinates | undefined {
    return this.store.get(key);
  }

  set(key: string, value: GeoCoordinates): void {
    this.store.set(key, value);
  }
}
