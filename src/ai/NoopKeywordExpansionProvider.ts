/**
 * @module ai/NoopKeywordExpansionProvider
 * Zero-cost fallback — returns empty suggestions.
 * Used when no AI API key is configured.
 */

import type {
  IKeywordExpansionProvider,
  ExpandedKeyword,
  ExpansionOptions,
} from "./IKeywordExpansionProvider.js";

export class NoopKeywordExpansionProvider implements IKeywordExpansionProvider {
  async expand(
    _keyword: string,
    _options?: ExpansionOptions,
  ): Promise<ExpandedKeyword[]> {
    return [];
  }
}