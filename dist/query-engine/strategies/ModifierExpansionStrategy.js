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
import { BaseExpansionStrategy } from "./BaseExpansionStrategy.js";
export class ModifierExpansionStrategy extends BaseExpansionStrategy {
    niches;
    id = "modifier";
    description = "Prepends niche modifiers to the base query";
    static CONFIDENCE = 0.80;
    constructor(niches) {
        super();
        this.niches = niches;
    }
    _apply(query, context) {
        const dict = this.niches.get(query.niche);
        if (dict === undefined)
            return [];
        // Collect all unique modifiers across all terms in the dictionary
        const allModifiers = collectUniqueModifiers(dict.terms.flatMap(t => t.modifiers));
        // Exclude modifiers that are already present in the rawText (case-insensitive)
        const textLower = query.rawText.toLowerCase();
        const newModifiers = allModifiers.filter(m => !textLower.includes(m.toLowerCase()));
        const candidates = [];
        for (const modifier of newModifiers) {
            if (candidates.length >= context.maxNew)
                break;
            const variant = `${modifier} ${query.rawText}`;
            candidates.push({
                rawText: variant,
                metadata: this._meta({
                    sourceTerm: modifier,
                    confidence: ModifierExpansionStrategy.CONFIDENCE,
                    parentQueryHash: query.queryHash,
                }),
            });
        }
        return candidates;
    }
}
// ---------------------------------------------------------------------------
// Pure helper — deduplicate modifier list preserving order
// ---------------------------------------------------------------------------
function collectUniqueModifiers(modifiers) {
    const seen = new Set();
    const result = [];
    for (const m of modifiers) {
        const key = m.trim().toLowerCase();
        if (key === "" || seen.has(key))
            continue;
        seen.add(key);
        result.push(m.trim());
    }
    return result;
}
//# sourceMappingURL=ModifierExpansionStrategy.js.map