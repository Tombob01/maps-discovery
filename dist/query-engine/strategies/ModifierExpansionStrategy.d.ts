/**
 * @module query-engine/strategies/ModifierExpansionStrategy
 *
 * Generates query variants by prepending qualifying modifiers from the
 * niche dictionary to the base query text.
 *
 * Example:
 *   seed query: "plumbers in Lagos"
 *   modifiers:  ["emergency", "residential", "commercial", "licensed"]
 *   output:
 *     "emergency plumbers in Lagos"
 *     "residential plumbers in Lagos"
 *     "commercial plumbers in Lagos"
 *     "licensed plumbers in Lagos"
 *
 * Also respects seed-level modifiers (QuerySeed.modifiers) passed
 * through the query's rawText — those are treated as already-applied
 * and are excluded from the generated variants to avoid redundancy.
 *
 * Strategy ID: "modifier"
 * Confidence:  0.80 (modifier changes query intent slightly)
 */
import { BaseExpansionStrategy, type StrategyCandidate } from "./BaseExpansionStrategy.js";
import type { GeneratedQuery, ExpansionContext } from "../../core/models/Query.js";
import type { NicheDictionaryIndex } from "../dictionaries/NicheDictionary.js";
export declare class ModifierExpansionStrategy extends BaseExpansionStrategy {
    private readonly niches;
    readonly id: "modifier";
    readonly description = "Prepends niche modifiers to the base query";
    private static readonly CONFIDENCE;
    constructor(niches: NicheDictionaryIndex);
    protected _apply(query: GeneratedQuery, context: ExpansionContext): readonly StrategyCandidate[];
}
//# sourceMappingURL=ModifierExpansionStrategy.d.ts.map