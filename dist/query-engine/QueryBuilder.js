/**
 * @module query-engine/QueryBuilder
 *
 * Constructs the root GeneratedQuery from a QuerySeed.
 *
 * Responsibilities:
 *   - Compose the rawText string from seed.niche + seed.location + modifiers
 *   - Assign all required GeneratedQuery fields
 *   - Compute the queryHash via IQueryCanonicalizer
 *   - Set lifecycleState = "generated"
 *   - Set generatedByStrategies = ["seed"]
 *
 * One QueryBuilder produces exactly ONE root query per seed.
 * The QueryExpander is responsible for all variants.
 *
 * QueryBuilder is deterministic: the same seed + providerId always
 * produces a root query with the same queryHash.
 */
import { randomUUID } from "node:crypto";
// ---------------------------------------------------------------------------
// QueryBuilder
// ---------------------------------------------------------------------------
export class QueryBuilder {
    canonicalizer;
    constructor(canonicalizer) {
        this.canonicalizer = canonicalizer;
    }
    /**
     * Builds the root GeneratedQuery from a seed for a specific provider.
     *
     * rawText format:
     *   "<modifiers?> <niche> <location>"
     *   e.g. "emergency plumbers Lagos, Nigeria"
     *   or   "plumbers Lagos, Nigeria"  (no modifiers)
     */
    build(seed, runId, providerId) {
        const rawText = composeRawText(seed);
        const geoTarget = seed.location;
        const canonicalText = this.canonicalizer.normalizeText(rawText);
        const canonicalGeoLabel = this.canonicalizer.normalizeGeoLabel(geoTarget.displayName);
        const queryHash = this.canonicalizer.hashFromParts({
            canonicalText,
            canonicalGeoLabel,
            providerId,
        });
        const query = Object.freeze({
            id: randomUUID(),
            runId,
            parentId: null,
            rawText,
            niche: seed.niche.trim().toLowerCase(),
            geoTarget,
            providerId,
            generatedByStrategies: Object.freeze(["seed"]),
            queryHash,
            lifecycleState: "generated",
            status: "pending",
            createdAt: new Date(),
            // expansionMetadata absent — root queries have no expansion provenance
            // score absent — root queries are 1.0 by convention
        });
        return query;
    }
    /**
     * Builds root queries for every provider in the list.
     * Returns one GeneratedQuery per provider.
     */
    buildForProviders(seed, runId, providerIds) {
        return providerIds.map(pid => this.build(seed, runId, pid));
    }
}
// ---------------------------------------------------------------------------
// Pure helper — rawText composition
// ---------------------------------------------------------------------------
/**
 * Composes the human-readable query string from a seed.
 *
 * Format:  [modifiers] niche displayName
 * Example: "emergency licensed plumbers Lagos, Nigeria"
 *
 * Modifiers are joined with spaces and prepended to the niche.
 * The niche is separated from the location by a single space.
 */
function composeRawText(seed) {
    const parts = [];
    if (seed.modifiers !== undefined && seed.modifiers.length > 0) {
        const mods = seed.modifiers.map(m => m.trim()).filter(m => m.length > 0);
        if (mods.length > 0)
            parts.push(mods.join(" "));
    }
    parts.push(seed.niche.trim());
    parts.push(seed.location.displayName.trim());
    return parts.join(" ");
}
//# sourceMappingURL=QueryBuilder.js.map