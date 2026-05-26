/**
 * @module core/models/BusinessRecord
 *
 * The canonical, normalised representation of a discovered business.
 *
 * Lifecycle:
 *   ProviderResult  →  (Normalizer)  →  BusinessRecord  →  (Deduplicator)
 *   →  unique BusinessRecord  →  (Exporter)  →  output
 *
 * Rules:
 *   • All string fields are trimmed and non-empty, or null.
 *   • `normalizedName` and `normalizedPhone` are set by the Normalizer.
 *   • `fingerprint` is computed by FingerprintGenerator — never set manually.
 *   • Status fields are only mutated by their respective pipeline stage.
 *   • No methods, no computed properties, no logic of any kind.
 */
import type { BusinessID, DeduplicationStatus, E164Phone, ExportStatus, Fingerprint, NormalizationStatus, PriceLevel, QueryID, RunID, DayOfWeek } from "../types/common.js";
import type { Address, GeoCoordinates } from "../types/geo.js";
/**
 * Provider-specific external IDs for this business.
 * Keys are well-known identifiers where possible; arbitrary string keys
 * are permitted for forward-compatibility with future providers.
 */
export interface ExternalIdMap {
    readonly googlePlaceId?: string;
    readonly yelpId?: string;
    readonly linkedInId?: string;
    readonly clutchId?: string;
    /** Escape hatch for future providers. */
    readonly [key: string]: string | undefined;
}
export interface DayHours {
    readonly day: DayOfWeek;
    readonly open: string | null;
    readonly close: string | null;
    readonly isClosed: boolean;
}
export interface BusinessHours {
    /** Raw strings exactly as returned by the provider. */
    readonly raw: readonly string[];
    /**
     * Parsed representation. Null if the normalizer could not parse
     * the raw strings — consumers must handle this gracefully.
     */
    readonly parsed: readonly DayHours[] | null;
}
export interface BusinessRecord {
    /** Internal UUID, assigned at normalization time. */
    readonly id: BusinessID;
    /**
     * Stable hash derived from (normalizedName, normalizedPhone,
     * address.city, address.country). Used for deduplication.
     * Set by FingerprintGenerator — never derived ad hoc.
     */
    readonly fingerprint: Fingerprint;
    /** Provider-specific external IDs. At least one must be present. */
    readonly externalIds: ExternalIdMap;
    /** Name exactly as returned by the provider. */
    readonly name: string;
    /**
     * Lowercase, punctuation-stripped version of name.
     * Used for fuzzy matching and display normalisation.
     */
    readonly normalizedName: string;
    readonly address: Address;
    /**
     * WGS-84 coordinates. Null if the provider did not return them
     * and the normalizer could not derive them from the address.
     */
    readonly geo: GeoCoordinates | null;
    /** Phone number exactly as returned by the provider. */
    readonly phone: string | null;
    /**
     * E.164-formatted phone number (e.g. "+2348012345678").
     * Null if normalization failed or no phone was returned.
     */
    readonly normalizedPhone: E164Phone | null;
    /**
     * Website URL as returned by the provider.
     * This system does NOT crawl it — stored as-is for downstream use.
     */
    readonly website: string | null;
    /**
     * Normalised category tags (lowercase, hyphenated).
     * e.g. ["plumbing", "home-services", "emergency-plumber"]
     */
    readonly categories: readonly string[];
    /**
     * The first or most prominent category.
     * Null if the provider returned no category information.
     */
    readonly primaryCategory: string | null;
    /** 0.0–5.0, as returned by the provider. Null if not available. */
    readonly rating: number | null;
    /** Total number of reviews. Null if not available. */
    readonly reviewCount: number | null;
    readonly hours: BusinessHours | null;
    readonly priceLevel: PriceLevel | null;
    /** ID of the provider that produced the raw result. e.g. "google-maps" */
    readonly sourceProvider: string;
    /** URL of the specific listing page that was scraped. */
    readonly sourceUrl: string | null;
    /** UTC timestamp when the raw result was collected. */
    readonly collectedAt: Date;
    /** The pipeline run this record belongs to. */
    readonly runId: RunID;
    /** The query that produced this record. */
    readonly queryId: QueryID;
    readonly normalizationStatus: NormalizationStatus;
    readonly deduplicationStatus: DeduplicationStatus;
    readonly exportStatus: ExportStatus;
}
/**
 * Writable version of BusinessRecord used only during normalisation.
 * The Normalizer builds one of these, then freezes it into a BusinessRecord.
 * Nothing outside the normalizer package should use this type.
 */
export type BusinessRecordDraft = {
    -readonly [K in keyof BusinessRecord]: BusinessRecord[K];
};
//# sourceMappingURL=BusinessRecord.d.ts.map