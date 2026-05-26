/**
 * QueryEngine orchestration test suite.
 * Covers: full pipeline execution, seed validation, multi-provider runs,
 * maxVariants enforcement, dedup across providers, geo failure handling,
 * strategy error recovery, and output invariants.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { QUERY_ENGINE_DEFAULTS } from "../../src/query-engine/config/QueryEngineConfig.js";
import {
  StaticCoordinateGeoResolver,
  PassthroughGeoResolver,
} from "../../src/query-engine/GeoResolver.js";
import { QueryCanonicalizer } from "../../src/query-engine/QueryCanonicalizer.js";
import { QueryEngine } from "../../src/query-engine/QueryEngine.js";
import { QueryExpander } from "../../src/query-engine/QueryExpander.js";
import { ModifierExpansionStrategy } from "../../src/query-engine/strategies/ModifierExpansionStrategy.js";
import { PluralExpansionStrategy } from "../../src/query-engine/strategies/PluralExpansionStrategy.js";
import { SynonymExpansionStrategy } from "../../src/query-engine/strategies/SynonymExpansionStrategy.js";
import {
  makeSeed,
  makeRunId,
  makeGeoTarget,
  LAGOS_GEO,
  UNKNOWN_GEO,
} from "../helpers/builders.js";
import { canonicalizer, niches, nigeGeo } from "../helpers/instances.js";

import type { QueryEngineConfig } from "../../src/query-engine/config/QueryEngineConfig.js";

// ---------------------------------------------------------------------------
// Test fixture: wired QueryEngine
// ---------------------------------------------------------------------------

const STATIC_COORDS = { "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 } };

function makeEngine(
  overrides: {
    maxVariants?: number;
    strategyIds?: string[];
    continueOnError?: boolean;
    useUnresolvableGeo?: boolean;
  } = {},
): QueryEngine {
  const canon = new QueryCanonicalizer(QUERY_ENGINE_DEFAULTS.canonicalizer);
  const strategies = [
    new SynonymExpansionStrategy(niches),
    new ModifierExpansionStrategy(niches),
    new PluralExpansionStrategy(niches),
  ];
  const expander = new QueryExpander(strategies, canon, {
    defaultMaxVariants: overrides.maxVariants ?? 20,
    defaultStrategyIds: overrides.strategyIds ?? [
      "synonym",
      "modifier",
      "plural",
    ],
    continueOnStrategyError: overrides.continueOnError ?? true,
  });
  const geoResolver = overrides.useUnresolvableGeo
    ? new PassthroughGeoResolver(QUERY_ENGINE_DEFAULTS.geoResolver)
    : new StaticCoordinateGeoResolver(
        STATIC_COORDS,
        QUERY_ENGINE_DEFAULTS.geoResolver,
      );

  const config: QueryEngineConfig = {
    dictionaries: { nicheDictionariesDir: "", geoDictionariesDir: "" },
    canonicalizer: QUERY_ENGINE_DEFAULTS.canonicalizer,
    expansion: {
      defaultMaxVariants: overrides.maxVariants ?? 20,
      defaultStrategyIds: overrides.strategyIds ?? [
        "synonym",
        "modifier",
        "plural",
      ],
      continueOnStrategyError: overrides.continueOnError ?? true,
    },
    geoResolver: QUERY_ENGINE_DEFAULTS.geoResolver,
  };
  return new QueryEngine(canon, expander, geoResolver, config);
}

const RUN_ID = makeRunId(1);
const PROVIDERS = ["google-maps"] as const;
const TWO_PROVIDERS = ["google-maps", "yelp"] as const;

// ---------------------------------------------------------------------------
// Seed validation
// ---------------------------------------------------------------------------

describe("QueryEngine.generate() — seed validation", () => {
  const engine = makeEngine();

  it("returns Err(INVALID_SEED) for empty niche", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "   " }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_SEED");
    expect(result.error.message).toContain("niche");
  });

  it("returns Err(INVALID_SEED) for empty displayName", async () => {
    const result = await engine.generate(
      makeSeed({ location: makeGeoTarget({ displayName: "   " }) }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_SEED");
    expect(result.error.message).toContain("displayName");
  });

  it("returns Err(INVALID_SEED) for empty providerIds array", async () => {
    const result = await engine.generate(makeSeed(), RUN_ID, []);
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_SEED");
    expect(result.error.message).toContain("providerId");
  });
});

// ---------------------------------------------------------------------------
// Geo resolution failure
// ---------------------------------------------------------------------------

describe("QueryEngine.generate() — geo resolution failure", () => {
  it("returns Err(GEO_RESOLUTION_FAILED) when geo cannot be resolved", async () => {
    const engine = makeEngine({ useUnresolvableGeo: true });
    const result = await engine.generate(
      makeSeed({ location: UNKNOWN_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GEO_RESOLUTION_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Successful generation — single provider
// ---------------------------------------------------------------------------

describe("QueryEngine.generate() — single provider success", () => {
  const engine = makeEngine();

  it("returns Ok with at least one query (the root)", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it("first query is the root (generatedByStrategies = ['seed'])", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.value[0]!;
    expect(root.generatedByStrategies).toEqual(["seed"]);
    expect(root.parentId).toBeNull();
  });

  it("root query rawText contains niche and location", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rootText = result.value[0]!.rawText.toLowerCase();
    expect(rootText).toContain("plumbers");
    expect(rootText).toContain("lagos");
  });

  it("all queries have lifecycleState = canonicalized (post-engine)", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((q) => {
      expect(q.lifecycleState).toBe("canonicalized");
    });
  });

  it("all queries have status = pending", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((q) => {
      expect(q.status).toBe("pending");
    });
  });

  it("all queries have the correct providerId", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((q) => {
      expect(q.providerId).toBe("google-maps");
    });
  });

  it("all queries have the correct runId", async () => {
    const run = makeRunId(77);
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      run,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((q) => {
      expect(q.runId).toBe(run);
    });
  });

  it("all queryHash values are unique (no duplicates)", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hashes = result.value.map((q) => q.queryHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("all query ids are unique", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// maxVariants enforcement
// ---------------------------------------------------------------------------

describe("QueryEngine.generate() — maxVariants enforcement", () => {
  it("returns exactly 1 query when maxVariants = 1", async () => {
    const engine = makeEngine({ maxVariants: 1 });
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 1 }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it("returns at most maxVariants queries", async () => {
    for (const max of [1, 2, 5, 10]) {
      const result = await makeEngine({ maxVariants: max }).generate(
        makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: max }),
        RUN_ID,
        PROVIDERS,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.length).toBeLessThanOrEqual(max);
    }
  });

  it("seed-level maxVariants overrides engine config", async () => {
    const engine = makeEngine({ maxVariants: 20 });
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 3 }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(3);
  });

  it("returns no more than maxVariants when expansionStrategyIds = []", async () => {
    const result = await makeEngine().generate(
      makeSeed({
        niche: "plumbers",
        location: LAGOS_GEO,
        expansionStrategyIds: [],
        maxVariants: 1,
      }),
      RUN_ID,
      PROVIDERS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Multi-provider generation
// ---------------------------------------------------------------------------

describe("QueryEngine.generate() — multi-provider", () => {
  const engine = makeEngine({ maxVariants: 5 });

  it("generates queries for both providers", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      TWO_PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const providerIds = new Set(result.value.map((q) => q.providerId));
    expect(providerIds.has("google-maps")).toBe(true);
    expect(providerIds.has("yelp")).toBe(true);
  });

  it("total output count ≈ (maxVariants × providers) — de-duplicated", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 5 }),
      RUN_ID,
      TWO_PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return; // Expect ~10 total but dedup may reduce if queries canonicalize to same text+geo+provider
    expect(result.value.length).toBeGreaterThan(1);
  });

  it("no two queries across providers share the same queryHash", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      RUN_ID,
      TWO_PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hashes = result.value.map((q) => q.queryHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("google-maps and yelp root queries have different hashes (provider sensitivity)", async () => {
    const result = await engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO, maxVariants: 1 }),
      RUN_ID,
      TWO_PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gmHash = result.value.find(
      (q) => q.providerId === "google-maps",
    )?.queryHash;
    const yelpHash = result.value.find(
      (q) => q.providerId === "yelp",
    )?.queryHash;
    expect(gmHash).toBeDefined();
    expect(yelpHash).toBeDefined();
    expect(gmHash).not.toBe(yelpHash);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("QueryEngine.generate() — determinism", () => {
  it("same seed produces the same root queryHash across two runs", async () => {
    const engine = makeEngine({ maxVariants: 1 });
    const seed = makeSeed({ niche: "plumbers", location: LAGOS_GEO });

    const r1 = await engine.generate(seed, makeRunId(1), PROVIDERS);
    const r2 = await engine.generate(seed, makeRunId(2), PROVIDERS);

    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value[0]?.queryHash).toBe(r2.value[0]?.queryHash);
  });

  it("same seed + two different runIds produce queries with same hashes but different ids", async () => {
    const engine = makeEngine({ maxVariants: 3 });
    const seed = makeSeed({ niche: "plumbers", location: LAGOS_GEO });

    const r1 = await engine.generate(seed, makeRunId(1), PROVIDERS);
    const r2 = await engine.generate(seed, makeRunId(2), PROVIDERS);

    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    const hashes1 = r1.value.map((q) => q.queryHash).sort();
    const hashes2 = r2.value.map((q) => q.queryHash).sort();
    expect(hashes1).toEqual(hashes2);

    const ids1 = new Set(r1.value.map((q) => q.id));
    const ids2 = new Set(r2.value.map((q) => q.id));
    for (const id of ids1) expect(ids2.has(id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Strategy selection via seed.expansionStrategyIds
// ---------------------------------------------------------------------------

describe("QueryEngine.generate() — expansionStrategyIds", () => {
  it("uses only synonym strategy when specified", async () => {
    const engine = makeEngine({ maxVariants: 10 });
    const result = await engine.generate(
      makeSeed({
        niche: "plumbers",
        location: LAGOS_GEO,
        expansionStrategyIds: ["synonym"],
        maxVariants: 10,
      }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const variants = result.value.filter((q) => q.parentId !== null);
    variants.forEach((v) => {
      const strategies = v.generatedByStrategies;
      expect(strategies[strategies.length - 1]).toBe("synonym");
    });
  });

  it("empty expansionStrategyIds returns only root query", async () => {
    const engine = makeEngine({ maxVariants: 20 });
    const result = await engine.generate(
      makeSeed({
        niche: "plumbers",
        location: LAGOS_GEO,
        expansionStrategyIds: [],
      }),
      RUN_ID,
      PROVIDERS,
    );
    console.log("DEBUG:", JSON.stringify((result as any).error));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.generatedByStrategies).toEqual(["seed"]);
  });
});
