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
export { createQueryEngine, buildQueryEngineConfig, } from "./QueryEngineFactory.js";
export type { QueryEngineAssemblyOptions, AssembledQueryEngine, } from "./QueryEngineFactory.js";
export { QueryEngine } from "./QueryEngine.js";
export { QueryBuilder } from "./QueryBuilder.js";
export { QueryExpander } from "./QueryExpander.js";
export { QueryCanonicalizer } from "./QueryCanonicalizer.js";
export { ResolvedQueryFactory } from "./ResolvedQueryFactory.js";
export { PassthroughGeoResolver, StaticCoordinateGeoResolver, } from "./GeoResolver.js";
export { BaseExpansionStrategy, SynonymExpansionStrategy, ModifierExpansionStrategy, PluralExpansionStrategy, GeoExpansionStrategy, } from "./strategies/index.js";
export type { StrategyCandidate } from "./strategies/index.js";
export { loadNicheDictionaries, loadGeoDictionaries, loadAllDictionaries, } from "./dictionaries/DictionaryLoader.js";
export type { NicheDictionary, NicheTerm, NicheDictionaryIndex, } from "./dictionaries/NicheDictionary.js";
export type { GeoDictionary, GeoRegion, GeoSubLocation, GeoLocationType, GeoDictionaryIndex, } from "./dictionaries/GeoDictionary.js";
export { QUERY_ENGINE_DEFAULTS } from "./config/QueryEngineConfig.js";
export type { QueryEngineConfig, DictionaryConfig, CanonicalizerConfig, ExpansionConfig, GeoResolverConfig, } from "./config/QueryEngineConfig.js";
//# sourceMappingURL=index.d.ts.map