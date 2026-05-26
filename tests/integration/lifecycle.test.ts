/**
 * Query lifecycle and provenance test suite.
 * Covers: QueryLifecycleState transitions, expansionMetadata chaining,
 * generatedByStrategies array semantics, and score optional field.
 */

import { describe, it, expect } from "vitest";

import { QUERY_ENGINE_DEFAULTS } from "../../src/query-engine/config/QueryEngineConfig.js";
import { QueryBuilder } from "../../src/query-engine/QueryBuilder.js";
import { QueryCanonicalizer } from "../../src/query-engine/QueryCanonicalizer.js";
import { QueryExpander } from "../../src/query-engine/QueryExpander.js";
import { ModifierExpansionStrategy } from "../../src/query-engine/strategies/ModifierExpansionStrategy.js";
import { SynonymExpansionStrategy } from "../../src/query-engine/strategies/SynonymExpansionStrategy.js";
import {
  makeQuery,
  makeCanonicalizedQuery,
  makeExpansionContext,
  makeExpansionMetadata,
  makeRunId,
  makeQueryId,
  makeHash,
  LAGOS_GEO,
  makeSeed,
  makeGeoTarget,
} from "../helpers/builders.js";
import { canonicalizer, niches } from "../helpers/instances.js";

import type {
  QueryHash,
  QueryID,
  QueryLifecycleState,
} from "../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Lifecycle state values
// ---------------------------------------------------------------------------

describe("QueryLifecycleState — valid state set", () => {
  const validStates: QueryLifecycleState[] = [
    "generated",
    "canonicalized",
    "queued",
    "dispatched",
    "running",
    "complete",
    "failed",
    "skipped",
  ];

  it("all expected states are distinct strings", () => {
    const unique = new Set(validStates);
    expect(unique.size).toBe(validStates.length);
  });

  it("makeQuery defaults to 'generated'", () => {
    const q = makeQuery();
    expect(q.lifecycleState).toBe("generated");
  });

  it("makeCanonicalizedQuery sets 'canonicalized'", () => {
    const q = makeQuery();
    const cq = makeCanonicalizedQuery(q);
    expect(cq.lifecycleState).toBe("canonicalized");
  });

  it("QueryBuilder.build() sets 'generated'", () => {
    const builder = new QueryBuilder(canonicalizer);
    const q = builder.build(makeSeed(), makeRunId(1), "google-maps");
    expect(q.lifecycleState).toBe("generated");
  });

  it("QueryCanonicalizer.canonicalize() returns 'canonicalized'", () => {
    const q = makeQuery();
    const result = canonicalizer.canonicalize(q, new Map());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lifecycleState).toBe("canonicalized");
  });
});

// ---------------------------------------------------------------------------
// QueryExpander — lifecycle state on variants
// ---------------------------------------------------------------------------

describe("QueryExpander — variant lifecycleState", () => {
  const expander = new QueryExpander(
    [new SynonymExpansionStrategy(niches)],
    canonicalizer,
    {
      defaultMaxVariants: 10,
      defaultStrategyIds: ["synonym"],
      continueOnStrategyError: true,
    },
  );

  it("expanded variants have lifecycleState = generated", async () => {
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 5 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.lifecycleState).toBe("generated");
    });
  });

  it("canonicalized variants have lifecycleState = canonicalized", async () => {
    const builder = new QueryBuilder(canonicalizer);
    const root = builder.build(
      makeSeed({ niche: "plumbers" }),
      makeRunId(1),
      "google-maps",
    );
    const canonRoot = canonicalizer.canonicalize(root, new Map());
    expect(canonRoot.ok).toBe(true);
    if (!canonRoot.ok) return;

    const context = makeExpansionContext({ maxNew: 5 });
    const expanded = await expander.expand(canonRoot.value, context);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;

    const seenHashes = new Map<QueryHash, QueryID>([[root.queryHash, root.id]]);
    expanded.value.forEach((v) => {
      const canon = canonicalizer.canonicalize(v, seenHashes);
      if (canon.ok) {
        expect(canon.value.lifecycleState).toBe("canonicalized");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// generatedByStrategies — chaining semantics
// ---------------------------------------------------------------------------

describe("generatedByStrategies chaining", () => {
  it("root query has exactly ['seed']", () => {
    const builder = new QueryBuilder(canonicalizer);
    const q = builder.build(makeSeed(), makeRunId(1), "google-maps");
    expect(q.generatedByStrategies).toEqual(["seed"]);
  });

  it("single-strategy variant has ['seed', strategyId]", async () => {
    const expander = new QueryExpander(
      [new ModifierExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 10,
        defaultStrategyIds: ["modifier"],
        continueOnStrategyError: true,
      },
    );
    const query = makeQuery({ rawText: "plumber Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 3 });
    const result = await expander.expand(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    result.value.forEach((v) => {
      expect(v.generatedByStrategies[0]).toBe("seed");
      expect(v.generatedByStrategies[1]).toBe("modifier");
      expect(v.generatedByStrategies).toHaveLength(2);
    });
  });

  it("generatedByStrategies is a ReadonlyArray (frozen)", async () => {
    const expander = new QueryExpander(
      [new SynonymExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 10,
        defaultStrategyIds: ["synonym"],
        continueOnStrategyError: true,
      },
    );
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const result = await expander.expand(
      query,
      makeExpansionContext({ maxNew: 3 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(Object.isFrozen(v.generatedByStrategies)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// expansionMetadata shape and chaining
// ---------------------------------------------------------------------------

describe("expansionMetadata shape", () => {
  it("root query has no expansionMetadata", () => {
    const builder = new QueryBuilder(canonicalizer);
    const q = builder.build(makeSeed(), makeRunId(1), "google-maps");
    expect(q.expansionMetadata).toBeUndefined();
  });

  it("makeExpansionMetadata produces correct shape", () => {
    const meta = makeExpansionMetadata("synonym", {
      sourceTerm: "plumber",
      confidence: 0.85,
      parentQueryHash: makeHash("parent"),
    });
    expect(meta.strategyId).toBe("synonym");
    expect(meta.sourceTerm).toBe("plumber");
    expect(meta.confidence).toBe(0.85);
    expect(meta.parentQueryHash).toBe(makeHash("parent"));
  });

  it("makeExpansionMetadata without optionals omits those fields", () => {
    const meta = makeExpansionMetadata("modifier");
    expect(meta.strategyId).toBe("modifier");
    expect(meta.sourceTerm).toBeUndefined();
    expect(meta.confidence).toBeUndefined();
    expect(meta.parentQueryHash).toBeUndefined();
  });

  it("expanded variant has one expansionMetadata entry per strategy", async () => {
    const expander = new QueryExpander(
      [new SynonymExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 10,
        defaultStrategyIds: ["synonym"],
        continueOnStrategyError: true,
      },
    );
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const result = await expander.expand(
      query,
      makeExpansionContext({ maxNew: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      expect(v.expansionMetadata).toHaveLength(1);
    });
  });

  it("expansionMetadata entries have strategyId, confidence, parentQueryHash", async () => {
    const expander = new QueryExpander(
      [new SynonymExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 10,
        defaultStrategyIds: ["synonym"],
        continueOnStrategyError: true,
      },
    );
    const hash = makeHash("root-hash");
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
      queryHash: hash,
    });
    const result = await expander.expand(
      query,
      makeExpansionContext({ maxNew: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      const meta = v.expansionMetadata![0]!;
      expect(meta.strategyId).toBe("synonym");
      expect(meta.confidence).toBe(0.85);
      expect(meta.parentQueryHash).toBe(hash);
    });
  });

  it("expansionMetadata array is frozen", async () => {
    const expander = new QueryExpander(
      [new ModifierExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 10,
        defaultStrategyIds: ["modifier"],
        continueOnStrategyError: true,
      },
    );
    const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
    const result = await expander.expand(
      query,
      makeExpansionContext({ maxNew: 3 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      if (v.expansionMetadata) {
        expect(Object.isFrozen(v.expansionMetadata)).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// score optional field
// ---------------------------------------------------------------------------

describe("score field", () => {
  it("root query has no score (absent = 1.0 by convention)", () => {
    const builder = new QueryBuilder(canonicalizer);
    const q = builder.build(makeSeed(), makeRunId(1), "google-maps");
    expect(q.score).toBeUndefined();
  });

  it("makeQuery with explicit score preserves it", () => {
    const q = makeQuery({ score: 0.75 });
    expect(q.score).toBe(0.75);
  });

  it("makeQuery without score has undefined score", () => {
    const q = makeQuery();
    expect(q.score).toBeUndefined();
  });

  it("expander does not assign score (no QueryRanker yet)", async () => {
    const expander = new QueryExpander(
      [new SynonymExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 10,
        defaultStrategyIds: ["synonym"],
        continueOnStrategyError: true,
      },
    );
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const result = await expander.expand(
      query,
      makeExpansionContext({ maxNew: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Score should be absent on all expanded variants (not 0 — absent)
    result.value.forEach((v) => {
      expect(v.score).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// queryHash stability across lifecycle stages
// ---------------------------------------------------------------------------

describe("queryHash stability across lifecycle stages", () => {
  it("queryHash does not change from generated to canonicalized", () => {
    const builder = new QueryBuilder(canonicalizer);
    const q = builder.build(makeSeed(), makeRunId(1), "google-maps");
    const hashAtGenerated = q.queryHash;

    const canonResult = canonicalizer.canonicalize(q, new Map());
    expect(canonResult.ok).toBe(true);
    if (!canonResult.ok) return;
    expect(canonResult.value.queryHash).toBe(hashAtGenerated);
  });

  it("parentQueryHash in metadata matches parent's queryHash at time of expansion", async () => {
    const expander = new QueryExpander(
      [new SynonymExpansionStrategy(niches)],
      canonicalizer,
      {
        defaultMaxVariants: 10,
        defaultStrategyIds: ["synonym"],
        continueOnStrategyError: true,
      },
    );
    const parent = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const result = await expander.expand(
      parent,
      makeExpansionContext({ maxNew: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.forEach((v) => {
      const meta = v.expansionMetadata![0]!;
      if (meta.parentQueryHash !== undefined) {
        expect(meta.parentQueryHash).toBe(parent.queryHash);
      }
    });
  });
});
