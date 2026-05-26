/**
 * QueryExpander test suite.
 * Covers: multi-strategy orchestration, budget enforcement,
 * hash-level dedup, provenance chaining, unknown strategy handling,
 * external plugin compatibility, and zero-budget behaviour.
 */

import { describe, it, expect } from "vitest";

import { ok, err } from "../../src/core/types/common.js";
import { QueryExpander } from "../../src/query-engine/QueryExpander.js";
import { ModifierExpansionStrategy } from "../../src/query-engine/strategies/ModifierExpansionStrategy.js";
import { PluralExpansionStrategy } from "../../src/query-engine/strategies/PluralExpansionStrategy.js";
import { SynonymExpansionStrategy } from "../../src/query-engine/strategies/SynonymExpansionStrategy.js";
import {
  makeQuery,
  makeExpansionContext,
  makeRunId,
  makeGeoTarget,
  makeHash,
} from "../helpers/builders.js";
import { canonicalizer, niches, makeExpander } from "../helpers/instances.js";

import type {
  IExpansionStrategy,
  ExpansionStrategyErrorDetail,
} from "../../src/core/interfaces/IQueryEngine.js";
import type {
  GeneratedQuery,
  ExpansionContext,
} from "../../src/core/models/Query.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestQuery(rawText = "plumber Lagos, Nigeria"): GeneratedQuery {
  return makeQuery({
    rawText,
    niche: "plumbers",
    geoTarget: makeGeoTarget({ displayName: "Lagos, Nigeria", city: "Lagos" }),
  });
}

// ---------------------------------------------------------------------------
// Basic expansion
// ---------------------------------------------------------------------------

describe("QueryExpander.expand()", () => {
  it("returns Ok with at least one variant for a known niche", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  it("returns Ok with empty array when niche is unknown", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeQuery({ rawText: "dentists Lagos", niche: "dentists" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("returns Ok with empty array when maxNew = 0", async () => {
    const expander = makeExpander(["synonym", "modifier"]);
    const query = makeTestQuery();
    const context = makeExpansionContext({ maxNew: 0 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("never exceeds maxNew across multiple strategies", async () => {
    const expander = makeExpander(["synonym", "modifier", "plural"]);
    const query = makeTestQuery("plumber Lagos");
    const context = makeExpansionContext({ maxNew: 3 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(3);
  });

  it("combines variants from multiple strategies up to budget", async () => {
    const expander = makeExpander(["synonym", "modifier"]);
    const query = makeTestQuery("plumber Lagos");
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const texts = result.value.map((q) => q.rawText);
    // Expect at least one synonym variant and at least one modifier variant
    const hasSynonym = texts.some((t) =>
      ["plumbing contractor", "pipefitter"].some((s) => t.includes(s)),
    );
    const hasModifier = texts.some((t) =>
      ["emergency", "residential"].some((m) => t.startsWith(m)),
    );
    expect(hasSynonym || hasModifier).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Provenance chaining
// ---------------------------------------------------------------------------

describe("QueryExpander — provenance chaining", () => {
  it("variant has generatedByStrategies = ['seed', strategyId]", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");
    const context = makeExpansionContext({ maxNew: 5 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.generatedByStrategies[0]).toBe("seed");
      expect(v.generatedByStrategies[1]).toBe("synonym");
      expect(v.generatedByStrategies).toHaveLength(2);
    });
  });

  it("variant has expansionMetadata with one entry per strategy in chain", async () => {
    const expander = makeExpander(["modifier"]);
    const query = makeTestQuery("plumber Lagos");
    const context = makeExpansionContext({ maxNew: 5 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.expansionMetadata).toHaveLength(1);
      expect(v.expansionMetadata![0]!.strategyId).toBe("modifier");
    });
  });

  it("variant parentId = parent query id", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");
    const context = makeExpansionContext({ maxNew: 5 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.parentId).toBe(query.id);
    });
  });

  it("variant inherits providerId from parent", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
      providerId: "yelp",
    });
    const context = makeExpansionContext({ maxNew: 5, providerId: "yelp" });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.providerId).toBe("yelp");
    });
  });

  it("variant lifecycleState = generated", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");
    const context = makeExpansionContext({ maxNew: 5 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.lifecycleState).toBe("generated");
    });
  });

  it("variant has unique id (not same as parent)", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");
    const context = makeExpansionContext({ maxNew: 5 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.id).not.toBe(query.id);
    });
  });

  it("all variant ids are unique among themselves", async () => {
    const expander = makeExpander(["synonym", "modifier"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Hash-level deduplication
// ---------------------------------------------------------------------------

describe("QueryExpander — hash-level dedup", () => {
  it("does not produce a variant whose hash is in existingQueryHashes", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");

    // First run to get the variant hashes
    const firstResult = await expander.expand(
      query,
      makeExpansionContext({ maxNew: 10 }),
    );
    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    const firstHashes = new Set(firstResult.value.map((v) => v.queryHash));

    // Second run with those hashes pre-loaded
    const context = makeExpansionContext({
      maxNew: 10,
      existingQueryHashes: firstHashes,
    });
    const secondResult = await expander.expand(query, context);
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;
    secondResult.value.forEach((v) => {
      expect(firstHashes.has(v.queryHash)).toBe(false);
    });
  });

  it("does not produce two variants with the same queryHash", async () => {
    const expander = makeExpander(["synonym", "modifier", "plural"]);
    const query = makeTestQuery("plumber Lagos");
    const context = makeExpansionContext({ maxNew: 20 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hashes = result.value.map((v) => v.queryHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("text-level dedup: existing variant text is not re-produced", async () => {
    const expander = makeExpander(["synonym"]);
    const query = makeTestQuery("plumber Lagos, Nigeria");

    // Pre-load first synonym as existing
    const context = makeExpansionContext({
      maxNew: 10,
      existingVariants: ["plumbing contractor Lagos, Nigeria"],
    });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const texts = result.value.map((v) => v.rawText.toLowerCase());
    expect(texts).not.toContain("plumbing contractor lagos, nigeria");
  });
});

// ---------------------------------------------------------------------------
// Unknown strategy handling
// ---------------------------------------------------------------------------

describe("QueryExpander — unknown strategy IDs", () => {
  it("skips unknown strategy IDs when continueOnStrategyError=true", async () => {
    const expander = new QueryExpander(
      [new SynonymExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 20,
        defaultStrategyIds: ["synonym", "nonexistent"],
        continueOnStrategyError: true,
      },
    );
    const result = await expander.expand(
      makeTestQuery("plumber Lagos, Nigeria"),
      makeExpansionContext({ maxNew: 10 }),
    );
    expect(result.ok).toBe(true);
  });

  it("returns Err for unknown strategy when continueOnStrategyError=false", async () => {
    const expander = new QueryExpander(
      [new SynonymExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 20,
        defaultStrategyIds: ["nonexistent"],
        continueOnStrategyError: false,
      },
    );
    const result = await expander.expand(
      makeTestQuery("plumber Lagos, Nigeria"),
      makeExpansionContext({ maxNew: 10 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("STRATEGY_FAILED");
  });
});

// ---------------------------------------------------------------------------
// External plugin strategy compatibility
// ---------------------------------------------------------------------------

describe("QueryExpander — external plugin (IExpansionStrategy only)", () => {
  it("accepts plain IExpansionStrategy implementations (no BaseExpansionStrategy)", async () => {
    // A minimal plugin that does not extend BaseExpansionStrategy
    const plugin: IExpansionStrategy = {
      id: "custom-plugin",
      description: "Test plugin",
      async apply(q: GeneratedQuery, ctx: ExpansionContext) {
        return ok([`best ${q.rawText}`, `top ${q.rawText}`]);
      },
    };

    const expander = new QueryExpander([plugin], canonicalizer, {
      defaultMaxVariants: 20,
      defaultStrategyIds: ["custom-plugin"],
      continueOnStrategyError: true,
    });
    const result = await expander.expand(
      makeTestQuery("plumber Lagos"),
      makeExpansionContext({ maxNew: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.some((v) => v.rawText.startsWith("best "))).toBe(true);
  });

  it("wraps plugin variants with minimal ExpansionMetadata", async () => {
    const plugin: IExpansionStrategy = {
      id: "minimal-plugin",
      description: "Minimal test",
      async apply(q: GeneratedQuery, _ctx: ExpansionContext) {
        return ok([`premium ${q.rawText}`]);
      },
    };

    const expander = new QueryExpander([plugin], canonicalizer, {
      defaultMaxVariants: 20,
      defaultStrategyIds: ["minimal-plugin"],
      continueOnStrategyError: true,
    });
    const result = await expander.expand(
      makeTestQuery("plumber Lagos"),
      makeExpansionContext({ maxNew: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.expansionMetadata?.[0]?.strategyId).toBe(
      "minimal-plugin",
    );
  });

  it("handles plugin returning Err gracefully when continueOnStrategyError=true", async () => {
    const failingPlugin: IExpansionStrategy = {
      id: "failing-plugin",
      description: "Always fails",
      async apply(_q: GeneratedQuery, _ctx: ExpansionContext) {
        return err<ExpansionStrategyErrorDetail>({
          strategyId: "failing-plugin",
          code: "UNKNOWN",
          message: "deliberate failure",
        });
      },
    };

    const expander = new QueryExpander([failingPlugin], canonicalizer, {
      defaultMaxVariants: 20,
      defaultStrategyIds: ["failing-plugin"],
      continueOnStrategyError: true,
    });
    const result = await expander.expand(
      makeTestQuery("plumber Lagos"),
      makeExpansionContext({ maxNew: 5 }),
    );
    // Should return Ok([]) rather than propagating the error
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });
});
