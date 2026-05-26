/**
 * @module query-engine/strategies/GeoExpansionStrategy
 *
 * Generates query variants by substituting the base geo location with
 * specific sub-locations (districts, neighbourhoods) from the geo dictionary.
 *
 * Example:
 *   seed query: "plumbers in Lagos"
 *   sub-locations of Lagos: ["Victoria Island", "Lekki", "Ikeja", "Surulere"]
 *   output:
 *     "plumbers in Victoria Island"
 *     "plumbers in Lekki"
 *     "plumbers in Ikeja"
 *     "plumbers in Surulere"
 *
 * Resolution order:
 *   1. Try GeoTarget.city  → look up sub-locations in geo dictionary
 *   2. Try GeoTarget.state → look up sub-locations
 *   3. Try GeoTarget.displayName (stripped of country suffix)
 *   If no sub-locations are found in any step, returns empty array.
 *
 * Geo label replacement targets the displayName in the rawText.
 * The rawText is assumed to contain the GeoTarget.displayName or a
 * recognisable sub-string of it; the strategy does a best-effort
 * case-insensitive replacement of the city/state name.
 *
 * Strategy ID: "geo"
 * Confidence:  0.75 (sub-locations are narrower scope, lower baseline coverage)
 */
import { BaseExpansionStrategy, } from "./BaseExpansionStrategy.js";
export class GeoExpansionStrategy extends BaseExpansionStrategy {
    geodict;
    id = "geo";
    description = "Substitutes city/state with sub-locations from geo dictionary";
    static CONFIDENCE = 0.75;
    constructor(geodict) {
        super();
        this.geodict = geodict;
    }
    _apply(query, context) {
        const { geoTarget } = query;
        // Resolve sub-location names in priority order
        const regionName = geoTarget.city ??
            geoTarget.state ??
            extractCityFromDisplayName(geoTarget.displayName);
        if (regionName === undefined)
            return [];
        const subLocations = this.geodict.getSubLocations(regionName);
        if (subLocations.length === 0)
            return [];
        // Determine what to replace: prefer city, then state, then displayName first word
        const replaceTarget = geoTarget.city ?? geoTarget.state ?? regionName;
        const textLower = query.rawText.toLowerCase();
        const targetLower = replaceTarget.toLowerCase();
        // Only generate variants if the target appears in the rawText
        if (!textLower.includes(targetLower))
            return [];
        const candidates = [];
        for (const sub of subLocations) {
            if (candidates.length >= context.maxNew)
                break;
            const variant = replaceLocationCaseInsensitive(query.rawText, replaceTarget, sub.name);
            if (variant === query.rawText)
                continue;
            candidates.push({
                rawText: variant,
                metadata: this._meta({
                    sourceTerm: replaceTarget,
                    confidence: GeoExpansionStrategy.CONFIDENCE,
                    parentQueryHash: query.queryHash,
                }),
            });
            // Also generate alias variants (e.g. "VI" for "Victoria Island")
            for (const alias of sub.aliases) {
                if (candidates.length >= context.maxNew)
                    break;
                const aliasVariant = replaceLocationCaseInsensitive(query.rawText, replaceTarget, alias);
                if (aliasVariant === query.rawText || aliasVariant === variant)
                    continue;
                // Skip aliases whose text still contains a primary sub-location name
                const aliasLower = alias.toLowerCase();
                const isPrimaryName = sub.name.toLowerCase() === aliasLower ||
                    aliasLower.includes(sub.name.toLowerCase());
                if (isPrimaryName)
                    continue;
                candidates.push({
                    rawText: aliasVariant,
                    metadata: this._meta({
                        sourceTerm: replaceTarget,
                        confidence: GeoExpansionStrategy.CONFIDENCE * 0.9, // aliases slightly lower
                        parentQueryHash: query.queryHash,
                    }),
                });
            }
        }
        return candidates;
    }
}
// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
/**
 * Attempts to extract the first meaningful location word from a displayName.
 * e.g. "Lagos, Nigeria" → "Lagos"
 *      "New York"       → "New York"  (no comma — return whole string)
 */
function extractCityFromDisplayName(displayName) {
    const trimmed = displayName.trim();
    if (trimmed === "")
        return undefined;
    const commaIdx = trimmed.indexOf(",");
    return commaIdx > 0 ? trimmed.slice(0, commaIdx).trim() : trimmed;
}
function replaceLocationCaseInsensitive(text, target, replacement) {
    // Location names may include spaces; don't use word-boundary \b
    // as it doesn't anchor correctly to multi-word locations.
    // Use a case-insensitive literal replacement instead.
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "gi");
    return text.replace(pattern, replacement);
}
//# sourceMappingURL=GeoExpansionStrategy.js.map