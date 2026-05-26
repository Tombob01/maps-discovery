/**
 * @module query-engine/QueryEngineFactory
 *
 * Wires all query-engine components into a ready-to-use QueryEngine.
 *
 * This is the single assembly point for the package. Callers outside
 * query-engine should only need to call createQueryEngine() — they never
 * instantiate individual components directly.
 *
 * All components are assembled synchronously. Dictionary loading
 * (which reads from disk) is the only I/O at construction time.
 */
import { QueryCanonicalizer } from "./QueryCanonicalizer.js";
import { QueryEngine } from "./QueryEngine.js";
import type { QueryEngineConfig } from "./config/QueryEngineConfig.js";
import type { IExpansionStrategy } from "../core/interfaces/IQueryEngine.js";
import type { GeoCoordinates } from "../core/types/geo.js";
export interface QueryEngineAssemblyOptions {
    /**
     * Full query engine configuration.
     * Defaults are merged in for any omitted fields.
     */
    readonly config: QueryEngineConfig;
    /**
     * Additional expansion strategies to register beyond the built-in four.
     * Strategies registered here are available by ID in seed.expansionStrategyIds.
     * This is the extension point for future AI/autocomplete/competitor strategies.
     */
    readonly additionalStrategies?: readonly IExpansionStrategy[];
    /**
     * Static coordinate overrides for the geo resolver.
     * Keyed by displayName (case-insensitive). Useful for tests and
     * for seeding known cities without external API access.
     */
    readonly staticCoordinates?: Readonly<Record<string, GeoCoordinates>>;
}
export interface AssembledQueryEngine {
    readonly engine: QueryEngine;
    readonly canonicalizer: QueryCanonicalizer;
    /** How many niche dictionaries were loaded. */
    readonly nicheDictCount: number;
    /** How many geo dictionaries were loaded. */
    readonly geoDictCount: number;
    /** IDs of all registered expansion strategies. */
    readonly strategyIds: readonly string[];
}
/**
 * Assembles a fully wired QueryEngine from the provided options.
 *
 * Throws on dictionary load failure (malformed YAML) — treat as
 * an unrecoverable startup error.
 */
export declare function createQueryEngine(options: QueryEngineAssemblyOptions): AssembledQueryEngine;
/**
 * Merges caller-supplied partial config with QUERY_ENGINE_DEFAULTS.
 * `dictionaries` is required (paths cannot have defaults).
 */
export declare function buildQueryEngineConfig(dictionaries: QueryEngineConfig["dictionaries"], overrides?: Partial<Omit<QueryEngineConfig, "dictionaries">>): QueryEngineConfig;
//# sourceMappingURL=QueryEngineFactory.d.ts.map