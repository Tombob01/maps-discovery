/**
 * @module query-engine/QueryExpander
 *
 * Implements IQueryExpander.
 *
 * Orchestrates one or more IExpansionStrategy instances against a root
 * GeneratedQuery to produce an ordered list of variant GeneratedQuery objects.
 *
 * Expansion loop:
 *   For each strategy (in registration order or seed-specified order):
 *     1. Call strategy.applyWithMetadata(query, context)
 *     2. For each surviving candidate:
 *        a. Normalise the rawText and compute its queryHash
 *        b. Check against existingQueryHashes — skip if already seen
 *        c. Construct a full GeneratedQuery with provenance fields
 *        d. Add to output + update context sets
 *     3. Stop when context.maxNew is exhausted
 *
 * The expander never calls providers, the DB, or queues.
 * It is entirely in-memory and deterministic given the same inputs.
 */
import type { ExpansionConfig } from "./config/QueryEngineConfig.js";
import type { IExpansionStrategy, IQueryCanonicalizer, IQueryExpander, QueryExpanderErrorDetail } from "../core/interfaces/IQueryEngine.js";
import type { ExpansionContext, GeneratedQuery } from "../core/models/Query.js";
import type { Result } from "../core/types/common.js";
export declare class QueryExpander implements IQueryExpander {
    private readonly canonicalizer;
    private readonly config;
    /** Registered strategies keyed by ID for O(1) lookup. */
    private readonly strategyMap;
    constructor(strategies: readonly IExpansionStrategy[], canonicalizer: IQueryCanonicalizer, config: ExpansionConfig);
    expand(query: GeneratedQuery, context: ExpansionContext): Promise<Result<readonly GeneratedQuery[], QueryExpanderErrorDetail>>;
    /**
     * Resolves the list of strategy IDs to apply to `query`.
     * Prefers the seed's expansionStrategyIds if present.
     */
    private _resolveStrategyIds;
    /**
     * Calls a strategy, using the richer applyWithMetadata() path if the
     * strategy is a BaseExpansionStrategy, or the standard apply() path
     * for external IExpansionStrategy implementations.
     */
    private _callStrategy;
    /**
     * Constructs a full GeneratedQuery from a StrategyCandidate.
     * Returns null if the rawText normalises to empty.
     */
    private _buildVariant;
}
//# sourceMappingURL=QueryExpander.d.ts.map