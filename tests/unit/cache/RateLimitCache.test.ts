/**
 * tests/unit/cache/RateLimitCache.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { RateLimitCache } from "../../../src/cache/RateLimitCache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache(maxRequests = 10, windowMs = 1000): RateLimitCache {
  return new RateLimitCache({ maxRequests, windowMs });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("RateLimitCache — construction", () => {
  it("accepts config without throwing", () => {
    expect(() => makeCache()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// consume()
// ---------------------------------------------------------------------------

describe("RateLimitCache — consume()", () => {
  let cache: RateLimitCache;

  beforeEach(() => {
    cache = makeCache(3, 1000);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first request", () => {
    expect(cache.consume("google-maps")).toBe(true);
  });

  it("allows requests up to maxRequests", () => {
    expect(cache.consume("google-maps")).toBe(true);
    expect(cache.consume("google-maps")).toBe(true);
    expect(cache.consume("google-maps")).toBe(true);
  });

  it("blocks request exceeding maxRequests within the window", () => {
    cache.consume("google-maps");
    cache.consume("google-maps");
    cache.consume("google-maps");
    expect(cache.consume("google-maps")).toBe(false);
  });

  it("resets after window expires", () => {
    cache.consume("google-maps");
    cache.consume("google-maps");
    cache.consume("google-maps");
    // Advance past window
    vi.advanceTimersByTime(1001);
    expect(cache.consume("google-maps")).toBe(true);
  });

  it("tracks providers independently", () => {
    cache.consume("google-maps");
    cache.consume("google-maps");
    cache.consume("google-maps");
    // Yelp is independent — should still allow
    expect(cache.consume("yelp")).toBe(true);
  });

  it("blocked provider does not affect others", () => {
    for (let i = 0; i < 4; i++) cache.consume("google-maps"); // 4th is blocked
    expect(cache.consume("bing-maps")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// remaining()
// ---------------------------------------------------------------------------

describe("RateLimitCache — remaining()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns maxRequests when no window active", () => {
    const cache = makeCache(5, 1000);
    expect(cache.remaining("google-maps")).toBe(5);
  });

  it("decreases after each consume", () => {
    const cache = makeCache(5, 1000);
    cache.consume("google-maps");
    expect(cache.remaining("google-maps")).toBe(4);
    cache.consume("google-maps");
    expect(cache.remaining("google-maps")).toBe(3);
  });

  it("returns 0 when limit is reached", () => {
    const cache = makeCache(2, 1000);
    cache.consume("google-maps");
    cache.consume("google-maps");
    expect(cache.remaining("google-maps")).toBe(0);
  });

  it("returns maxRequests again after window expires", () => {
    const cache = makeCache(3, 1000);
    cache.consume("google-maps");
    cache.consume("google-maps");
    vi.advanceTimersByTime(1001);
    expect(cache.remaining("google-maps")).toBe(3);
  });

  it("does not return negative remaining", () => {
    const cache = makeCache(2, 1000);
    cache.consume("google-maps");
    cache.consume("google-maps");
    cache.consume("google-maps"); // blocked, but should not go negative
    expect(cache.remaining("google-maps")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// msUntilReset()
// ---------------------------------------------------------------------------

describe("RateLimitCache — msUntilReset()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when no window active", () => {
    const cache = makeCache(5, 1000);
    expect(cache.msUntilReset("google-maps")).toBe(0);
  });

  it("returns approximate ms remaining in window", () => {
    const cache = makeCache(5, 1000);
    cache.consume("google-maps");
    vi.advanceTimersByTime(300);
    const ms = cache.msUntilReset("google-maps");
    // Should be approximately 700ms remaining (within 50ms tolerance)
    expect(ms).toBeGreaterThan(640);
    expect(ms).toBeLessThanOrEqual(700);
  });

  it("returns 0 after window expires", () => {
    const cache = makeCache(5, 1000);
    cache.consume("google-maps");
    vi.advanceTimersByTime(1001);
    expect(cache.msUntilReset("google-maps")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reset() / resetAll()
// ---------------------------------------------------------------------------

describe("RateLimitCache — reset()", () => {
  it("allows requests again after reset", () => {
    const cache = makeCache(1, 9999);
    cache.consume("google-maps");
    expect(cache.consume("google-maps")).toBe(false);
    cache.reset("google-maps");
    expect(cache.consume("google-maps")).toBe(true);
  });

  it("does not affect other providers", () => {
    const cache = makeCache(1, 9999);
    cache.consume("google-maps");
    cache.consume("yelp");
    cache.reset("google-maps");
    expect(cache.consume("google-maps")).toBe(true);
    // yelp still blocked
    expect(cache.consume("yelp")).toBe(false);
  });
});

describe("RateLimitCache — resetAll()", () => {
  it("clears all provider windows", () => {
    const cache = makeCache(1, 9999);
    cache.consume("google-maps");
    cache.consume("yelp");
    cache.resetAll();
    expect(cache.consume("google-maps")).toBe(true);
    expect(cache.consume("yelp")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("RateLimitCache — edge cases", () => {
  it("maxRequests=1 allows exactly one request per window", () => {
    vi.useFakeTimers();
    const cache = makeCache(1, 500);
    expect(cache.consume("p1")).toBe(true);
    expect(cache.consume("p1")).toBe(false);
    vi.advanceTimersByTime(501);
    expect(cache.consume("p1")).toBe(true);
    vi.useRealTimers();
  });

  it("handles many providers without interference", () => {
    const cache = makeCache(2, 1000);
    for (let i = 0; i < 50; i++) {
      expect(cache.consume(`provider-${i}`)).toBe(true);
    }
  });
});
