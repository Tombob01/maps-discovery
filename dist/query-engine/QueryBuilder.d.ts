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
import type { IQueryCanonicalizer } from "../core/interfaces/IQueryEngine.js";
import type { GeneratedQuery, QuerySeed } from "../core/models/Query.js";
import type { RunID } from "../core/types/common.js";
export declare class QueryBuilder {
    private readonly canonicalizer;
    constructor(canonicalizer: IQueryCanonicalizer);
    /**
     * Builds the root GeneratedQuery from a seed for a specific provider.
     *
     * rawText format:
     *   "<modifiers?> <niche> <location>"
     *   e.g. "emergency plumbers Lagos, Nigeria"
     *   or   "plumbers Lagos, Nigeria"  (no modifiers)
     */
    build(seed: QuerySeed, runId: RunID, providerId: string): GeneratedQuery;
    /**
     * Builds root queries for every provider in the list.
     * Returns one GeneratedQuery per provider.
     */
    buildForProviders(seed: QuerySeed, runId: RunID, providerIds: readonly string[]): readonly GeneratedQuery[];
}
//# sourceMappingURL=QueryBuilder.d.ts.map