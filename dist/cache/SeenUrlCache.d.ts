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
export declare class SeenUrlCache {
    private readonly cache;
    private readonly maxSize;
    constructor(options?: SeenUrlCacheOptions);
    /**
     * Returns true if the URL has already been seen; false if it is new.
     * If new, the URL is added to the cache.
     */
    checkAndAdd(url: string): boolean;
    /** Returns true if the URL is already in the cache (without adding). */
    has(url: string): boolean;
    /** Current number of URLs tracked. */
    get size(): number;
    /** Clear all entries. */
    clear(): void;
}
//# sourceMappingURL=SeenUrlCache.d.ts.map