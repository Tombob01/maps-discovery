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
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
import type { IDeduplicator, DeduplicationResult, DeduplicationError } from "./IDeduplicator.js";
export interface FingerprintDeduplicatorOptions {
    /**
     * Optional initial set of known fingerprints (e.g. loaded from DB on startup).
     * Each entry maps fingerprint â†’ canonical fingerprint (itself on first insertion).
     */
    readonly initialFingerprints?: ReadonlyMap<string, string>;
}
export declare class FingerprintDeduplicator implements IDeduplicator {
    /** fingerprint â†’ canonical fingerprint (itself when first seen) */
    private readonly store;
    constructor(options?: FingerprintDeduplicatorOptions);
    classify(record: BusinessRecord): Promise<Result<DeduplicationResult, DeduplicationError>>;
    get size(): number;
    /**
     * Expose the underlying store for persistence (e.g. flushing to DB).
     * Returns a snapshot â€” mutations do not affect the internal store.
     */
    snapshot(): ReadonlyMap<string, string>;
    /** Remove a fingerprint from the store (e.g. for testing or corrections). */
    forget(fingerprint: string): void;
    /** Clear the store. */
    clear(): void;
}
//# sourceMappingURL=FingerprintDeduplicator.d.ts.map