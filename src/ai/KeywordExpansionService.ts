/**
 * @module ai/KeywordExpansionService
 *
 * Wraps IKeywordExpansionProvider with:
 *   - In-memory cache (Map, configurable max size)
 *   - Deduplication by normalized keyword string
 *   - Post-processing filter (near-me, informational, cost/pricing)
 *   - Configurable result limit
 */

import type {
  IKeywordExpansionProvider,
  ExpandedKeyword,
  ExpansionOptions,
  ExpansionStrategy,
} from "./IKeywordExpansionProvider.js";

export interface ExpansionResponse {
  readonly original: string;
  readonly suggestions: ExpandedKeyword[];
}

export interface KeywordExpansionServiceOptions {
  readonly maxCacheSize?: number;
  readonly defaultLimit?: number;
}

// ---------------------------------------------------------------------------
// Post-processing filter
// ---------------------------------------------------------------------------

const NEAR_ME_RE = /\bnear\s+me\b/i;
const INFO_RE    = /^(how|what|why|when|is|are|can|do|does|will)\b/i;
const PRICING_RE = /\b(cost|price|pricing|rates?|how\s+much)\b/i;
// NOTE: "cheap" and "affordable" are intentionally excluded from the pricing
// filter. They represent commercial-intent searches ("cheap plumbers austin",
// "affordable roofing services") that are valid Google Maps queries and may
// surface real businesses. Re-evaluate once production yield data is available.

function isLowQuality(keyword: string): boolean {
  return NEAR_ME_RE.test(keyword) || INFO_RE.test(keyword) || PRICING_RE.test(keyword);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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
    const strategy: ExpansionStrategy = options?.strategy ?? "commercial";
    const cacheKey = `${keyword.toLowerCase().trim()}:${limit}:${options?.location ?? ""}:${strategy}`;

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

    const filtered = deduped.filter((item) => !isLowQuality(item.keyword));

    // Filter 1: remove suggestions whose normalized form exactly matches the normalized seed keyword.
    const normalizedSeed = keyword.toLowerCase().trim();
    const seedFiltered = filtered.filter(
      (item) => item.keyword.toLowerCase().trim() !== normalizedSeed,
    );

    // Filter 2: remove suggestions that begin with the location string.
    // Catches location-first phrasings regardless of whether the suggestion contains the seed phrase.
    // Skipped entirely when no location was supplied.
    const normalizedLocation = options?.location?.toLowerCase().trim();
    const positionFiltered = normalizedLocation
      ? seedFiltered.filter(
          (item) => !item.keyword.toLowerCase().trim().startsWith(normalizedLocation),
        )
      : seedFiltered;

    console.debug(
      "[expand:filter] keyword=%s deduped=%d quality=%d seed_removed=%d location_removed=%d final=%d",
      keyword,
      deduped.length,
      filtered.length,
      filtered.length - seedFiltered.length,
      seedFiltered.length - positionFiltered.length,
      positionFiltered.length,
    );

    if (positionFiltered.length === 0) return { original: keyword, suggestions: [] };
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, positionFiltered);
    return { original: keyword, suggestions: positionFiltered };
  }
}
