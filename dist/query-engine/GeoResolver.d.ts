/**
 * @module query-engine/GeoResolver
 *
 * Provides two GeoResolver implementations:
 *
 *   PassthroughGeoResolver  — local-only, zero external calls.
 *     Returns existing coordinates if present on the GeoTarget.
 *     Falls back to a static country-centroid lookup for common countries.
 *     Never calls any external API.
 *
 *   StaticCoordinateGeoResolver — accepts a caller-supplied coordinate map.
 *     Useful for tests and for seeding known cities without a live API.
 *
 * The IGeoResolver interface (in core/) is the contract; both classes
 * implement it. Future resolvers (Google Geocoding, Nominatim, etc.)
 * plug in through the same interface without touching this file.
 */
import type { GeoResolverConfig } from "./config/QueryEngineConfig.js";
import type { IGeoResolver, GeoResolutionErrorDetail } from "../core/interfaces/IQueryEngine.js";
import type { Result } from "../core/types/common.js";
import type { GeoTarget, ResolvedGeoTarget, GeoCoordinates } from "../core/types/geo.js";
/**
 * Local-only resolver. Resolution priority:
 *   1. GeoTarget.coordinates (explicit override) — validated if config says so
 *   2. Static country-centroid lookup by ISO country code
 *   3. Static country-centroid lookup by country name
 *   4. Err("NOT_FOUND") — caller must decide whether to skip or abort
 *
 * Never throws. Never calls any external service.
 */
export declare class PassthroughGeoResolver implements IGeoResolver {
    private readonly config;
    constructor(config: GeoResolverConfig);
    resolve(target: GeoTarget): Promise<Result<ResolvedGeoTarget, GeoResolutionErrorDetail>>;
}
/**
 * Accepts a caller-supplied map of { displayName → GeoCoordinates }.
 * Lookup is case-insensitive on the displayName.
 * Falls back to PassthroughGeoResolver if no match is found.
 *
 * Primary use: tests and seeded city lists.
 */
export declare class StaticCoordinateGeoResolver implements IGeoResolver {
    private readonly lookup;
    private readonly fallback;
    constructor(coordinates: Readonly<Record<string, GeoCoordinates>>, config: GeoResolverConfig);
    resolve(target: GeoTarget): Promise<Result<ResolvedGeoTarget, GeoResolutionErrorDetail>>;
}
//# sourceMappingURL=GeoResolver.d.ts.map