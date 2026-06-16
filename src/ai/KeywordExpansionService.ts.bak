/**
 * @module ai/KeywordExpansionService
 *
 * Wraps IKeywordExpansionProvider with:
 *   - In-memory cache (Map, configurable max size)
 *   - Deduplication by normalized keyword string
 *   - Configurable result limit
 */

import type {
  IKeywordExpansionProvider,
  ExpandedKeyword,
  ExpansionOptions,
} from "./IKeywordExpansionProvider.js";

export interface ExpansionResponse {
  readonly original: string;
  readonly suggestions: ExpandedKeyword[];
}

export interface KeywordExpansionServiceOptions {
  readonly maxCacheSize?: number;
  readonly defaultLimit?: number;
}

export class KeywordExpansionService {
  private readonly cache = new Map<string, ExpandedKeyword[]>();
  private readonly maxCacheSize: number;
  private readonly defaultLimit: number;

  constructor(
    private readonly provider: IKeywordExpansionProvider,
    opts: KeywordExpansionServiceOptions = {},
  ) {
    this.maxCacheSize = opts.maxCacheSize ?? 256;
    this.defaultLimit = opts.defaultLimit ?? 10;
  }

  async expand(keyword: string, options?: ExpansionOptions): Promise<ExpansionResponse> {
    const limit = options?.limit ?? this.defaultLimit;
    const cacheKey = `${keyword.toLowerCase().trim()}:${limit}:${options?.location ?? ""}`;

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return { original: keyword, suggestions: cached };

    let raw: ExpandedKeyword[];
    try {
      raw = await this.provider.expand(keyword, { ...options, limit });
    } catch {
      raw = [];
    }

    const seen = new Set<string>();
    const deduped = raw.filter((item) => {
      const key = item.keyword.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, deduped);
    return { original: keyword, suggestions: deduped };
  }
}