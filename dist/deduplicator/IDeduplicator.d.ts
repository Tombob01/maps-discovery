/**
 * @module deduplicator/IDeduplicator
 *
 * Deduplication contract.
 *
 * The deduplicator compares an incoming BusinessRecord against previously
 * seen records and classifies it as unique, duplicate, or uncertain.
 *
 * Stateless from the caller's perspective — state lives inside the
 * implementation (e.g. an in-memory fingerprint store, or a DB query).
 */
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
export type DeduplicationVerdict = "unique" | "duplicate" | "uncertain";
export interface DeduplicationResult {
    readonly verdict: DeduplicationVerdict;
    /** Fingerprint of the canonical (first-seen) record, if a duplicate was found. */
    readonly canonicalFingerprint?: string;
    /** Human-readable explanation of the verdict. */
    readonly reason: string;
}
export interface IDeduplicator {
    /**
     * Classify the incoming record.
     *
     * On first call for a given fingerprint → "unique", record is remembered.
     * On subsequent calls with the same fingerprint → "duplicate".
     *
     * Returns Err only for internal/infrastructure failures, not for duplicates.
     */
    classify(record: BusinessRecord): Promise<Result<DeduplicationResult, DeduplicationError>>;
    /** Number of unique fingerprints currently tracked. */
    readonly size: number;
}
export type DeduplicationErrorCode = "STORE_READ_FAILED" | "STORE_WRITE_FAILED" | "INVALID_RECORD";
export interface DeduplicationError {
    readonly code: DeduplicationErrorCode;
    readonly message: string;
    readonly cause?: unknown;
}
//# sourceMappingURL=IDeduplicator.d.ts.map