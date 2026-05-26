/**
 * @module query-engine/dictionaries/GeoDictionary
 *
 * Schema types for geo dictionary YAML files and their validated
 * in-memory representation.
 *
 * Geo dictionaries allow GeoExpansionStrategy to generate sub-location
 * variants — e.g. district or neighbourhood names within a city — so
 * that one seed produces queries targeting multiple specific areas.
 *
 * YAML file shape (geo-nigeria-lagos.yml):
 * ─────────────────────────────────────────
 * version: 1
 * country: Nigeria
 * countryCode: NG
 * regions:
 *   - name: Lagos
 *     type: state
 *     subLocations:
 *       - name: Victoria Island
 *         type: district
 *         aliases:
 *           - VI
 *           - Victoria Island Lagos
 *       - name: Lekki
 *         type: district
 *         aliases:
 *           - Lekki Peninsula
 *       - name: Ikeja
 *         type: district
 */
export interface RawGeoDictionaryFile {
    readonly version?: unknown;
    readonly country?: unknown;
    readonly countryCode?: unknown;
    readonly regions?: unknown;
}
export interface RawGeoRegion {
    readonly name?: unknown;
    readonly type?: unknown;
    readonly subLocations?: unknown;
    readonly aliases?: unknown;
}
export type GeoLocationType = "country" | "state" | "region" | "county" | "city" | "district" | "neighbourhood" | "postal";
export interface GeoSubLocation {
    /** Primary name used in query text. e.g. "Victoria Island" */
    readonly name: string;
    readonly type: GeoLocationType;
    /**
     * Alternative names for this location that may produce distinct
     * query variants.
     * e.g. ["VI", "Victoria Island Lagos"]
     */
    readonly aliases: readonly string[];
}
export interface GeoRegion {
    /** Primary region name. e.g. "Lagos" */
    readonly name: string;
    readonly type: GeoLocationType;
    /**
     * Sub-locations within this region that GeoExpansionStrategy uses
     * to generate location-specific query variants.
     */
    readonly subLocations: readonly GeoSubLocation[];
    /** Alternative names for the region itself. */
    readonly aliases: readonly string[];
}
export interface GeoDictionary {
    readonly version: 1;
    readonly country: string;
    readonly countryCode: string;
    readonly regions: readonly GeoRegion[];
}
export interface GeoDictionaryIndex {
    /**
     * Returns the GeoDictionary for a given country code (ISO 3166-1 alpha-2),
     * case-insensitive. Returns undefined if not loaded.
     */
    getByCountryCode(code: string): GeoDictionary | undefined;
    /**
     * Returns the GeoDictionary for a given country name, case-insensitive.
     */
    getByCountryName(name: string): GeoDictionary | undefined;
    /**
     * Returns all sub-locations under a named region, across all loaded
     * country dictionaries. Returns empty array if no match.
     */
    getSubLocations(regionName: string): readonly GeoSubLocation[];
    readonly size: number;
}
//# sourceMappingURL=GeoDictionary.d.ts.map