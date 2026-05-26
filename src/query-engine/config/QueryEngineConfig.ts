/**
 * @module query-engine/config/QueryEngineConfig
 *
 * Typed configuration shapes for the entire query-engine package.
 *
 * All configuration is plain data — no logic, no defaults here.
 * Defaults live in QueryEngineConfig.defaults (the const object below).
 * Consumers merge their overrides with those defaults at startup.
 */

// ---------------------------------------------------------------------------
// Dictionary paths
// ---------------------------------------------------------------------------

export interface DictionaryConfig {
  /**
   * Absolute or CWD-relative path to the niche dictionaries directory.
   * Expected to contain one or more *.yml / *.yaml files matching
   * NicheDictionaryFile schema.
   */
  readonly nicheDictionariesDir: string;

  /**
   * Absolute or CWD-relative path to the geo dictionaries directory.
   * Expected to contain one or more *.yml / *.yaml files matching
   * GeoDictionaryFile schema.
   */
  readonly geoDictionariesDir: string;
}

// ---------------------------------------------------------------------------
// Canonicalization behaviour
// ---------------------------------------------------------------------------

export interface CanonicalizerConfig {
  /**
   * If true, sort modifier-only token groups alphabetically so that
   * "emergency licensed plumbers" and "licensed emergency plumbers"
   * produce the same canonical text and therefore the same hash.
   *
   * Default: true.
   */
  readonly sortModifierTokens: boolean;

  /**
   * Characters to strip during text normalisation.
   * Expressed as a regex character class body (without brackets).
   * Default strips commas, periods, semicolons, and extra hyphens.
   *
   * Default: ",\\.;!?"
   */
  readonly stripPunctuationPattern: string;
}

// ---------------------------------------------------------------------------
// Expansion behaviour
// ---------------------------------------------------------------------------

export interface ExpansionConfig {
  /**
   * Default maximum variants to generate per seed when the seed does
   * not specify its own maxVariants.
   * Default: 20.
   */
  readonly defaultMaxVariants: number;

  /**
   * Strategy IDs to apply by default when the seed does not specify
   * expansionStrategyIds. Applied in the order given.
   * Default: ["synonym", "modifier", "plural", "geo"].
   */
  readonly defaultStrategyIds: readonly string[];

  /**
   * If true, a strategy that returns Err does not abort the entire
   * expansion — the expander logs the error and continues with the
   * remaining strategies. If false, the first strategy error is fatal.
   * Default: true.
   */
  readonly continueOnStrategyError: boolean;
}

// ---------------------------------------------------------------------------
// Geo resolver behaviour
// ---------------------------------------------------------------------------

export interface GeoResolverConfig {
  /**
   * When a GeoTarget already has coordinates, the PassthroughGeoResolver
   * returns them directly. This flag controls whether it validates the
   * coordinate range (lat ∈ [-90,90], lng ∈ [-180,180]) before returning.
   * Default: true.
   */
  readonly validateExistingCoordinates: boolean;
}

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

export interface QueryEngineConfig {
  readonly dictionaries: DictionaryConfig;
  readonly canonicalizer: CanonicalizerConfig;
  readonly expansion: ExpansionConfig;
  readonly geoResolver: GeoResolverConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const QUERY_ENGINE_DEFAULTS = {
  canonicalizer: {
    sortModifierTokens: true,
    stripPunctuationPattern: ",\\.;!?",
  },
  expansion: {
    defaultMaxVariants: 20,
    defaultStrategyIds: [
      "synonym",
      "modifier",
      "plural",
      "geo",
    ] as readonly string[],
    continueOnStrategyError: true,
  },
  geoResolver: {
    validateExistingCoordinates: true,
  },
} as const satisfies Omit<QueryEngineConfig, "dictionaries">;
