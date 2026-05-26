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
import { BaseExpansionStrategy, } from "./BaseExpansionStrategy.js";
export class PluralExpansionStrategy extends BaseExpansionStrategy {
    niches;
    id = "plural";
    description = "Substitutes term with its plural/singular dictionary form";
    static CONFIDENCE = 0.9;
    constructor(niches) {
        super();
        this.niches = niches;
    }
    _apply(query, context) {
        const dict = this.niches.get(query.niche);
        if (dict === undefined)
            return [];
        const candidates = [];
        const textLower = query.rawText.toLowerCase();
        for (const term of dict.terms) {
            if (candidates.length >= context.maxNew)
                break;
            const termLower = term.term.toLowerCase();
            // Case 1: rawText contains the base term → try substituting plural
            if (textLower.includes(termLower) && term.plural !== undefined) {
                const variant = replaceTermCaseInsensitive(query.rawText, term.term, term.plural);
                if (variant !== query.rawText) {
                    candidates.push({
                        rawText: variant,
                        metadata: this._meta({
                            sourceTerm: term.term,
                            confidence: PluralExpansionStrategy.CONFIDENCE,
                            parentQueryHash: query.queryHash,
                        }),
                    });
                }
            }
            if (candidates.length >= context.maxNew)
                break;
            // Case 2: rawText contains the plural form → try substituting singular
            if (term.plural !== undefined && term.singular !== undefined) {
                const pluralLower = term.plural.toLowerCase();
                if (textLower.includes(pluralLower)) {
                    const variant = replaceTermCaseInsensitive(query.rawText, term.plural, term.singular);
                    if (variant !== query.rawText) {
                        candidates.push({
                            rawText: variant,
                            metadata: this._meta({
                                sourceTerm: term.plural,
                                confidence: PluralExpansionStrategy.CONFIDENCE,
                                parentQueryHash: query.queryHash,
                            }),
                        });
                    }
                }
            }
        }
        return candidates;
    }
}
// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------
function replaceTermCaseInsensitive(text, term, replacement) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
    return text.replace(pattern, replacement);
}
//# sourceMappingURL=PluralExpansionStrategy.js.map