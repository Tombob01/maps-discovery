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
import { BaseExpansionStrategy, type StrategyCandidate } from "./BaseExpansionStrategy.js";
import type { GeneratedQuery, ExpansionContext } from "../../core/models/Query.js";
import type { GeoDictionaryIndex } from "../dictionaries/GeoDictionary.js";
export declare class GeoExpansionStrategy extends BaseExpansionStrategy {
    private readonly geodict;
    readonly id: "geo";
    readonly description = "Substitutes city/state with sub-locations from geo dictionary";
    private static readonly CONFIDENCE;
    constructor(geodict: GeoDictionaryIndex);
    protected _apply(query: GeneratedQuery, context: ExpansionContext): readonly StrategyCandidate[];
}
//# sourceMappingURL=GeoExpansionStrategy.d.ts.map