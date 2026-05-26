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
export class SeenUrlCache {
    cache;
    maxSize;
    constructor(options = {}) {
        this.maxSize = options.maxSize ?? 100_000;
        this.cache = new Set();
    }
    /**
     * Returns true if the URL has already been seen; false if it is new.
     * If new, the URL is added to the cache.
     */
    checkAndAdd(url) {
        if (this.cache.has(url))
            return true;
        // Evict oldest entry on overflow
        if (this.cache.size >= this.maxSize) {
            const oldest = this.cache.values().next().value;
            if (oldest !== undefined)
                this.cache.delete(oldest);
        }
        this.cache.add(url);
        return false;
    }
    /** Returns true if the URL is already in the cache (without adding). */
    has(url) {
        return this.cache.has(url);
    }
    /** Current number of URLs tracked. */
    get size() {
        return this.cache.size;
    }
    /** Clear all entries. */
    clear() {
        this.cache.clear();
    }
}
//# sourceMappingURL=SeenUrlCache.js.map