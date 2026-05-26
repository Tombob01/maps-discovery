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
import { ok, err } from "../core/types/common.js";
// ---------------------------------------------------------------------------
// Static country centroid table
// Used as a last-resort fallback when no coordinates are present.
// ---------------------------------------------------------------------------
/**
 * ISO 3166-1 alpha-2 → approximate geographic centroid.
 * Covers the most common countries for a business discovery platform.
 * Intentionally minimal — the purpose is fallback, not precision.
 */
const COUNTRY_CENTROIDS = Object.freeze({
    NG: { lat: 9.082, lng: 8.6753 }, // Nigeria
    GH: { lat: 7.9465, lng: -1.0232 }, // Ghana
    KE: { lat: -0.0236, lng: 37.9062 }, // Kenya
    ZA: { lat: -30.5595, lng: 22.9375 }, // South Africa
    EG: { lat: 26.8206, lng: 30.8025 }, // Egypt
    ET: { lat: 9.145, lng: 40.4897 }, // Ethiopia
    TZ: { lat: -6.369, lng: 34.8888 }, // Tanzania
    UG: { lat: 1.3733, lng: 32.2903 }, // Uganda
    US: { lat: 37.0902, lng: -95.7129 }, // United States
    GB: { lat: 55.3781, lng: -3.436 }, // United Kingdom
    CA: { lat: 56.1304, lng: -106.3468 }, // Canada
    AU: { lat: -25.2744, lng: 133.7751 }, // Australia
    IN: { lat: 20.5937, lng: 78.9629 }, // India
    BR: { lat: -14.235, lng: -51.9253 }, // Brazil
    DE: { lat: 51.1657, lng: 10.4515 }, // Germany
    FR: { lat: 46.2276, lng: 2.2137 }, // France
    AE: { lat: 23.4241, lng: 53.8478 }, // UAE
    SG: { lat: 1.3521, lng: 103.8198 }, // Singapore
    ZW: { lat: -19.0154, lng: 29.1549 }, // Zimbabwe
    CM: { lat: 3.848, lng: 11.5021 }, // Cameroon
    CI: { lat: 7.54, lng: -5.5471 }, // Côte d'Ivoire
    SN: { lat: 14.4974, lng: -14.4524 }, // Senegal
});
// ---------------------------------------------------------------------------
// Coordinate validation helper
// ---------------------------------------------------------------------------
function isValidCoordinates(c) {
    return (Number.isFinite(c.lat) &&
        c.lat >= -90 &&
        c.lat <= 90 &&
        Number.isFinite(c.lng) &&
        c.lng >= -180 &&
        c.lng <= 180);
}
function geoErr(code, message, input, cause) {
    const detail = { code, message, input };
    if (cause !== undefined)
        detail.cause = cause;
    return Object.freeze(detail);
}
// ---------------------------------------------------------------------------
// PassthroughGeoResolver
// ---------------------------------------------------------------------------
/**
 * Local-only resolver. Resolution priority:
 *   1. GeoTarget.coordinates (explicit override) — validated if config says so
 *   2. Static country-centroid lookup by ISO country code
 *   3. Static country-centroid lookup by country name
 *   4. Err("NOT_FOUND") — caller must decide whether to skip or abort
 *
 * Never throws. Never calls any external service.
 */
export class PassthroughGeoResolver {
    config;
    constructor(config) {
        this.config = config;
    }
    async resolve(target) {
        // ── Priority 1: explicit coordinates on the target ──
        if (target.coordinates !== undefined) {
            if (this.config.validateExistingCoordinates &&
                !isValidCoordinates(target.coordinates)) {
                return err(geoErr("INVALID_INPUT", `GeoTarget.coordinates out of range: lat=${target.coordinates.lat}, lng=${target.coordinates.lng}`, target));
            }
            return ok(buildResolvedTarget(target, target.coordinates));
        }
        // ── Priority 2: country code lookup ──
        const countryCodeKey = target.country.trim().toUpperCase().slice(0, 2);
        const byCode = COUNTRY_CENTROIDS[countryCodeKey];
        if (byCode !== undefined) {
            return ok(buildResolvedTarget(target, byCode));
        }
        // ── Priority 3: country name lookup (normalised) ──
        const centroid = lookupByCountryName(target.country);
        if (centroid !== undefined) {
            return ok(buildResolvedTarget(target, centroid));
        }
        return err(geoErr("NOT_FOUND", `No coordinates for "${target.displayName}" — add them to GeoTarget.coordinates or extend COUNTRY_CENTROIDS`, target));
    }
}
// ---------------------------------------------------------------------------
// StaticCoordinateGeoResolver
// ---------------------------------------------------------------------------
/**
 * Accepts a caller-supplied map of { displayName → GeoCoordinates }.
 * Lookup is case-insensitive on the displayName.
 * Falls back to PassthroughGeoResolver if no match is found.
 *
 * Primary use: tests and seeded city lists.
 */
export class StaticCoordinateGeoResolver {
    lookup;
    fallback;
    constructor(coordinates, config) {
        const m = new Map();
        for (const [k, v] of Object.entries(coordinates)) {
            m.set(k.trim().toLowerCase(), v);
        }
        this.lookup = m;
        this.fallback = new PassthroughGeoResolver(config);
    }
    async resolve(target) {
        const key = target.displayName.trim().toLowerCase();
        const found = this.lookup.get(key);
        if (found !== undefined) {
            if (!isValidCoordinates(found)) {
                return err(geoErr("INVALID_INPUT", `Static coordinates for "${target.displayName}" are out of range`, target));
            }
            return ok(buildResolvedTarget(target, found));
        }
        // Also try city name alone
        if (target.city !== undefined) {
            const cityKey = target.city.trim().toLowerCase();
            const byCity = this.lookup.get(cityKey);
            if (byCity !== undefined) {
                return ok(buildResolvedTarget(target, byCity));
            }
        }
        return this.fallback.resolve(target);
    }
}
// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function buildResolvedTarget(target, coordinates) {
    return Object.freeze({
        ...target,
        resolvedCoordinates: Object.freeze(coordinates),
    });
}
/**
 * Matches a country name string against the centroid table by normalising
 * both sides and checking for substring or prefix overlap.
 */
function lookupByCountryName(countryName) {
    const COUNTRY_NAMES = {
        nigeria: "NG",
        ghana: "GH",
        kenya: "KE",
        "south africa": "ZA",
        egypt: "EG",
        ethiopia: "ET",
        tanzania: "TZ",
        uganda: "UG",
        "united states": "US",
        usa: "US",
        "united kingdom": "GB",
        uk: "GB",
        england: "GB",
        canada: "CA",
        australia: "AU",
        india: "IN",
        brazil: "BR",
        germany: "DE",
        france: "FR",
        uae: "AE",
        "united arab emirates": "AE",
        singapore: "SG",
        zimbabwe: "ZW",
        cameroon: "CM",
        "ivory coast": "CI",
        "côte d'ivoire": "CI",
        senegal: "SN",
    };
    const normalised = countryName.trim().toLowerCase();
    const code = COUNTRY_NAMES[normalised];
    if (code === undefined)
        return undefined;
    return COUNTRY_CENTROIDS[code];
}
//# sourceMappingURL=GeoResolver.js.map