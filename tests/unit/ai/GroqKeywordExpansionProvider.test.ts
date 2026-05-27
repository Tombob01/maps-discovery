/**
 * @module tests/unit/ai/GroqKeywordExpansionProvider
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GroqKeywordExpansionProvider } from "../../../src/ai/GroqKeywordExpansionProvider.js";

const VALID_RESPONSE = {
  choices: [{
    message: {
      content: JSON.stringify([
        { keyword: "emergency plumber", popularity: "high", category: "commercial" },
        { keyword: "local plumbing services", popularity: "high", category: "local" },
        { keyword: "pipe repair", popularity: "medium", category: "long_tail" },
      ]),
    },
  }],
};

function mockFetch(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 401, json: async () => response });
}

describe("GroqKeywordExpansionProvider", () => {
  beforeEach(() => { vi.stubGlobal("fetch", mockFetch(VALID_RESPONSE)); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns parsed ExpandedKeyword array on success", async () => {
    const provider = new GroqKeywordExpansionProvider("test-key");
    const results = await provider.expand("plumber");
    expect(results).toHaveLength(3);
    expect(results[0]?.keyword).toBe("emergency plumber");
    expect(results[0]?.popularity).toBe("high");
    expect(results[0]?.category).toBe("commercial");
  });

  it("returns empty array on non-ok status", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false));
    const provider = new GroqKeywordExpansionProvider("bad-key");
    expect(await provider.expand("plumber")).toEqual([]);
  });

  it("returns empty array when response content is malformed JSON", async () => {
    vi.stubGlobal("fetch", mockFetch({ choices: [{ message: { content: "not json {{" } }] }));
    const provider = new GroqKeywordExpansionProvider("test-key");
    expect(await provider.expand("plumber")).toEqual([]);
  });

  it("returns empty array when choices is missing", async () => {
    vi.stubGlobal("fetch", mockFetch({ result: "unexpected" }));
    const provider = new GroqKeywordExpansionProvider("test-key");
    expect(await provider.expand("plumber")).toEqual([]);
  });

  it("filters out items with invalid popularity", async () => {
    vi.stubGlobal("fetch", mockFetch({
      choices: [{ message: { content: JSON.stringify([
        { keyword: "good one", popularity: "high", category: "commercial" },
        { keyword: "bad one", popularity: "extreme", category: "commercial" },
      ]) } }],
    }));
    const provider = new GroqKeywordExpansionProvider("test-key");
    const results = await provider.expand("plumber");
    expect(results).toHaveLength(1);
    expect(results[0]?.keyword).toBe("good one");
  });

  it("respects limit option", async () => {
    vi.stubGlobal("fetch", mockFetch(VALID_RESPONSE));
    const provider = new GroqKeywordExpansionProvider("test-key");
    const results = await provider.expand("plumber", { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("retries once on fetch failure and returns empty on second failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const provider = new GroqKeywordExpansionProvider("test-key");
    expect(await provider.expand("plumber")).toEqual([]);
  });

  it("handles markdown-fenced JSON response", async () => {
    vi.stubGlobal("fetch", mockFetch({
      choices: [{ message: { content: "```json\n" + JSON.stringify([
        { keyword: "drain cleaning", popularity: "medium", category: "commercial" },
      ]) + "\n```" } }],
    }));
    const provider = new GroqKeywordExpansionProvider("test-key");
    const results = await provider.expand("plumber");
    expect(results[0]?.keyword).toBe("drain cleaning");
  });
});