/**
 * @module core/models/Query
 *
 * Domain models for the query lifecycle:
 *
 *   QuerySeed  →  (QueryBuilder)      →  GeneratedQuery
 *              →  (QueryCanonicalizer) →  CanonicalizedQuery  (stable identity)
 *              →  (QueryExpander)      →  GeneratedQuery[]    (variants)
 *              →  (GeoResolver)        →  ResolvedQuery       (ready for provider)
 *
 * These are pure data shapes. No builder methods, no factory functions.
 */
export {};
//# sourceMappingURL=Query.js.map