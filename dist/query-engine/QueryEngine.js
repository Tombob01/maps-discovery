/**
 * @module query-engine/QueryEngine
 *
 * Implements IQueryEngine — the single public entry point for the package.
 *
 * Orchestration sequence for generate(seed):
 *   1. For each configured provider:
 *      a. QueryBuilder.build()          → root GeneratedQuery
 *      b. QueryCanonicalizer.canonicalize() → CanonicalizedQuery (sets queryHash)
 *      c. QueryExpander.expand()        → variant GeneratedQuery[]
 *      d. Canonicalize all variants
 *      e. Collect unique (by queryHash) across root + variants
 *   2. QueryCanonicalizer.collapseByHash() — final dedup pass
 *   3. Return all unique GeneratedQuery objects, lifecycle = "generated"
 *
 * The IQueryEngine interface defines generate(seed). This implementation
 * extends the signature with required runId and providerIds parameters.
 * The interface is satisfied via the overriding method below which
 * requires callers to supply those arguments.
 *
 * The engine does NOT:
 *   - Write to the database
 *   - Enqueue jobs
 *   - Call providers
 *   - Make network requests
 */
import { QueryBuilder } from "./QueryBuilder.js";
import { ok, err } from "../core/types/common.js";
// ---------------------------------------------------------------------------
// QueryEngine
// ---------------------------------------------------------------------------
export class QueryEngine {
    canonicalizer;
    expander;
    geoResolver;
    config;
    niches;
    builder;
    constructor(canonicalizer, expander, geoResolver, config, niches) {
        this.canonicalizer = canonicalizer;
        this.expander = expander;
        this.geoResolver = geoResolver;
        this.config = config;
        this.niches = niches;
        this.builder = new QueryBuilder(canonicalizer);
    }
    // ---------------------------------------------------------------------------
    // generate() — primary entry point
    // ---------------------------------------------------------------------------
    async generate(seed, runId, providerIds) {
        // Validate seed
        if (seed.niche.trim() === "") {
            return err({ code: "INVALID_SEED", message: "QuerySeed.niche must not be empty" });
        }
        if (seed.location.displayName.trim() === "") {
            return err({ code: "INVALID_SEED", message: "QuerySeed.location.displayName must not be empty" });
        }
        if (providerIds.length === 0) {
            return err({ code: "INVALID_SEED", message: "At least one providerId is required" });
        }
        // Resolve geo once (shared across all providers for this seed)
        const geoResult = await this.geoResolver.resolve(seed.location);
        if (!geoResult.ok) {
            return err({
                code: "GEO_RESOLUTION_FAILED",
                message: `Could not resolve geo for "${seed.location.displayName}": ${geoResult.error.message}`,
                cause: geoResult.error,
            });
        }
        // Per-provider generation
        const allQueries = [];
        const seenHashes = new Map();
        for (const providerId of providerIds) {
            const providerResult = await this._generateForProvider(seed, runId, providerId, seenHashes);
            if (!providerResult.ok) {
                if (!this.config.expansion.continueOnStrategyError) {
                    return err(providerResult.error);
                }
                continue;
            }
            for (const q of providerResult.value) {
                allQueries.push(q);
            }
        }
        if (allQueries.length === 0) {
            return err({
                code: "NO_QUERIES_GENERATED",
                message: `No queries generated for niche="${seed.niche}" location="${seed.location.displayName}"`,
            });
        }
        // Final dedup pass (safety net)
        const collapsed = this.canonicalizer.collapseByHash(allQueries);
        return ok(collapsed);
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    async _generateForProvider(seed, runId, providerId, seenHashes) {
        // 1. Build root query
        const root = this.builder.build(seed, runId, providerId);
        // 2. Canonicalize root
        const canonResult = this.canonicalizer.canonicalize(root, seenHashes);
        if (!canonResult.ok) {
            return err({
                code: "INVALID_SEED",
                message: `Root query canonicalization failed: ${canonResult.error.message}`,
                cause: canonResult.error,
            });
        }
        const canonRoot = canonResult.value;
        // Register root hash
        seenHashes.set(canonRoot.queryHash, canonRoot.id);
        const result = [canonRoot];
        // 3. Expand — skip if no strategy IDs requested
        const strategyIds = seed.expansionStrategyIds ?? this.config.expansion.defaultStrategyIds;
        if (strategyIds.length === 0)
            return ok(result);
        // Skip expansion for unknown niches
        if (this.niches !== undefined && this.niches.get(seed.niche) === undefined)
            return ok(result);
        const maxVariants = seed.maxVariants ?? this.config.expansion.defaultMaxVariants;
        const budget = maxVariants - 1; // root occupies slot 0
        if (budget <= 0)
            return ok(result);
        const context = {
            runId,
            existingVariants: [root.rawText],
            existingQueryHashes: new Set(seenHashes.keys()),
            maxNew: budget,
            providerId,
            strategyIds,
        };
        const expandResult = await this.expander.expand(canonRoot, context);
        if (!expandResult.ok) {
            if (!this.config.expansion.continueOnStrategyError) {
                return err({
                    code: "EXPANSION_STRATEGY_FAILED",
                    message: expandResult.error.message,
                    cause: expandResult.error,
                });
            }
            return ok(result);
        }
        // 4. Canonicalize all variants + collect unique
        for (const variant of expandResult.value) {
            const vCanon = this.canonicalizer.canonicalize(variant, seenHashes);
            if (!vCanon.ok)
                continue;
            const cv = vCanon.value;
            if (cv.isDuplicateOfExisting)
                continue;
            seenHashes.set(cv.queryHash, cv.id);
            result.push(cv);
        }
        return ok(result);
    }
}
//# sourceMappingURL=QueryEngine.js.map