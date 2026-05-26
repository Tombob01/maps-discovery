/**
 * @module core/models/ProviderResult
 *
 * Raw result shape produced by a provider before any normalisation.
 *
 * The Normalizer reads ProviderResult and writes BusinessRecord.
 * Providers write ProviderResult and know nothing about BusinessRecord.
 *
 * Rules:
 *   • rawPayload is completely unmodified provider output.
 *   • No normalised fields live here — that is the Normalizer's job.
 *   • resumeToken must be persisted in the job payload for restartability.
 */
import type { UUID, RunID, QueryID } from "../types/common.js";
import type { ResumeToken } from "../types/pagination.js";
export interface ProviderResult {
    /**
     * Stable identifier for this result within the provider's namespace.
     * e.g. Google Place ID, Yelp business alias.
     * Used as idempotency key when persisting to raw_results table.
     */
    readonly providerId: string;
    readonly providerResultId: string;
    /**
     * The un-touched payload from the provider (DOM scrape, API response, etc).
     * Shape is provider-specific; typed as unknown to enforce normalizer mapping.
     */
    readonly rawPayload: unknown;
    /** The listing URL that was scraped or the API endpoint that responded. */
    readonly sourceUrl: string | null;
    /** UTC timestamp when this result was collected. */
    readonly collectedAt: Date;
    /** Run and query context — preserved for lineage. */
    readonly runId: RunID;
    readonly queryId: QueryID;
    /**
     * Opaque token enabling resume after a mid-page crash.
     * Stored in the DiscoveryJobPayload and restored on retry.
     */
    readonly resumeToken: ResumeToken;
}
/**
 * Shape of a row read back from the `raw_results` table.
 * Adds the DB-assigned UUID and processed flag.
 */
export interface PersistedRawResult extends ProviderResult {
    readonly id: UUID;
    readonly processed: boolean;
}
//# sourceMappingURL=ProviderResult.d.ts.map