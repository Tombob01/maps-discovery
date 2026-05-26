/**
 * @module query-engine/ResolvedQueryFactory
 *
 * Implements IResolvedQueryFactory.
 * Assembles a ResolvedQuery from a GeneratedQuery and a ResolvedGeoTarget,
 * advancing the lifecycleState and preserving all other fields verbatim.
 *
 * No logic beyond field assembly — purely structural.
 */
export class ResolvedQueryFactory {
    create(query, resolvedGeo) {
        return Object.freeze({
            ...query,
            resolvedGeoTarget: resolvedGeo,
            // GeoResolver has confirmed coordinates — advance lifecycle
            lifecycleState: "canonicalized",
        });
    }
}
//# sourceMappingURL=ResolvedQueryFactory.js.map