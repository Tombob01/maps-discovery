/**
 * @module cache/PlaceIdWebsiteCache
 *
 * Per-run, in-memory tri-state cache tracking whether a Place ID (or the
 * synthetic URL-derived identity fallback) has already been observed in
 * the current run, and whether that observation included a website.
 * Consulted by GoogleMapsProvider to decide whether Phase 2 detail-page
 * navigation can be safely skipped for a rediscovered business.
 *
 * Scope: must be constructed fresh per run and discarded when the run's
 * batch of seed executions completes. Never shared across runs, never
 * persisted, never process-global.
 *
 * Once a Place ID is recorded as having a website, it never regresses to
 * "no website" -- a later occurrence without one does not erase an
 * earlier confirmed website. This mirrors the persistence-layer's own
 * fill-only-never-overwrite semantics.
 */

export type PlaceIdWebsiteStatus =
  | "unseen"
  | "seen-no-website"
  | "seen-with-website";

export class PlaceIdWebsiteCache {
  private readonly state = new Map<string, boolean>();

  /** Returns this identity's current status. Does not mutate state. */
  status(identityKey: string): PlaceIdWebsiteStatus {
    if (!this.state.has(identityKey)) return "unseen";
    return this.state.get(identityKey) === true
      ? "seen-with-website"
      : "seen-no-website";
  }

  /**
   * Records an observation for this identity. Never downgrades an
   * existing "has website" record to "no website".
   */
  record(identityKey: string, hasWebsite: boolean): void {
    if (this.state.get(identityKey) === true) return;
    this.state.set(identityKey, hasWebsite);
  }

  /** Number of distinct identities currently tracked. */
  get size(): number {
    return this.state.size;
  }
}