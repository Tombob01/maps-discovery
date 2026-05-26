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

import {
  BaseExpansionStrategy,
  type StrategyCandidate,
} from "./BaseExpansionStrategy.js";

import type {
  GeneratedQuery,
  ExpansionContext,
} from "../../core/models/Query.js";
import type { NicheDictionaryIndex } from "../dictionaries/NicheDictionary.js";

export class SynonymExpansionStrategy extends BaseExpansionStrategy {
  override readonly id = "synonym" as const;
  override readonly description =
    "Substitutes the niche term with dictionary synonyms";

  /** Confidence assigned to all synonym variants. */
  private static readonly CONFIDENCE = 0.85;

  constructor(private readonly niches: NicheDictionaryIndex) {
    super();
  }

  protected override _apply(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): readonly StrategyCandidate[] {
    const dict = this.niches.get(query.niche);
    if (dict === undefined) return [];

    const candidates: StrategyCandidate[] = [];

    for (const term of dict.terms) {
      // Find which form of the term appears in the rawText (plural, singular, or base)
      const forms = [term.term, term.plural, term.singular].filter(
        (f): f is string => f !== undefined,
      );
      const matchedForm = forms.find((f) => {
        const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(query.rawText);
      });
      if (matchedForm === undefined) continue;

      for (const synonym of term.synonyms) {
        if (candidates.length >= context.maxNew) break;

        // Replace using the matched form so word boundaries align correctly
        const variant = replaceTermCaseInsensitive(
          query.rawText,
          matchedForm,
          synonym,
        );
        if (variant === query.rawText) continue; // no-op replacement

        candidates.push({
          rawText: variant,
          metadata: this._meta({
            sourceTerm: term.term,
            confidence: SynonymExpansionStrategy.CONFIDENCE,
            parentQueryHash: query.queryHash,
          }),
        });
      }

      if (candidates.length >= context.maxNew) break;
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
function replaceTermCaseInsensitive(
  text: string,
  term: string,
  replacement: string,
): string {
  // Escape special regex characters in the term
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Word-boundary match to avoid partial replacements ("plumber" inside "plumbers")
  const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
  return text.replace(pattern, replacement);
}
