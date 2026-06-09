/**
 * @module query-engine
 *
 * Public API surface for the query-engine package.
 *
 * External consumers (pipeline workers, tests, scripts) import from here.
 * They never import from sub-modules directly.
 *
 * What is exported:
 *   - Factory function and assembly types    (QueryEngineFactory)
 *   - Core implementations                  (for testing / direct wiring)
 *   - Expansion strategy classes            (for plugin registration)
 *   - Dictionary loader functions           (for pre-loading)
 *   - Config types and defaults
 *
 * What is NOT exported:
 *   - Internal helpers (_filterCandidates, etc.)
 *   - Raw YAML types (RawNicheDictionaryFile, etc.)
 */

// â”€â”€ Factory (primary entry point) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export {
  createQueryEngine,
  buildQueryEngineConfig,
} from "./QueryEngineFactory.js";
export type {
  QueryEngineAssemblyOptions,
  AssembledQueryEngine,
} from "./QueryEngineFactory.js";

// â”€â”€ Core implementations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export { QueryEngine } from "./QueryEngine.js";
export { QueryBuilder } from "./QueryBuilder.js";
export { QueryExpander } from "./QueryExpander.js";
export { QueryCanonicalizer } from "./QueryCanonicalizer.js";
export { ResolvedQueryFactory } from "./ResolvedQueryFactory.js";

// â”€â”€ Geo resolvers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export {
  PassthroughGeoResolver,
  StaticCoordinateGeoResolver,
} from "./GeoResolver.js";

// â”€â”€ Expansion strategies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export {
  BaseExpansionStrategy,
  SynonymExpansionStrategy,
  ModifierExpansionStrategy,
  PluralExpansionStrategy,
  GeoExpansionStrategy,
} from "./strategies/index.js";
export type { StrategyCandidate } from "./strategies/index.js";

// â”€â”€ Dictionary loaders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export {
  loadNicheDictionaries,
  loadGeoDictionaries,
  loadAllDictionaries,
} from "./dictionaries/DictionaryLoader.js";

// â”€â”€ Dictionary types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type {
  NicheDictionary,
  NicheTerm,
  NicheDictionaryIndex,
} from "./dictionaries/NicheDictionary.js";
export type {
  GeoDictionary,
  GeoRegion,
  GeoSubLocation,
  GeoLocationType,
  GeoDictionaryIndex,
} from "./dictionaries/GeoDictionary.js";

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export { QUERY_ENGINE_DEFAULTS } from "./config/QueryEngineConfig.js";
export type {
  QueryEngineConfig,
  DictionaryConfig,
  CanonicalizerConfig,
  ExpansionConfig,
  GeoResolverConfig,
} from "./config/QueryEngineConfig.js";

// -- Nominatim geo resolver -------------------------------------------------
export { NominatimGeoResolver } from "./NominatimGeoResolver.js";
export type { NominatimConfig } from "./NominatimGeoResolver.js";

// -- Geo cache interface ----------------------------------------------------
export { InMemoryGeoCache } from "./IGeoCache.js";
export type { IGeoCache } from "./IGeoCache.js";
