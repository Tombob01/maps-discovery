/**
 * Integration test suite — full pipeline via QueryEngineFactory.
 *
 * These tests use the real YAML dictionaries in tests/fixtures/dictionaries/
 * and exercise the complete path from QuerySeed to GeneratedQuery[].
 *
 * Invariants tested:
 *   - No filesystem writes
 *   - No external API calls
 *   - Deterministic: same seed always produces the same queryHash set
 *   - All output invariants hold (unique hashes, correct lifecycle, etc.)
 */

import { resolve } from "node:path";

import { describe, it, expect, beforeAll } from "vitest";

import {
  createQueryEngine,
  buildQueryEngineConfig,
  type AssembledQueryEngine,
} from "../../src/query-engine/QueryEngineFactory.js";
import {
  makeRunId,
  makeGeoTarget,
  makeSeed,
  LAGOS_GEO,
  ABUJA_GEO,
} from "../helpers/builders.js";

import type { GeneratedQuery } from "../../src/core/models/Query.js";

// ---------------------------------------------------------------------------
// Shared setup — assembled once for the whole suite
// ---------------------------------------------------------------------------

const FIXTURE_DIR = resolve("tests/fixtures/dictionaries");
const STATIC_COORDS = {
  "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 },
  "Abuja, Nigeria": { lat: 9.0765, lng: 7.3986 },
};

let assembled: AssembledQueryEngine;

beforeAll(() => {
  assembled = createQueryEngine({
    config: buildQueryEngineConfig(
      { nicheDictionariesDir: FIXTURE_DIR, geoDictionariesDir: FIXTURE_DIR },
      {
        expansion: {
          defaultMaxVariants: 30,
          defaultStrategyIds: ["synonym", "modifier", "plural", "geo"],
          continueOnStrategyError: true,
        },
      },
    ),
    staticCoordinates: STATIC_COORDS,
  });
});

// ---------------------------------------------------------------------------
// Factory setup
// ---------------------------------------------------------------------------

describe("Integration — QueryEngineFactory assembly", () => {
  it("loads plumbers and electricians niche dictionaries from fixtures", () => {
    expect(assembled.nicheDictCount).toBeGreaterThanOrEqual(2);
  });

  it("loads Nigeria geo dictionary from fixtures", () => {
    expect(assembled.geoDictCount).toBeGreaterThanOrEqual(1);
  });

  it("registers all four built-in strategies", () => {
    expect(assembled.strategyIds).toContain("synonym");
    expect(assembled.strategyIds).toContain("modifier");
    expect(assembled.strategyIds).toContain("plural");
    expect(assembled.strategyIds).toContain("geo");
  });
});

// ---------------------------------------------------------------------------
// Full pipeline — plumbers / Lagos
// ---------------------------------------------------------------------------

describe("Integration — plumbers in Lagos", () => {
  let queries: readonly GeneratedQuery[];

  beforeAll(async () => {
    const result = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 30 }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    queries = result.value;
  });

  it("returns more than 1 query (expansion happened)", () => {
    expect(queries.length).toBeGreaterThan(1);
  });

  it("all queries have providerId = google-maps", () => {
    queries.forEach((q) => {
      expect(q.providerId).toBe("google-maps");
    });
  });

  it("all queries have lifecycleState = canonicalized", () => {
    queries.forEach((q) => {
      expect(q.lifecycleState).toBe("canonicalized");
    });
  });

  it("all queries have status = pending", () => {
    queries.forEach((q) => {
      expect(q.status).toBe("pending");
    });
  });

  it("all queryHash values are unique (no duplicates)", () => {
    const hashes = queries.map((q) => q.queryHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("all query ids are unique", () => {
    const ids = queries.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all queryHash values are 64-char hex strings", () => {
    queries.forEach((q) => {
      expect(q.queryHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("root query has generatedByStrategies = ['seed']", () => {
    const root = queries.find((q) => q.parentId === null)!;
    expect(root).toBeDefined();
    expect(root.generatedByStrategies).toEqual(["seed"]);
  });

  it("root query rawText contains 'plumbers' and 'Lagos'", () => {
    const root = queries.find((q) => q.parentId === null)!;
    expect(root.rawText.toLowerCase()).toContain("plumbers");
    expect(root.rawText.toLowerCase()).toContain("lagos");
  });

  it("synonym strategy produced at least one variant (plumbing contractor)", () => {
    const hasSynonym = queries.some(
      (q) =>
        q.rawText.toLowerCase().includes("plumbing contractor") ||
        q.rawText.toLowerCase().includes("pipefitter") ||
        q.rawText.toLowerCase().includes("drainage specialist"),
    );
    expect(hasSynonym).toBe(true);
  });

  it("modifier strategy produced at least one variant (emergency/residential/etc)", () => {
    const modifiers = [
      "emergency",
      "residential",
      "commercial",
      "licensed",
      "local",
      "affordable",
    ];
    const hasModified = queries.some((q) =>
      modifiers.some((m) => q.rawText.toLowerCase().startsWith(m)),
    );
    expect(hasModified).toBe(true);
  });

  it("geo strategy produced at least one Lagos sub-location variant", () => {
    const subLocations = ["victoria island", "lekki", "ikeja", "surulere"];
    const hasGeoVariant = queries.some((q) =>
      subLocations.some((loc) => q.rawText.toLowerCase().includes(loc)),
    );
    expect(hasGeoVariant).toBe(true);
  });

  it("no variant has an empty rawText", () => {
    queries.forEach((q) => {
      expect(q.rawText.trim().length).toBeGreaterThan(0);
    });
  });

  it("non-root queries have parentId pointing to an existing query id", () => {
    const allIds = new Set(queries.map((q) => q.id));
    const nonRoot = queries.filter((q) => q.parentId !== null);
    nonRoot.forEach((q) => {
      expect(allIds.has(q.parentId!)).toBe(true);
    });
  });

  it("non-root queries have generatedByStrategies.length >= 2", () => {
    const nonRoot = queries.filter((q) => q.parentId !== null);
    nonRoot.forEach((q) => {
      expect(q.generatedByStrategies.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("non-root queries have expansionMetadata", () => {
    const nonRoot = queries.filter((q) => q.parentId !== null);
    nonRoot.forEach((q) => {
      expect(q.expansionMetadata).toBeDefined();
      expect(q.expansionMetadata!.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Full pipeline — electricians / Lagos
// ---------------------------------------------------------------------------

describe("Integration — electricians in Lagos", () => {
  let queries: readonly GeneratedQuery[];

  beforeAll(async () => {
    const result = await assembled.engine.generate(
      makeSeed({ niche: "electricians", location: LAGOS_GEO, maxVariants: 20 }),
      makeRunId(2),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    queries = result.value;
  });

  it("returns more than 1 query", () => {
    expect(queries.length).toBeGreaterThan(1);
  });

  it("includes electrician synonyms", () => {
    const hasSynonym = queries.some(
      (q) =>
        q.rawText.toLowerCase().includes("electrical contractor") ||
        q.rawText.toLowerCase().includes("electrical engineer"),
    );
    expect(hasSynonym).toBe(true);
  });

  it("all hashes are unique", () => {
    const hashes = queries.map((q) => q.queryHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

// ---------------------------------------------------------------------------
// Cross-niche hash isolation
// ---------------------------------------------------------------------------

describe("Integration — cross-niche hash isolation", () => {
  it("plumbers and electricians root queries have different hashes", async () => {
    const r1 = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 1 }),
      makeRunId(1),
      ["google-maps"],
    );
    const r2 = await assembled.engine.generate(
      makeSeed({ niche: "electricians", location: LAGOS_GEO, maxVariants: 1 }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value[0]!.queryHash).not.toBe(r2.value[0]!.queryHash);
  });
});

// ---------------------------------------------------------------------------
// Cross-location hash isolation
// ---------------------------------------------------------------------------

describe("Integration — cross-location hash isolation", () => {
  it("same niche in Lagos vs Abuja produces different root hashes", async () => {
    const r1 = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 1 }),
      makeRunId(1),
      ["google-maps"],
    );
    const r2 = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: ABUJA_GEO, maxVariants: 1 }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value[0]!.queryHash).not.toBe(r2.value[0]!.queryHash);
  });
});

// ---------------------------------------------------------------------------
// Cross-provider hash isolation
// ---------------------------------------------------------------------------

describe("Integration — cross-provider hash isolation", () => {
  it("same seed on google-maps vs yelp produces different hashes", async () => {
    const r1 = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 1 }),
      makeRunId(1),
      ["google-maps"],
    );
    const r2 = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 1 }),
      makeRunId(1),
      ["yelp"],
    );
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value[0]!.queryHash).not.toBe(r2.value[0]!.queryHash);
  });

  it("multi-provider run produces queries for both providers", async () => {
    const result = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 5 }),
      makeRunId(1),
      ["google-maps", "yelp"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const providers = new Set(result.value.map((q) => q.providerId));
    expect(providers.has("google-maps")).toBe(true);
    expect(providers.has("yelp")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism across runs
// ---------------------------------------------------------------------------

describe("Integration — determinism", () => {
  it("same seed across 3 runs produces identical queryHash sets", async () => {
    const seed = makeSeed({
      niche: "plumbers",
      location: LAGOS_GEO,
      maxVariants: 10,
    });

    const runs = await Promise.all(
      [1, 2, 3].map((n) =>
        assembled.engine.generate(seed, makeRunId(n), ["google-maps"]),
      ),
    );

    runs.forEach((r) => {
      expect(r.ok).toBe(true);
    });
    const hashSets = runs
      .filter((r) => r.ok)
      .map(
        (r) =>
          new Set(
            (r as { ok: true; value: readonly GeneratedQuery[] }).value.map(
              (q) => q.queryHash,
            ),
          ),
      );

    const first = hashSets[0]!;
    hashSets.slice(1).forEach((set) => {
      expect(set.size).toBe(first.size);
      for (const h of first) expect(set.has(h)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// maxVariants enforcement with real dictionaries
// ---------------------------------------------------------------------------

describe("Integration — maxVariants enforcement", () => {
  it.each([1, 2, 5, 8, 15])("maxVariants=%i is respected", async (max) => {
    const result = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: max }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(max);
  });
});

// ---------------------------------------------------------------------------
// Unknown niche
// ---------------------------------------------------------------------------

describe("Integration — unknown niche", () => {
  it("returns exactly one query (root only) for unknown niche with no dictionary", async () => {
    const result = await assembled.engine.generate(
      makeSeed({
        niche: "neurosurgeons",
        location: LAGOS_GEO,
        maxVariants: 10,
      }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Strategies produce no variants for unknown niche → only root
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.generatedByStrategies).toEqual(["seed"]);
  });
});

// ---------------------------------------------------------------------------
// Seed-level modifier injection
// ---------------------------------------------------------------------------

describe("Integration — seed-level modifiers", () => {
  it("seed modifiers are present in the root query rawText", async () => {
    const result = await assembled.engine.generate(
      makeSeed({
        niche: "plumbers",
        location: LAGOS_GEO,
        modifiers: ["certified"],
        maxVariants: 5,
      }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.value.find((q) => q.parentId === null)!;
    expect(root.rawText.toLowerCase()).toContain("certified");
  });

  it("root query from seed with multiple modifiers includes all of them", async () => {
    const result = await assembled.engine.generate(
      makeSeed({
        niche: "plumbers",
        location: LAGOS_GEO,
        modifiers: ["emergency", "licensed"],
        maxVariants: 3,
      }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.value.find((q) => q.parentId === null)!;
    const rootText = root.rawText.toLowerCase();
    expect(rootText).toContain("emergency");
    expect(rootText).toContain("licensed");
  });
});
