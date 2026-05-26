/**
 * @module deduplicator/FingerprintDeduplicator
 *
 * In-memory deduplication using BusinessRecord.fingerprint.
 *
 * Strategy:
 *   - Maintain a Map<fingerprint, canonicalFingerprint> of seen records.
 *   - If fingerprint not seen â†’ "unique", register it.
 *   - If fingerprint seen â†’ "duplicate", return the canonical fingerprint.
 *
 * Thread-safety: single-process async only (no distributed locking).
 * For distributed use, back the store with Redis or a DB instead.
 */
import { ok, err } from "../core/types/common.js";
export class FingerprintDeduplicator {
    /** fingerprint â†’ canonical fingerprint (itself when first seen) */
    store;
    constructor(options = {}) {
        this.store = options.initialFingerprints
            ? new Map(options.initialFingerprints)
            : new Map();
    }
    async classify(record) {
        const fp = record.fingerprint;
        if (!fp || fp.trim() === "") {
            return err({
                code: "INVALID_RECORD",
                message: "BusinessRecord.fingerprint is empty â€” cannot deduplicate",
            });
        }
        const canonical = this.store.get(fp);
        if (canonical === undefined) {
            // First time we see this fingerprint â€” mark as unique
            this.store.set(fp, fp);
            return ok({
                verdict: "unique",
                reason: "No matching fingerprint found in store",
            });
        }
        return ok({
            verdict: "duplicate",
            canonicalFingerprint: canonical,
            reason: `Duplicate of fingerprint ${canonical}`,
        });
    }
    get size() {
        return this.store.size;
    }
    /**
     * Expose the underlying store for persistence (e.g. flushing to DB).
     * Returns a snapshot â€” mutations do not affect the internal store.
     */
    snapshot() {
        return new Map(this.store);
    }
    /** Remove a fingerprint from the store (e.g. for testing or corrections). */
    forget(fingerprint) {
        this.store.delete(fingerprint);
    }
    /** Clear the store. */
    clear() {
        this.store.clear();
    }
}
//# sourceMappingURL=FingerprintDeduplicator.js.map