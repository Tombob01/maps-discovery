/**
 * ResolvedQueryFactory test suite.
 * Covers: field assembly from GeneratedQuery + ResolvedGeoTarget,
 * lifecycleState advancement, field preservation, and immutability.
 */

import { describe, it, expect } from "vitest";

import { ResolvedQueryFactory } from "../../src/query-engine/ResolvedQueryFactory.js";
import {
  makeQuery,
  makeGeoTarget,
  LAGOS_GEO,
  LONDON_GEO,
  makeHash,
  makeRunId,
  makeQueryId,
} from "../helpers/builders.js";

import type { ResolvedGeoTarget } from "../../src/core/types/geo.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const factory = new ResolvedQueryFactory();

function makeResolvedGeo(
  overrides: Partial<ResolvedGeoTarget> = {},
): ResolvedGeoTarget {
  return Object.freeze({
    ...LAGOS_GEO,
    resolvedCoordinates: Object.freeze({ lat: 6.5244, lng: 3.3792 }),
    ...overrides,
  }) as ResolvedGeoTarget;
}

// ---------------------------------------------------------------------------
// Field assembly
// ---------------------------------------------------------------------------

describe("ResolvedQueryFactory.create()", () => {
  it("returns an object with resolvedGeoTarget populated", () => {
    const query = makeQuery();
    const resolvedGeo = makeResolvedGeo();
    const result = factory.create(query, resolvedGeo);
    expect(result.resolvedGeoTarget).toBe(resolvedGeo);
  });

  it("resolvedGeoTarget carries the correct coordinates", () => {
    const query = makeQuery();
    const resolvedGeo = makeResolvedGeo({
      resolvedCoordinates: { lat: 6.5244, lng: 3.3792 },
    });
    const result = factory.create(query, resolvedGeo);
    expect(result.resolvedGeoTarget.resolvedCoordinates.lat).toBeCloseTo(
      6.5244,
      4,
    );
    expect(result.resolvedGeoTarget.resolvedCoordinates.lng).toBeCloseTo(
      3.3792,
      4,
    );
  });

  // ── lifecycleState advancement ───────────────────────────────────────────

  it("sets lifecycleState = canonicalized regardless of input lifecycle", () => {
    const generated = makeQuery({ lifecycleState: "generated" });
    const result = factory.create(generated, makeResolvedGeo());
    expect(result.lifecycleState).toBe("canonicalized");
  });

  it("advances lifecycle even if input was already canonicalized", () => {
    const canon = makeQuery({ lifecycleState: "canonicalized" });
    const result = factory.create(canon, makeResolvedGeo());
    expect(result.lifecycleState).toBe("canonicalized");
  });

  // ── Field preservation ───────────────────────────────────────────────────

  it("preserves id from the source query", () => {
    const id = makeQueryId(42);
    const query = makeQuery({ id });
    expect(factory.create(query, makeResolvedGeo()).id).toBe(id);
  });

  it("preserves runId from the source query", () => {
    const runId = makeRunId(99);
    const query = makeQuery({ runId });
    expect(factory.create(query, makeResolvedGeo()).runId).toBe(runId);
  });

  it("preserves rawText from the source query", () => {
    const query = makeQuery({ rawText: "plumbing contractors Lekki" });
    expect(factory.create(query, makeResolvedGeo()).rawText).toBe(
      "plumbing contractors Lekki",
    );
  });

  it("preserves niche from the source query", () => {
    const query = makeQuery({ niche: "electricians" });
    expect(factory.create(query, makeResolvedGeo()).niche).toBe("electricians");
  });

  it("preserves providerId from the source query", () => {
    const query = makeQuery({ providerId: "yelp" });
    expect(factory.create(query, makeResolvedGeo()).providerId).toBe("yelp");
  });

  it("preserves queryHash from the source query", () => {
    const hash = makeHash("stable-hash");
    const query = makeQuery({ queryHash: hash });
    expect(factory.create(query, makeResolvedGeo()).queryHash).toBe(hash);
  });

  it("preserves generatedByStrategies from the source query", () => {
    const strats = Object.freeze(["seed", "synonym"]);
    const query = makeQuery({ generatedByStrategies: strats });
    expect(
      factory.create(query, makeResolvedGeo()).generatedByStrategies,
    ).toEqual(strats);
  });

  it("preserves parentId (null for root queries)", () => {
    const query = makeQuery({ parentId: null });
    expect(factory.create(query, makeResolvedGeo()).parentId).toBeNull();
  });

  it("preserves parentId when set", () => {
    const pid = makeQueryId(5);
    const query = makeQuery({ parentId: pid });
    expect(factory.create(query, makeResolvedGeo()).parentId).toBe(pid);
  });

  it("preserves status = pending", () => {
    const query = makeQuery();
    expect(factory.create(query, makeResolvedGeo()).status).toBe("pending");
  });

  it("preserves geoTarget (original, pre-resolution)", () => {
    const query = makeQuery({ geoTarget: LONDON_GEO });
    expect(factory.create(query, makeResolvedGeo()).geoTarget).toBe(LONDON_GEO);
  });

  it("preserves optional score when present", () => {
    const query = makeQuery({ score: 0.92 });
    expect(factory.create(query, makeResolvedGeo()).score).toBe(0.92);
  });

  it("preserves score as undefined when absent", () => {
    const query = makeQuery();
    expect(factory.create(query, makeResolvedGeo()).score).toBeUndefined();
  });

  it("preserves expansionMetadata when present", () => {
    const meta = [{ strategyId: "synonym", confidence: 0.85 }];
    const query = makeQuery({ expansionMetadata: meta });
    expect(factory.create(query, makeResolvedGeo()).expansionMetadata).toEqual(
      meta,
    );
  });

  // ── Immutability ─────────────────────────────────────────────────────────

  it("returns a frozen object", () => {
    const result = factory.create(makeQuery(), makeResolvedGeo());
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("does not mutate the source query", () => {
    const query = makeQuery({ lifecycleState: "generated" });
    factory.create(query, makeResolvedGeo());
    expect(query.lifecycleState).toBe("generated");
  });

  it("different calls with same inputs produce structurally equal but distinct objects", () => {
    const query = makeQuery();
    const resolvedGeo = makeResolvedGeo();
    const r1 = factory.create(query, resolvedGeo);
    const r2 = factory.create(query, resolvedGeo);
    expect(r1).not.toBe(r2); // different object references
    expect(r1.queryHash).toBe(r2.queryHash); // same content
    expect(r1.lifecycleState).toBe(r2.lifecycleState);
  });

  // ── Two distinct geo targets ─────────────────────────────────────────────

  it("two resolved queries with different geoTargets have different resolvedCoordinates", () => {
    const query = makeQuery();
    const lagosGeo = makeResolvedGeo({
      resolvedCoordinates: { lat: 6.52, lng: 3.38 },
    });
    const abujaGeo = makeResolvedGeo({
      resolvedCoordinates: { lat: 9.07, lng: 7.4 },
    });
    const r1 = factory.create(query, lagosGeo);
    const r2 = factory.create(query, abujaGeo);
    expect(r1.resolvedGeoTarget.resolvedCoordinates.lat).not.toBe(
      r2.resolvedGeoTarget.resolvedCoordinates.lat,
    );
  });
});
