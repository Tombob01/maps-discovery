/**
 * @module tests/unit/runtime/RuntimeFacade.expandKeyword
 */
import { describe, it, expect, vi } from "vitest";
import { RuntimeFacade } from "../../../src/runtime/RuntimeFacade.js";
import { KeywordExpansionService } from "../../../src/ai/KeywordExpansionService.js";
import type { RunService } from "../../../src/api/RunService.js";
import type { RuntimeExecutor } from "../../../src/runtime/RuntimeExecutor.js";
import type { QueryEngine } from "../../../src/query-engine/QueryEngine.js";
import type { IGeoResolver } from "../../../src/core/interfaces/IQueryEngine.js";
import type { ResolvedQueryFactory } from "../../../src/query-engine/ResolvedQueryFactory.js";
import type { IKeywordExpansionProvider, ExpandedKeyword } from "../../../src/ai/IKeywordExpansionProvider.js";

const SAMPLE_SUGGESTIONS: ExpandedKeyword[] = [
  { keyword: "emergency plumber", popularity: "high", category: "commercial" },
  { keyword: "pipe repair", popularity: "medium", category: "long_tail" },
];

function makeFacade(suggestions: ExpandedKeyword[]): RuntimeFacade {
  const provider: IKeywordExpansionProvider = {
    expand: vi.fn().mockResolvedValue(suggestions),
  };
  const expansionService = new KeywordExpansionService(provider);
  return new RuntimeFacade(
    {} as RunService,
    {} as RuntimeExecutor,
    expansionService,
    {} as QueryEngine,
    {} as IGeoResolver,
    {} as ResolvedQueryFactory,
  );
}

describe("RuntimeFacade.expandKeyword", () => {
  it("returns original keyword and suggestions", async () => {
    const facade = makeFacade(SAMPLE_SUGGESTIONS);
    const result = await facade.expandKeyword({ keyword: "plumber" });
    expect(result.original).toBe("plumber");
    expect(result.suggestions).toHaveLength(2);
  });

  it("passes location and limit to expansion service", async () => {
    const provider: IKeywordExpansionProvider = { expand: vi.fn().mockResolvedValue([]) };
    const service = new KeywordExpansionService(provider);
    const facade = new RuntimeFacade({} as RunService, {} as RuntimeExecutor, service, {} as QueryEngine, {} as IGeoResolver, {} as ResolvedQueryFactory);
    await facade.expandKeyword({ keyword: "plumber", location: "Lagos", limit: 5 });
    expect(provider.expand).toHaveBeenCalledWith("plumber", { location: "Lagos", limit: 5 });
  });

  it("returns empty suggestions when provider returns nothing", async () => {
    const facade = makeFacade([]);
    const result = await facade.expandKeyword({ keyword: "plumber" });
    expect(result.suggestions).toEqual([]);
  });

  it("never throws even if expansion service fails", async () => {
    const provider: IKeywordExpansionProvider = {
      expand: vi.fn().mockRejectedValue(new Error("ai down")),
    };
    const service = new KeywordExpansionService(provider);
    const facade = new RuntimeFacade({} as RunService, {} as RuntimeExecutor, service, {} as QueryEngine, {} as IGeoResolver, {} as ResolvedQueryFactory);
    await expect(facade.expandKeyword({ keyword: "plumber" })).resolves.toBeDefined();
  });

  it("suggestions have correct shape", async () => {
    const facade = makeFacade(SAMPLE_SUGGESTIONS);
    const result = await facade.expandKeyword({ keyword: "plumber" });
    for (const s of result.suggestions) {
      expect(s).toHaveProperty("keyword");
      expect(s).toHaveProperty("popularity");
      expect(s).toHaveProperty("category");
    }
  });
});