/**
 * QueryBuilder test suite.
 * Covers: rawText composition, queryHash determinism, lifecycle init,
 * field assignment, provenance, multi-provider builds.
 */

import { describe, it, expect } from "vitest";

import { QueryBuilder } from "../../src/query-engine/QueryBuilder.js";
import {
  makeRunId,
  makeSeed,
  makeGeoTarget,
  LAGOS_GEO,
  LONDON_GEO,
} from "../helpers/builders.js";
import { canonicalizer } from "../helpers/instances.js";

const builder = new QueryBuilder(canonicalizer);
const RUN_ID = makeRunId(1);

describe("QueryBuilder.build()", () => {
  // ── rawText composition ──────────────────────────────────────────────────

  it("composes rawText as niche + displayName when no modifiers", () => {
    const seed = makeSeed({ niche: "plumbers", location: LAGOS_GEO });
    const query = builder.build(seed, RUN_ID, "google-maps");
    expect(query.rawText).toBe("plumbers Lagos, Nigeria");
  });

  it("prepends modifiers to rawText when provided", () => {
    const seed = makeSeed({
      niche: "plumbers",
      modifiers: ["emergency", "licensed"],
    });
    const query = builder.build(seed, RUN_ID, "google-maps");
    expect(query.rawText).toBe("emergency licensed plumbers Lagos, Nigeria");
  });

  it("ignores empty-string modifiers", () => {
    const seed = makeSeed({
      niche: "plumbers",
      modifiers: ["", "emergency", ""],
    });
    const query = builder.build(seed, RUN_ID, "google-maps");
    expect(query.rawText).toBe("emergency plumbers Lagos, Nigeria");
  });

  it("trims niche whitespace", () => {
    const seed = makeSeed({ niche: "  plumbers  " });
    const query = builder.build(seed, RUN_ID, "google-maps");
    expect(query.rawText).toBe("plumbers Lagos, Nigeria");
  });

  it("trims location displayName whitespace", () => {
    const seed = makeSeed({
      location: makeGeoTarget({ displayName: "  Lagos, Nigeria  " }),
    });
    const query = builder.build(seed, RUN_ID, "google-maps");
    expect(query.rawText).toBe("plumbers Lagos, Nigeria");
  });

  // ── Field assignment ─────────────────────────────────────────────────────

  it("sets niche to lowercased, trimmed value", () => {
    const seed = makeSeed({ niche: "  Plumbers  " });
    const query = builder.build(seed, RUN_ID, "google-maps");
    expect(query.niche).toBe("plumbers");
  });

  it("sets providerId correctly", () => {
    const seed = makeSeed();
    const query = builder.build(seed, RUN_ID, "yelp");
    expect(query.providerId).toBe("yelp");
  });

  it("sets runId correctly", () => {
    const run = makeRunId(42);
    const seed = makeSeed();
    const query = builder.build(seed, run, "google-maps");
    expect(query.runId).toBe(run);
  });

  it("sets parentId = null (root query)", () => {
    const query = builder.build(makeSeed(), RUN_ID, "google-maps");
    expect(query.parentId).toBeNull();
  });

  it("sets generatedByStrategies = ['seed']", () => {
    const query = builder.build(makeSeed(), RUN_ID, "google-maps");
    expect(query.generatedByStrategies).toEqual(["seed"]);
  });

  it("sets lifecycleState = generated", () => {
    const query = builder.build(makeSeed(), RUN_ID, "google-maps");
    expect(query.lifecycleState).toBe("generated");
  });

  it("sets status = pending", () => {
    const query = builder.build(makeSeed(), RUN_ID, "google-maps");
    expect(query.status).toBe("pending");
  });

  it("does not set expansionMetadata on root query", () => {
    const query = builder.build(makeSeed(), RUN_ID, "google-maps");
    expect(query.expansionMetadata).toBeUndefined();
  });

  it("does not set score on root query", () => {
    const query = builder.build(makeSeed(), RUN_ID, "google-maps");
    expect(query.score).toBeUndefined();
  });

  it("sets geoTarget to seed.location", () => {
    const seed = makeSeed({ location: LONDON_GEO });
    const query = builder.build(seed, RUN_ID, "google-maps");
    expect(query.geoTarget).toBe(LONDON_GEO);
  });

  // ── Hash determinism ─────────────────────────────────────────────────────

  it("produces the same queryHash for identical seed + providerId", () => {
    const seed = makeSeed({ niche: "plumbers", location: LAGOS_GEO });
    const q1 = builder.build(seed, makeRunId(1), "google-maps");
    const q2 = builder.build(seed, makeRunId(2), "google-maps"); // different runId
    expect(q1.queryHash).toBe(q2.queryHash);
  });

  it("produces different queryHash for different providerIds", () => {
    const seed = makeSeed();
    const q1 = builder.build(seed, RUN_ID, "google-maps");
    const q2 = builder.build(seed, RUN_ID, "yelp");
    expect(q1.queryHash).not.toBe(q2.queryHash);
  });

  it("produces different queryHash for different niches", () => {
    const q1 = builder.build(
      makeSeed({ niche: "plumbers" }),
      RUN_ID,
      "google-maps",
    );
    const q2 = builder.build(
      makeSeed({ niche: "electricians" }),
      RUN_ID,
      "google-maps",
    );
    expect(q1.queryHash).not.toBe(q2.queryHash);
  });

  it("produces different queryHash for different locations", () => {
    const q1 = builder.build(
      makeSeed({ location: LAGOS_GEO }),
      RUN_ID,
      "google-maps",
    );
    const q2 = builder.build(
      makeSeed({ location: LONDON_GEO }),
      RUN_ID,
      "google-maps",
    );
    expect(q1.queryHash).not.toBe(q2.queryHash);
  });

  it("queryHash is a 64-char hex string", () => {
    const query = builder.build(makeSeed(), RUN_ID, "google-maps");
    expect(query.queryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── ID uniqueness ────────────────────────────────────────────────────────

  it("assigns a unique id per call even for identical seeds", () => {
    const seed = makeSeed();
    const q1 = builder.build(seed, RUN_ID, "google-maps");
    const q2 = builder.build(seed, RUN_ID, "google-maps");
    expect(q1.id).not.toBe(q2.id);
  });

  // ── buildForProviders ────────────────────────────────────────────────────

  it("buildForProviders returns one query per provider", () => {
    const seed = makeSeed();
    const queries = builder.buildForProviders(seed, RUN_ID, [
      "google-maps",
      "yelp",
      "linkedin",
    ]);
    expect(queries).toHaveLength(3);
    const providers = queries.map((q) => q.providerId);
    expect(providers).toEqual(["google-maps", "yelp", "linkedin"]);
  });

  it("buildForProviders returns empty array for empty providerIds", () => {
    expect(builder.buildForProviders(makeSeed(), RUN_ID, [])).toHaveLength(0);
  });
});
