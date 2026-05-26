/**
 * QueryEngineFactory test suite.
 * Covers: component assembly, strategy registration, dictionary counts,
 * config merging with defaults, plugin strategy registration,
 * and static coordinate injection.
 */

import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import { ok } from "../../src/core/types/common.js";
import { QUERY_ENGINE_DEFAULTS } from "../../src/query-engine/config/QueryEngineConfig.js";
import { QueryCanonicalizer } from "../../src/query-engine/QueryCanonicalizer.js";
import { QueryEngine } from "../../src/query-engine/QueryEngine.js";
import {
  createQueryEngine,
  buildQueryEngineConfig,
} from "../../src/query-engine/QueryEngineFactory.js";
import { BaseExpansionStrategy } from "../../src/query-engine/strategies/BaseExpansionStrategy.js";
import { makeSeed, makeRunId, LAGOS_GEO } from "../helpers/builders.js";

import type {
  IExpansionStrategy,
  ExpansionStrategyErrorDetail,
} from "../../src/core/interfaces/IQueryEngine.js";
import type {
  GeneratedQuery,
  ExpansionContext,
} from "../../src/core/models/Query.js";

// ---------------------------------------------------------------------------
// Fixture path helpers
// ---------------------------------------------------------------------------

const FIXTURE_DIR = resolve("tests/fixtures/dictionaries");

function makeConfig(
  overrides: Partial<{
    maxVariants: number;
    strategyIds: string[];
  }> = {},
) {
  return buildQueryEngineConfig(
    { nicheDictionariesDir: FIXTURE_DIR, geoDictionariesDir: FIXTURE_DIR },
    {
      expansion: {
        defaultMaxVariants: overrides.maxVariants ?? 20,
        defaultStrategyIds: overrides.strategyIds ?? [
          "synonym",
          "modifier",
          "plural",
          "geo",
        ],
        continueOnStrategyError: true,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// buildQueryEngineConfig
// ---------------------------------------------------------------------------

describe("buildQueryEngineConfig()", () => {
  it("merges dictionaries path with defaults", () => {
    const config = buildQueryEngineConfig({
      nicheDictionariesDir: "/niches",
      geoDictionariesDir: "/geo",
    });
    expect(config.dictionaries.nicheDictionariesDir).toBe("/niches");
    expect(config.dictionaries.geoDictionariesDir).toBe("/geo");
  });

  it("applies default canonicalizer settings", () => {
    const config = buildQueryEngineConfig({
      nicheDictionariesDir: "",
      geoDictionariesDir: "",
    });
    expect(config.canonicalizer.sortModifierTokens).toBe(true);
  });

  it("applies default expansion settings", () => {
    const config = buildQueryEngineConfig({
      nicheDictionariesDir: "",
      geoDictionariesDir: "",
    });
    expect(config.expansion.defaultMaxVariants).toBe(20);
    expect(config.expansion.continueOnStrategyError).toBe(true);
  });

  it("caller overrides take precedence over defaults", () => {
    const config = buildQueryEngineConfig(
      { nicheDictionariesDir: "", geoDictionariesDir: "" },
      {
        expansion: {
          defaultMaxVariants: 5,
          defaultStrategyIds: ["synonym"],
          continueOnStrategyError: false,
        },
      },
    );
    expect(config.expansion.defaultMaxVariants).toBe(5);
    expect(config.expansion.continueOnStrategyError).toBe(false);
  });

  it("partial override merges cleanly — unset fields use defaults", () => {
    const config = buildQueryEngineConfig(
      { nicheDictionariesDir: "", geoDictionariesDir: "" },
      {
        canonicalizer: {
          sortModifierTokens: false,
          stripPunctuationPattern: ",\\.",
        },
      },
    );
    expect(config.canonicalizer.sortModifierTokens).toBe(false);
    // expansion should still have defaults
    expect(config.expansion.defaultMaxVariants).toBe(
      QUERY_ENGINE_DEFAULTS.expansion.defaultMaxVariants,
    );
  });
});

// ---------------------------------------------------------------------------
// createQueryEngine — assembly
// ---------------------------------------------------------------------------

describe("createQueryEngine()", () => {
  it("returns an AssembledQueryEngine with engine and canonicalizer", () => {
    const assembled = createQueryEngine({ config: makeConfig() });
    expect(assembled.engine).toBeInstanceOf(QueryEngine);
    expect(assembled.canonicalizer).toBeInstanceOf(QueryCanonicalizer);
  });

  it("loads niche dictionaries and reports correct count", () => {
    const assembled = createQueryEngine({ config: makeConfig() });
    expect(assembled.nicheDictCount).toBeGreaterThanOrEqual(2); // plumbers + electricians
  });

  it("loads geo dictionaries and reports correct count", () => {
    const assembled = createQueryEngine({ config: makeConfig() });
    expect(assembled.geoDictCount).toBeGreaterThanOrEqual(1); // nigeria
  });

  it("strategyIds includes all four built-in strategies", () => {
    const assembled = createQueryEngine({ config: makeConfig() });
    expect(assembled.strategyIds).toContain("synonym");
    expect(assembled.strategyIds).toContain("modifier");
    expect(assembled.strategyIds).toContain("plural");
    expect(assembled.strategyIds).toContain("geo");
  });

  it("strategyIds array is frozen", () => {
    const assembled = createQueryEngine({ config: makeConfig() });
    expect(Object.isFrozen(assembled.strategyIds)).toBe(true);
  });

  it("throws for non-existent dictionary directory only if files can't be read", () => {
    // DictionaryLoader returns empty index for missing dirs — no throw
    const assembled = createQueryEngine({
      config: buildQueryEngineConfig({
        nicheDictionariesDir: "/does/not/exist",
        geoDictionariesDir: "/does/not/exist",
      }),
    });
    expect(assembled.nicheDictCount).toBe(0);
    expect(assembled.geoDictCount).toBe(0);
  });

  it("generates queries when engine is used after assembly", async () => {
    const assembled = createQueryEngine({
      config: makeConfig({ maxVariants: 5 }),
      staticCoordinates: { "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 } },
    });
    const result = await assembled.engine.generate(
      makeSeed({ niche: "plumbers", location: LAGOS_GEO }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Plugin strategy registration
// ---------------------------------------------------------------------------

describe("createQueryEngine() — additional strategies", () => {
  class CustomStrategy extends BaseExpansionStrategy {
    override readonly id = "custom-test";
    override readonly description = "Test custom strategy";

    protected override _apply(
      query: GeneratedQuery,
      _context: ExpansionContext,
    ) {
      return [
        {
          rawText: `premium ${query.rawText}`,
          metadata: this._meta({ sourceTerm: "premium", confidence: 0.99 }),
        },
      ];
    }
  }

  it("registers additional strategy alongside built-ins", () => {
    const assembled = createQueryEngine({
      config: makeConfig(),
      additionalStrategies: [new CustomStrategy()],
    });
    expect(assembled.strategyIds).toContain("custom-test");
    expect(assembled.strategyIds).toHaveLength(5); // 4 built-in + 1 custom
  });

  it("custom strategy produces variants when specified in seed", async () => {
    const assembled = createQueryEngine({
      config: buildQueryEngineConfig(
        { nicheDictionariesDir: FIXTURE_DIR, geoDictionariesDir: FIXTURE_DIR },
        {
          expansion: {
            defaultMaxVariants: 5,
            defaultStrategyIds: ["custom-test"],
            continueOnStrategyError: true,
          },
        },
      ),
      additionalStrategies: [new CustomStrategy()],
      staticCoordinates: { "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 } },
    });
    const result = await assembled.engine.generate(
      makeSeed({
        niche: "plumbers",
        location: LAGOS_GEO,
        expansionStrategyIds: ["custom-test"],
      }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hasCustom = result.value.some(
      (q) =>
        q.rawText.startsWith("premium ") &&
        q.generatedByStrategies.includes("custom-test"),
    );
    expect(hasCustom).toBe(true);
  });

  it("multiple additional strategies are all registered", () => {
    class Alpha extends BaseExpansionStrategy {
      override readonly id = "alpha";
      override readonly description = "";
      protected override _apply() {
        return [];
      }
    }
    class Beta extends BaseExpansionStrategy {
      override readonly id = "beta";
      override readonly description = "";
      protected override _apply() {
        return [];
      }
    }

    const assembled = createQueryEngine({
      config: makeConfig(),
      additionalStrategies: [new Alpha(), new Beta()],
    });
    expect(assembled.strategyIds).toContain("alpha");
    expect(assembled.strategyIds).toContain("beta");
  });
});

// ---------------------------------------------------------------------------
// Static coordinate injection
// ---------------------------------------------------------------------------

describe("createQueryEngine() — staticCoordinates", () => {
  it("resolves known city coordinates successfully", async () => {
    const assembled = createQueryEngine({
      config: makeConfig({ maxVariants: 1 }),
      staticCoordinates: { "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 } },
    });
    const result = await assembled.engine.generate(
      makeSeed({ location: LAGOS_GEO }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
  });

  it("falls back to PassthroughGeoResolver when no static coords provided", async () => {
    const assembled = createQueryEngine({
      config: makeConfig({ maxVariants: 1 }),
    });
    // PassthroughGeoResolver can resolve NG → centroid
    const result = await assembled.engine.generate(
      makeSeed({ location: LAGOS_GEO }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(true);
  });

  it("returns GEO_RESOLUTION_FAILED for unresolvable location without static coords", async () => {
    const assembled = createQueryEngine({
      config: makeConfig({ maxVariants: 1 }),
    });
    const result = await assembled.engine.generate(
      makeSeed({ location: { displayName: "Atlantis", country: "XX" } }),
      makeRunId(1),
      ["google-maps"],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GEO_RESOLUTION_FAILED");
  });
});
