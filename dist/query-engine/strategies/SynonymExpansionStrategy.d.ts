/**
 * @module query-engine/strategies/SynonymExpansionStrategy
 *
 * Generates query variants by substituting the niche term with
 * semantically equivalent synonyms from the niche dictionary.
 *
 * Example:
 *   seed query: "plumbers in Lagos"
 *   synonyms:   ["plumbing contractor", "pipefitter", "drainage specialist"]
 *   output:
 *     "plumbing contractor in Lagos"
 *     "pipefitter in Lagos"
 *     "drainage specialist in Lagos"
 *
 * Strategy ID: "synonym"
 * Confidence:  0.85 (synonyms are near-equivalent but not identical)
 */
import { BaseExpansionStrategy, type StrategyCandidate } from "./BaseExpansionStrategy.js";
import type { GeneratedQuery, ExpansionContext } from "../../core/models/Query.js";
import type { NicheDictionaryIndex } from "../dictionaries/NicheDictionary.js";
export declare class SynonymExpansionStrategy extends BaseExpansionStrategy {
    private readonly niches;
    readonly id: "synonym";
    readonly description = "Substitutes the niche term with dictionary synonyms";
    /** Confidence assigned to all synonym variants. */
    private static readonly CONFIDENCE;
    constructor(niches: NicheDictionaryIndex);
    protected _apply(query: GeneratedQuery, context: ExpansionContext): readonly StrategyCandidate[];
}
//# sourceMappingURL=SynonymExpansionStrategy.d.ts.map