/**
 * @module normalizer/fingerprint
 *
 * Produces a deterministic SHA-256-like fingerprint string from
 * the stable identity fields of a (partial) BusinessRecord.
 *
 * Uses a pure-JS djb2 hash to avoid requiring Node crypto in tests;
 * the format is hex-like to satisfy Fingerprint brand expectations.
 *
 * Fields contributing to the fingerprint (normalised, nulls removed):
 *   - normalizedName
 *   - address.city (lower)
 *   - address.country (lower)
 *   - normalizedPhone
 */
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
type PartialRecord = Omit<BusinessRecord, "id" | "fingerprint">;
export declare function fingerprintRecord(record: PartialRecord): string;
export {};
//# sourceMappingURL=fingerprint.d.ts.map