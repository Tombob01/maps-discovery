/**
 * @module query-engine/ResolvedQueryFactory
 *
 * Implements IResolvedQueryFactory.
 * Assembles a ResolvedQuery from a GeneratedQuery and a ResolvedGeoTarget,
 * advancing the lifecycleState and preserving all other fields verbatim.
 *
 * No logic beyond field assembly — purely structural.
 */
import type { IResolvedQueryFactory } from "../core/interfaces/IQueryEngine.js";
import type { GeneratedQuery, ResolvedQuery } from "../core/models/Query.js";
import type { ResolvedGeoTarget } from "../core/types/geo.js";
export declare class ResolvedQueryFactory implements IResolvedQueryFactory {
    create(query: GeneratedQuery, resolvedGeo: ResolvedGeoTarget): ResolvedQuery;
}
//# sourceMappingURL=ResolvedQueryFactory.d.ts.map