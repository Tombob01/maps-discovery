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

export interface ExpandedKeyword {
  readonly keyword: string;
  readonly popularity: KeywordPopularity;
  readonly category: KeywordCategory;
}

export interface ExpansionOptions {
  readonly location?: string;
  readonly limit?: number;
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