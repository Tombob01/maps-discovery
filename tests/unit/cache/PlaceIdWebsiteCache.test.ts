/**
 * tests/unit/cache/PlaceIdWebsiteCache.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PlaceIdWebsiteCache } from "../../../src/cache/PlaceIdWebsiteCache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache(): PlaceIdWebsiteCache {
  return new PlaceIdWebsiteCache();
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("PlaceIdWebsiteCache — construction", () => {
  it("starts empty", () => {
    const cache = makeCache();
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// status()
// ---------------------------------------------------------------------------

describe("PlaceIdWebsiteCache — status()", () => {
  let cache: PlaceIdWebsiteCache;

  beforeEach(() => {
    cache = makeCache();
  });

  it("returns 'unseen' for an identity never recorded", () => {
    expect(cache.status("ChIJ_A")).toBe("unseen");
  });

  it("does NOT add the identity merely by checking status", () => {
    cache.status("ChIJ_A");
    expect(cache.size).toBe(0);
  });

  it("returns 'seen-no-website' after recording false", () => {
    cache.record("ChIJ_A", false);
    expect(cache.status("ChIJ_A")).toBe("seen-no-website");
  });

  it("returns 'seen-with-website' after recording true", () => {
    cache.record("ChIJ_A", true);
    expect(cache.status("ChIJ_A")).toBe("seen-with-website");
  });
});

// ---------------------------------------------------------------------------
// record() — never-downgrade rule
// ---------------------------------------------------------------------------

describe("PlaceIdWebsiteCache — record() never-downgrade rule", () => {
  let cache: PlaceIdWebsiteCache;

  beforeEach(() => {
    cache = makeCache();
  });

  it("recording false after true does NOT downgrade the identity", () => {
    cache.record("ChIJ_A", true);
    cache.record("ChIJ_A", false);
    expect(cache.status("ChIJ_A")).toBe("seen-with-website");
  });

  it("recording true after false upgrades the identity", () => {
    cache.record("ChIJ_A", false);
    cache.record("ChIJ_A", true);
    expect(cache.status("ChIJ_A")).toBe("seen-with-website");
  });

  it("recording false after false remains seen-no-website", () => {
    cache.record("ChIJ_A", false);
    cache.record("ChIJ_A", false);
    expect(cache.status("ChIJ_A")).toBe("seen-no-website");
  });

  it("recording true after true remains seen-with-website", () => {
    cache.record("ChIJ_A", true);
    cache.record("ChIJ_A", true);
    expect(cache.status("ChIJ_A")).toBe("seen-with-website");
  });
});

// ---------------------------------------------------------------------------
// Identity independence
// ---------------------------------------------------------------------------

describe("PlaceIdWebsiteCache — identity independence", () => {
  it("treats distinct identities independently", () => {
    const cache = makeCache();
    cache.record("ChIJ_A", true);
    cache.record("ChIJ_B", false);
    expect(cache.status("ChIJ_A")).toBe("seen-with-website");
    expect(cache.status("ChIJ_B")).toBe("seen-no-website");
    expect(cache.status("ChIJ_C")).toBe("unseen");
  });
});

// ---------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------

describe("PlaceIdWebsiteCache — size", () => {
  it("reflects the number of distinct identities recorded", () => {
    const cache = makeCache();
    cache.record("ChIJ_A", true);
    cache.record("ChIJ_B", false);
    expect(cache.size).toBe(2);
  });

  it("does not double-count repeated record() calls for the same identity", () => {
    const cache = makeCache();
    cache.record("ChIJ_A", false);
    cache.record("ChIJ_A", true);
    cache.record("ChIJ_A", true);
    expect(cache.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scope: fresh instance per run
// ---------------------------------------------------------------------------

describe("PlaceIdWebsiteCache — per-run isolation", () => {
  it("a fresh instance starts unseen regardless of another instance's state", () => {
    const runA = makeCache();
    runA.record("ChIJ_A", true);

    const runB = makeCache();
    expect(runB.status("ChIJ_A")).toBe("unseen");
    expect(runB.size).toBe(0);
  });
});