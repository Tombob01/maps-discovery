/**
 * @module core/types/geo
 * Geographic value objects used across query engine and provider interfaces.
 * Pure data shapes — no logic, no computation.
 */
/** WGS-84 latitude/longitude pair. */
export interface GeoCoordinates {
    readonly lat: number;
    readonly lng: number;
}
/** Axis-aligned rectangular bounding box. */
export interface GeoBounds {
    readonly northeast: GeoCoordinates;
    readonly southwest: GeoCoordinates;
}
/** Circle defined by a centre point and radius. */
export interface GeoCircle {
    readonly center: GeoCoordinates;
    readonly radiusKm: number;
}
/**
 * Structured postal address.
 * `raw` is always the unmodified string from the provider.
 * Structured fields are populated by the normalizer and may be null.
 */
export interface Address {
    readonly raw: string;
    readonly street: string | null;
    readonly city: string | null;
    readonly state: string | null;
    readonly postalCode: string | null;
    readonly country: string | null;
    /** ISO 3166-1 alpha-2, populated after normalization. */
    readonly countryCode: string | null;
}
/**
 * Abstract location target specified when seeding a run.
 * Deliberately loose — the GeoResolver converts this to ResolvedGeo.
 */
export interface GeoTarget {
    /** Human-readable label, used in query text. e.g. "Lagos, Nigeria" */
    readonly displayName: string;
    readonly country: string;
    readonly state?: string;
    readonly city?: string;
    readonly postalCode?: string;
    /** If provided, overrides geocoding. */
    readonly coordinates?: GeoCoordinates;
    /** Search radius in km; provider interprets this. */
    readonly radiusKm?: number;
}
/**
 * GeoTarget after the GeoResolver has confirmed the coordinates.
 * The `resolvedCoordinates` field is always present.
 */
export interface ResolvedGeoTarget extends GeoTarget {
    readonly resolvedCoordinates: GeoCoordinates;
    /** Canonical bounding box, if the resolver returned one. */
    readonly bounds?: GeoBounds;
}
export interface AdminRegion {
    readonly name: string;
    readonly code: string;
    readonly level: AdminLevel;
    readonly country: string;
    readonly center?: GeoCoordinates;
    readonly bounds?: GeoBounds;
}
export type AdminLevel = "country" | "state" | "county" | "city" | "district" | "postal";
//# sourceMappingURL=geo.d.ts.map