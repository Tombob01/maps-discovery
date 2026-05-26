/**
 * @module core/interfaces/IDeduplicator
 *
 * Deduplication contracts.
 *
 * Architecture:
 *   IDeduplicator               orchestrates strategies
 *   ├── IDeduplicationStrategy  single matching algorithm
 *   │   ├── ExactMatchStrategy  (placeId, normalizedPhone exact match)
 *   │   └── FuzzyMatchStrategy  (name + address Levenshtein)
 *   └── IFingerprintGenerator   produces the stable Fingerprint hash
 */
import type { BusinessRecord } from "../models/BusinessRecord.js";
import type { DeduplicationStatus, Fingerprint, Result } from "../types/common.js";
export type DeduplicationField = "placeId" | "normalizedPhone" | "fingerprint" | "nameAddressCombo" | "googlePlaceId" | "yelpId";
export interface DeduplicationResult {
    readonly isDuplicate: boolean;
    readonly status: DeduplicationStatus;
    /**
     * The id of the existing BusinessRecord this record duplicates.
     * Present only when isDuplicate is true.
     */
    readonly existingId?: string;
    /**
     * Confidence in the duplicate classification, 0.0–1.0.
     * 1.0 = certain (exact external ID match); < 1.0 = fuzzy match.
     */
    readonly confidence: number;
    /** Which fields caused the match. */
    readonly matchedOn: readonly DeduplicationField[];
    /** Which strategy produced the result. */
    readonly strategyId: string;
}
export interface IDeduplicator {
    /**
     * Determines whether `record` is a duplicate of a previously seen record.
     *
     * This is the ONLY stage that reads existing BusinessRecord data.
     * Returns Err only on infrastructure failure (DB/cache unreachable).
     */
    isDuplicate(record: BusinessRecord): Promise<Result<DeduplicationResult, DeduplicationErrorDetail>>;
    /**
     * Marks `record` as seen so future calls to isDuplicate can detect it.
     * Must be called after a record is confirmed unique.
     * Returns Err on infrastructure failure.
     */
    markSeen(record: BusinessRecord): Promise<Result<void, DeduplicationErrorDetail>>;
}
/**
 * One strategy = one algorithm for determining whether two records match.
 * Strategies are stateless — infrastructure access (DB/cache) happens
 * through injected repositories, not directly.
 */
export interface IDeduplicationStrategy {
    /** Stable ID, e.g. "exact-place-id", "fuzzy-name-address" */
    readonly id: string;
    /** Lower number = higher priority (runs first). */
    readonly priority: number;
    /**
     * Checks whether `candidate` matches any existing record.
     *
     * Returns:
     *   - Ok({ isDuplicate: true, ... })  — match found
     *   - Ok({ isDuplicate: false, ... }) — no match found
     *   - Err(...)                         — infrastructure failure
     */
    check(candidate: BusinessRecord): Promise<Result<DeduplicationResult, DeduplicationErrorDetail>>;
}
/**
 * Deterministic: given the same BusinessRecord fields, always returns the
 * same Fingerprint. Used for:
 *   1. Exact dedup across runs (cache lookup by fingerprint)
 *   2. Change detection (re-scrape produces different fingerprint)
 */
export interface IFingerprintGenerator {
    /**
     * Generates a fingerprint from the record's stable fields:
     *   normalizedName + normalizedPhone + address.city + address.countryCode
     *
     * Must not include volatile fields (rating, reviewCount, collectedAt).
     */
    generate(record: Readonly<{
        normalizedName: string;
        normalizedPhone: string | null;
        address: {
            city: string | null;
            countryCode: string | null;
        };
    }>): Fingerprint;
}
export type { DeduplicationErrorCode } from "../errors/DeduplicationError.js";
import type { DeduplicationErrorCode } from "../errors/DeduplicationError.js";
export interface DeduplicationErrorDetail {
    readonly code: DeduplicationErrorCode;
    readonly message: string;
    readonly strategyId?: string;
    readonly cause?: unknown;
}
//# sourceMappingURL=IDeduplicator.d.ts.map