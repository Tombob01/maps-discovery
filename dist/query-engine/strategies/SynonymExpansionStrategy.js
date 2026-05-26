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
import { BaseExpansionStrategy } from "./BaseExpansionStrategy.js";
export class SynonymExpansionStrategy extends BaseExpansionStrategy {
    niches;
    id = "synonym";
    description = "Substitutes the niche term with dictionary synonyms";
    /** Confidence assigned to all synonym variants. */
    static CONFIDENCE = 0.85;
    constructor(niches) {
        super();
        this.niches = niches;
    }
    _apply(query, context) {
        const dict = this.niches.get(query.niche);
        if (dict === undefined)
            return [];
        const candidates = [];
        for (const term of dict.terms) {
            // Find which form of the term appears in the rawText (plural, singular, or base)
            const forms = [term.term, term.plural, term.singular].filter((f) => f !== undefined);
            const matchedForm = forms.find(f => {
                const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return new RegExp(`\\b${escaped}\\b`, "i").test(query.rawText);
            });
            if (matchedForm === undefined)
                continue;
            for (const synonym of term.synonyms) {
                if (candidates.length >= context.maxNew)
                    break;
                // Replace using the matched form so word boundaries align correctly
                const variant = replaceTermCaseInsensitive(query.rawText, matchedForm, synonym);
                if (variant === query.rawText)
                    continue; // no-op replacement
                candidates.push({
                    rawText: variant,
                    metadata: this._meta({
                        sourceTerm: term.term,
                        confidence: SynonymExpansionStrategy.CONFIDENCE,
                        parentQueryHash: query.queryHash,
                    }),
                });
            }
            if (candidates.length >= context.maxNew)
                break;
        }
        return candidates;
    }
}
// ---------------------------------------------------------------------------
// Pure helper — case-insensitive term replacement
// ---------------------------------------------------------------------------
/**
 * Replaces all case-insensitive occurrences of `term` in `text` with
 * `replacement`, preserving the surrounding text exactly.
 */
function replaceTermCaseInsensitive(text, term, replacement) {
    // Escape special regex characters in the term
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word-boundary match to avoid partial replacements ("plumber" inside "plumbers")
    const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
    return text.replace(pattern, replacement);
}
//# sourceMappingURL=SynonymExpansionStrategy.js.map