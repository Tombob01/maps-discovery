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
export {};
//# sourceMappingURL=GeoDictionary.js.map