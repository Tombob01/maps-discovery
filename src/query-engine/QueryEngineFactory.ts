/**
 * @module query-engine/QueryEngineFactory
 *
 * Wires all query-engine components into a ready-to-use QueryEngine.
 *
 * This is the single assembly point for the package. Callers outside
 * query-engine should only need to call createQueryEngine() -- they never
 * instantiate individual components directly.
 *
 * All components are assembled synchronously. Dictionary loading
 * (which reads from disk) is the only I/O at construction time.
 */

import { QUERY_ENGINE_DEFAULTS } from "./config/QueryEngineConfig.js";
import { loadAllDictionaries } from "./dictionaries/DictionaryLoader.js";
import {
  PassthroughGeoResolver,
  StaticCoordinateGeoResolver,
} from "./GeoResolver.js";
import { QueryCanonicalizer } from "./QueryCanonicalizer.js";
import { QueryEngine } from "./QueryEngine.js";
import { QueryExpander } from "./QueryExpander.js";
import {
  SynonymExpansionStrategy,
  ModifierExpansionStrategy,
  PluralExpansionStrategy,
  GeoExpansionStrategy,
} from "./strategies/index.js";

import type { QueryEngineConfig } from "./config/QueryEngineConfig.js";
import type { IExpansionStrategy, IGeoResolver } from "../core/interfaces/IQueryEngine.js";
import type { GeoCoordinates } from "../core/types/geo.js";

// ---------------------------------------------------------------------------
// Assembly options
// ---------------------------------------------------------------------------

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
   * Ignored when geoResolver is provided.
   */
  readonly staticCoordinates?: Readonly<Record<string, GeoCoordinates>>;

  /**
   * Optional pre-constructed geo resolver.
   * When provided, staticCoordinates is ignored and this resolver is used
   * directly. Use this to inject NominatimGeoResolver or any IGeoResolver
   * implementation without changing factory internals.
   */
  readonly geoResolver?: IGeoResolver;
}

// ---------------------------------------------------------------------------
// Assembled query engine handle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Assembles a fully wired QueryEngine from the provided options.
 *
 * Throws on dictionary load failure (malformed YAML) -- treat as
 * an unrecoverable startup error.
 */
export function createQueryEngine(
  options: QueryEngineAssemblyOptions,
): AssembledQueryEngine {
  const { config } = options;

  // -- Load dictionaries -----------------------------------------------------
  const { niches, geo } = loadAllDictionaries(
    config.dictionaries.nicheDictionariesDir,
    config.dictionaries.geoDictionariesDir,
  );

  // -- Canonicalizer ---------------------------------------------------------
  const canonicalizer = new QueryCanonicalizer(config.canonicalizer);

  // -- Geo resolver ----------------------------------------------------------
  // Priority: injected geoResolver > staticCoordinates > PassthroughGeoResolver
  const geoResolver: IGeoResolver =
    options.geoResolver !== undefined
      ? options.geoResolver
      : options.staticCoordinates !== undefined &&
          Object.keys(options.staticCoordinates).length > 0
        ? new StaticCoordinateGeoResolver(
            options.staticCoordinates,
            config.geoResolver,
          )
        : new PassthroughGeoResolver(config.geoResolver);

  // -- Built-in strategies ---------------------------------------------------
  const builtInStrategies: IExpansionStrategy[] = [
    new SynonymExpansionStrategy(niches),
    new ModifierExpansionStrategy(niches),
    new PluralExpansionStrategy(niches),
    new GeoExpansionStrategy(geo),
  ];

  // -- Additional (plugin) strategies ----------------------------------------
  const allStrategies: IExpansionStrategy[] = [
    ...builtInStrategies,
    ...(options.additionalStrategies ?? []),
  ];

  // -- Expander --------------------------------------------------------------
  const expander = new QueryExpander(
    allStrategies,
    canonicalizer,
    config.expansion,
  );

  // -- Engine ----------------------------------------------------------------
  const engine = new QueryEngine(
    canonicalizer,
    expander,
    geoResolver,
    config,
    niches,
  );

  return {
    engine,
    canonicalizer,
    nicheDictCount: niches.size,
    geoDictCount: geo.size,
    strategyIds: Object.freeze(allStrategies.map((s) => s.id)),
  };
}

// ---------------------------------------------------------------------------
// Convenience: build config with defaults
// ---------------------------------------------------------------------------

/**
 * Merges caller-supplied partial config with QUERY_ENGINE_DEFAULTS.
 * `dictionaries` is required (paths cannot have defaults).
 */
export function buildQueryEngineConfig(
  dictionaries: QueryEngineConfig["dictionaries"],
  overrides?: Partial<Omit<QueryEngineConfig, "dictionaries">>,
): QueryEngineConfig {
  return {
    dictionaries,
    canonicalizer: {
      ...QUERY_ENGINE_DEFAULTS.canonicalizer,
      ...overrides?.canonicalizer,
    },
    expansion: {
      ...QUERY_ENGINE_DEFAULTS.expansion,
      ...overrides?.expansion,
    },
    geoResolver: {
      ...QUERY_ENGINE_DEFAULTS.geoResolver,
      ...overrides?.geoResolver,
    },
  };
}
