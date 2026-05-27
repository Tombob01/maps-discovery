/**
 * @module tests/unit/ai/KeywordExpansionService
 */
import { describe, it, expect, vi } from "vitest";
import { KeywordExpansionService } from "../../../src/ai/KeywordExpansionService.js";
import type { IKeywordExpansionProvider, ExpandedKeyword } from "../../../src/ai/IKeywordExpansionProvider.js";

function makeProvider(results: ExpandedKeyword[]): IKeywordExpansionProvider {
  return { expand: vi.fn().mockResolvedValue(results) };
}

const SAMPLE: ExpandedKeyword[] = [
  { keyword: "emergency plumber", popularity: "high", category: "commercial" },
  { keyword: "pipe repair", popularity: "medium", category: "long_tail" },
];

describe("KeywordExpansionService", () => {
  it("returns original keyword and suggestions", async () => {
    const service = new KeywordExpansionService(makeProvider(SAMPLE));
    const result = await service.expand("plumber");
    expect(result.original).toBe("plumber");
    expect(result.suggestions).toHaveLength(2);
  });

  it("deduplicates by normalized keyword string", async () => {
    const duped: ExpandedKeyword[] = [
      { keyword: "Emergency Plumber", popularity: "high", category: "commercial" },
      { keyword: "emergency plumber", popularity: "high", category: "commercial" },
      { keyword: "pipe repair", popularity: "medium", category: "long_tail" },
    ];
    const service = new KeywordExpansionService(makeProvider(duped));
    const result = await service.expand("plumber");
    expect(result.suggestions).toHaveLength(2);
  });

  it("caches results and does not call provider again", async () => {
    const provider = makeProvider(SAMPLE);
    const service = new KeywordExpansionService(provider);
    await service.expand("plumber");
    await service.expand("plumber");
    expect(provider.expand).toHaveBeenCalledOnce();
  });

  it("cache key includes limit", async () => {
    const provider = makeProvider(SAMPLE);
    const service = new KeywordExpansionService(provider);
    await service.expand("plumber", { limit: 5 });
    await service.expand("plumber", { limit: 10 });
    expect(provider.expand).toHaveBeenCalledTimes(2);
  });

  it("returns empty suggestions when provider throws", async () => {
    const provider: IKeywordExpansionProvider = {
      expand: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const service = new KeywordExpansionService(provider);
    const result = await service.expand("plumber");
    expect(result.suggestions).toEqual([]);
  });

  it("evicts oldest cache entry when maxCacheSize is reached", async () => {
    const provider = makeProvider(SAMPLE);
    const service = new KeywordExpansionService(provider, { maxCacheSize: 2 });
    await service.expand("a");
    await service.expand("b");
    await service.expand("c"); // evicts "a"
    await service.expand("a"); // cache miss — calls provider again
    expect(provider.expand).toHaveBeenCalledTimes(4);
  });
});