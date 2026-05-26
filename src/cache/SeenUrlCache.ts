/**
 * @module cache/SeenUrlCache
 *
 * In-memory URL deduplication cache.
 * Tracks which URLs have already been collected in this run so
 * the provider layer can skip re-fetching them.
 *
 * Implementation: a plain Set bounded by a maxSize eviction policy
 * (LRU approximated by insertion-order eviction on overflow).
 */

export interface SeenUrlCacheOptions {
  /** Maximum number of URLs to hold before evicting oldest entries. Default: 100_000 */
  readonly maxSize?: number;
}

export class SeenUrlCache {
  private readonly cache: Set<string>;
  private readonly maxSize: number;

  constructor(options: SeenUrlCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100_000;
    this.cache = new Set();
  }

  /**
   * Returns true if the URL has already been seen; false if it is new.
   * If new, the URL is added to the cache.
   */
  checkAndAdd(url: string): boolean {
    if (this.cache.has(url)) return true;

    // Evict oldest entry on overflow
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.values().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.add(url);
    return false;
  }

  /** Returns true if the URL is already in the cache (without adding). */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /** Current number of URLs tracked. */
  get size(): number {
    return this.cache.size;
  }

  /** Clear all entries. */
  clear(): void {
    this.cache.clear();
  }
}
