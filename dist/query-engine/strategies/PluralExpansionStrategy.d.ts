/**
 * @module query-engine/strategies/PluralExpansionStrategy
 *
 * Generates query variants by substituting the matched term with its
 * plural or singular form as defined in the niche dictionary.
 *
 * Example (plural → singular):
 *   seed query: "plumbers in Lagos"
 *   singular:   "plumber"
 *   output:     "plumber in Lagos"
 *
 * Example (singular → plural):
 *   seed query: "plumber in Lagos"
 *   plural:     "plumbers"
 *   output:     "plumbers in Lagos"
 *
 * Only generates a variant if the rawText contains the term AND the
 * alternate form exists in the dictionary AND produces a different string.
 *
 * Strategy ID: "plural"
 * Confidence:  0.90 (plural/singular forms are high-confidence equivalents)
 */
import { BaseExpansionStrategy, type StrategyCandidate } from "./BaseExpansionStrategy.js";
import type { GeneratedQuery, ExpansionContext } from "../../core/models/Query.js";
import type { NicheDictionaryIndex } from "../dictionaries/NicheDictionary.js";
export declare class PluralExpansionStrategy extends BaseExpansionStrategy {
    private readonly niches;
    readonly id: "plural";
    readonly description = "Substitutes term with its plural/singular dictionary form";
    private static readonly CONFIDENCE;
    constructor(niches: NicheDictionaryIndex);
    protected _apply(query: GeneratedQuery, context: ExpansionContext): readonly StrategyCandidate[];
}
//# sourceMappingURL=PluralExpansionStrategy.d.ts.map