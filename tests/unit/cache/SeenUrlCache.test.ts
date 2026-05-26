/**
 * tests/unit/cache/SeenUrlCache.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SeenUrlCache } from "../../../src/cache/SeenUrlCache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache(maxSize = 1000): SeenUrlCache {
  return new SeenUrlCache({ maxSize });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("SeenUrlCache — construction", () => {
  it("starts empty", () => {
    const cache = makeCache();
    expect(cache.size).toBe(0);
  });

  it("uses default maxSize when not specified", () => {
    const cache = new SeenUrlCache();
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkAndAdd
// ---------------------------------------------------------------------------

describe("SeenUrlCache — checkAndAdd()", () => {
  let cache: SeenUrlCache;

  beforeEach(() => {
    cache = makeCache();
  });

  it("returns false for a new URL and adds it", () => {
    const seen = cache.checkAndAdd("https://maps.google.com/place/123");
    expect(seen).toBe(false);
    expect(cache.size).toBe(1);
  });

  it("returns true for a URL seen before", () => {
    cache.checkAndAdd("https://maps.google.com/place/123");
    const seen = cache.checkAndAdd("https://maps.google.com/place/123");
    expect(seen).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("treats distinct URLs independently", () => {
    expect(cache.checkAndAdd("https://a.com")).toBe(false);
    expect(cache.checkAndAdd("https://b.com")).toBe(false);
    expect(cache.size).toBe(2);
  });

  it("is case-sensitive", () => {
    cache.checkAndAdd("https://maps.google.com/PLACE/123");
    expect(cache.checkAndAdd("https://maps.google.com/place/123")).toBe(false);
  });

  it("handles URLs with query strings distinctly", () => {
    cache.checkAndAdd("https://example.com/search?q=plumbers");
    expect(cache.checkAndAdd("https://example.com/search?q=electricians")).toBe(
      false,
    );
  });

  it("handles empty string as a valid key", () => {
    expect(cache.checkAndAdd("")).toBe(false);
    expect(cache.checkAndAdd("")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// has()
// ---------------------------------------------------------------------------

describe("SeenUrlCache — has()", () => {
  it("returns false for an unseen URL", () => {
    const cache = makeCache();
    expect(cache.has("https://example.com")).toBe(false);
  });

  it("returns true after checkAndAdd", () => {
    const cache = makeCache();
    cache.checkAndAdd("https://example.com");
    expect(cache.has("https://example.com")).toBe(true);
  });

  it("does NOT add the URL to the cache", () => {
    const cache = makeCache();
    cache.has("https://example.com");
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Overflow / eviction
// ---------------------------------------------------------------------------

describe("SeenUrlCache — maxSize eviction", () => {
  it("does not exceed maxSize", () => {
    const maxSize = 5;
    const cache = makeCache(maxSize);
    for (let i = 0; i < 10; i++) {
      cache.checkAndAdd(`https://example.com/${i}`);
    }
    expect(cache.size).toBe(maxSize);
  });

  it("evicts oldest entry when full", () => {
    const cache = makeCache(3);
    cache.checkAndAdd("https://a.com");
    cache.checkAndAdd("https://b.com");
    cache.checkAndAdd("https://c.com");
    // Adding a 4th should evict 'a'
    cache.checkAndAdd("https://d.com");
    expect(cache.has("https://a.com")).toBe(false);
    expect(cache.has("https://d.com")).toBe(true);
  });

  it("re-adding an evicted URL returns false (treated as new)", () => {
    const cache = makeCache(2);
    cache.checkAndAdd("https://a.com");
    cache.checkAndAdd("https://b.com");
    cache.checkAndAdd("https://c.com"); // evicts a
    // 'a' is gone; re-adding should return false
    expect(cache.checkAndAdd("https://a.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe("SeenUrlCache — clear()", () => {
  it("resets size to 0", () => {
    const cache = makeCache();
    cache.checkAndAdd("https://a.com");
    cache.checkAndAdd("https://b.com");
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("makes previously seen URLs appear new after clear", () => {
    const cache = makeCache();
    cache.checkAndAdd("https://example.com");
    cache.clear();
    expect(cache.checkAndAdd("https://example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bulk / stress
// ---------------------------------------------------------------------------

describe("SeenUrlCache — bulk operations", () => {
  it("correctly tracks 500 distinct URLs", () => {
    const cache = makeCache(1000);
    for (let i = 0; i < 500; i++) {
      expect(cache.checkAndAdd(`https://example.com/place/${i}`)).toBe(false);
    }
    expect(cache.size).toBe(500);
    for (let i = 0; i < 500; i++) {
      expect(cache.checkAndAdd(`https://example.com/place/${i}`)).toBe(true);
    }
  });
});
