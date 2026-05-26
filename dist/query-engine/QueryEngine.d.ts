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
import type { QueryEngineConfig } from "./config/QueryEngineConfig.js";
import type { NicheDictionaryIndex } from "./dictionaries/NicheDictionary.js";
import type { IQueryCanonicalizer, IQueryExpander, IGeoResolver, QueryEngineErrorDetail } from "../core/interfaces/IQueryEngine.js";
import type { GeneratedQuery, QuerySeed } from "../core/models/Query.js";
import type { RunID, Result } from "../core/types/common.js";
export declare class QueryEngine {
    private readonly canonicalizer;
    private readonly expander;
    private readonly geoResolver;
    private readonly config;
    private readonly niches?;
    private readonly builder;
    constructor(canonicalizer: IQueryCanonicalizer, expander: IQueryExpander, geoResolver: IGeoResolver, config: QueryEngineConfig, niches?: NicheDictionaryIndex | undefined);
    generate(seed: QuerySeed, runId: RunID, providerIds: readonly string[]): Promise<Result<readonly GeneratedQuery[], QueryEngineErrorDetail>>;
    private _generateForProvider;
}
//# sourceMappingURL=QueryEngine.d.ts.map