/**
 * @module maps-discovery
 *
 * Root public API surface.
 *
 * Import from specific sub-packages for tree-shaking:
 *   import { QueryEngine } from "maps-discovery/query-engine";
 *   import type { BusinessRecord } from "maps-discovery/core";
 *
 * Or import everything for scripts / CLI use:
 *   import { env, createQueryEngine } from "maps-discovery";
 */
// Configuration — always load first
export { env, getConfig, EnvValidationError } from "./config/index.js";
// Core domain
export * from "./core/index.js";
// Query engine
export { createQueryEngine, buildQueryEngineConfig, QueryEngine, QueryBuilder, QueryExpander, QueryCanonicalizer, ResolvedQueryFactory, PassthroughGeoResolver, StaticCoordinateGeoResolver, BaseExpansionStrategy, SynonymExpansionStrategy, ModifierExpansionStrategy, PluralExpansionStrategy, GeoExpansionStrategy, loadNicheDictionaries, loadGeoDictionaries, loadAllDictionaries, QUERY_ENGINE_DEFAULTS, } from "./query-engine/index.js";
//# sourceMappingURL=index.js.map