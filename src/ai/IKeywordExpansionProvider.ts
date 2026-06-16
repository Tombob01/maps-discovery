/**
 * @module ai/IKeywordExpansionProvider
 *
 * Contract for AI-powered keyword expansion providers.
 * Implementations must never throw — errors surface as empty arrays.
 */

export type KeywordPopularity = "high" | "medium" | "low";

export type KeywordCategory =
  | "commercial"
  | "local"
  | "synonym"
  | "long_tail"
  | "intent";

/**
 * The prompt-level strategy used to generate a batch of suggestions.
 * Controls which prompt variant is sent to the AI provider.
 *
 * Distinct from KeywordCategory, which is a per-keyword output assigned
 * by the AI model independently of the strategy used to generate it.
 *
 * commercial  — synonyms and natural commercial phrasings for the same service
 * discovery   — sub-services and specialised offerings within the same market
 * geographic  — same service across nearby sub-geographies in the same metro
 */
export type ExpansionStrategy = "commercial" | "discovery" | "geographic";

export interface ExpandedKeyword {
  readonly keyword: string;
  readonly popularity: KeywordPopularity;
  readonly category: KeywordCategory;
}

export interface ExpansionOptions {
  readonly location?: string;
  readonly limit?: number;
  readonly strategy?: ExpansionStrategy;
}

export interface IKeywordExpansionProvider {
  /**
   * Expands a seed keyword into related search phrases.
   * Must never throw — return [] on any failure.
   */
  expand(
    keyword: string,
    options?: ExpansionOptions,
  ): Promise<ExpandedKeyword[]>;
}