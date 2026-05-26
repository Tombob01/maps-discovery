/**
 * QueryCanonicalizer test suite.
 * Covers: text normalisation, geo label normalisation, hash determinism,
 * duplicate detection, collapseByHash, and edge cases.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { QueryCanonicalizer } from "../../src/query-engine/QueryCanonicalizer.js";
import {
  makeQuery,
  makeQueryId,
  makeHash,
  makeIdentityParts,
  TEST_EPOCH,
} from "../helpers/builders.js";
import { makeCanonicalizer } from "../helpers/instances.js";

import type { QueryHash, QueryID } from "../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const canon = makeCanonicalizer({ sortModifierTokens: true });
const canonNoSort = makeCanonicalizer({ sortModifierTokens: false });
const emptyHashes: ReadonlyMap<QueryHash, QueryID> = new Map();

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

describe("QueryCanonicalizer.normalizeText()", () => {
  it("lowercases the entire string", () => {
    expect(canon.normalizeText("PLUMBERS Lagos")).toBe("plumbers lagos");
  });

  it("collapses multiple spaces to a single space", () => {
    expect(canon.normalizeText("plumbers   in    Lagos")).toBe(
      "plumbers in lagos",
    );
  });

  it("trims leading and trailing whitespace", () => {
    expect(canon.normalizeText("  plumbers Lagos  ")).toBe("plumbers lagos");
  });

  it("strips commas", () => {
    expect(canon.normalizeText("plumbers, Lagos, Nigeria")).toBe(
      "plumbers lagos nigeria",
    );
  });

  it("strips periods", () => {
    expect(canon.normalizeText("plumbers. Lagos.")).toBe("plumbers lagos");
  });

  it("strips semicolons", () => {
    expect(canon.normalizeText("plumbers; Lagos")).toBe("plumbers lagos");
  });

  it("strips exclamation marks", () => {
    expect(canon.normalizeText("plumbers! Lagos")).toBe("plumbers lagos");
  });

  it("strips question marks", () => {
    expect(canon.normalizeText("plumbers? Lagos")).toBe("plumbers lagos");
  });

  it("handles empty string without throwing", () => {
    expect(canon.normalizeText("")).toBe("");
  });

  it("handles whitespace-only string", () => {
    expect(canon.normalizeText("   ")).toBe("");
  });

  it("handles tabs and newlines as whitespace", () => {
    expect(canon.normalizeText("plumbers\tin\nLagos")).toBe(
      "plumbers in lagos",
    );
  });

  it("preserves hyphenated brand names", () => {
    // hyphens are not in the default strip pattern
    expect(canon.normalizeText("best-in-class plumbers Lagos")).toBe(
      "best-in-class plumbers lagos",
    );
  });

  it("returns identical output on repeated calls (idempotent)", () => {
    const first = canon.normalizeText("Emergency Plumbers, Lagos!");
    const second = canon.normalizeText(first);
    expect(second).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// Modifier token sorting
// ---------------------------------------------------------------------------

describe("QueryCanonicalizer.normalizeText() — modifier sorting", () => {
  it("sorts two leading modifiers alphabetically", () => {
    const a = canon.normalizeText("licensed emergency plumbers in Lagos");
    const b = canon.normalizeText("emergency licensed plumbers in Lagos");
    expect(a).toBe(b);
  });

  it("sorts three leading modifiers alphabetically", () => {
    const a = canon.normalizeText(
      "residential licensed emergency plumbers in Lagos",
    );
    const b = canon.normalizeText(
      "emergency residential licensed plumbers in Lagos",
    );
    const c = canon.normalizeText(
      "licensed emergency residential plumbers in Lagos",
    );
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("does NOT sort when an anchor word is the first token", () => {
    const result = canon.normalizeText("in Lagos emergency plumbers");
    // "in" is anchor → no prefix sort; tokens after are untouched
    expect(result).toBe("in lagos emergency plumbers");
  });

  it("does NOT sort when there is only one prefix token", () => {
    const result = canon.normalizeText("emergency plumbers in Lagos");
    expect(result).toBe("emergency plumbers in lagos");
  });

  it("preserves post-anchor token order", () => {
    const result = canon.normalizeText(
      "licensed emergency plumbers in Lagos Nigeria",
    );
    expect(result).toContain("in lagos nigeria");
  });

  it("disabling sortModifierTokens preserves original order", () => {
    const a = canonNoSort.normalizeText("licensed emergency plumbers in Lagos");
    const b = canonNoSort.normalizeText("emergency licensed plumbers in Lagos");
    expect(a).not.toBe(b);
    expect(a).toBe("licensed emergency plumbers in lagos");
    expect(b).toBe("emergency licensed plumbers in lagos");
  });
});

// ---------------------------------------------------------------------------
// Geo label normalisation
// ---------------------------------------------------------------------------

describe("QueryCanonicalizer.normalizeGeoLabel()", () => {
  it("lowercases the display name", () => {
    expect(canon.normalizeGeoLabel("Lagos, Nigeria")).toBe("lagos nigeria");
  });

  it("strips commas", () => {
    expect(canon.normalizeGeoLabel("Lagos, Nigeria")).toBe("lagos nigeria");
  });

  it("trims surrounding whitespace", () => {
    expect(canon.normalizeGeoLabel("  Lagos, Nigeria  ")).toBe("lagos nigeria");
  });

  it("collapses multiple spaces", () => {
    expect(canon.normalizeGeoLabel("Lagos,  Nigeria")).toBe("lagos nigeria");
  });

  it("strips periods and semicolons", () => {
    expect(canon.normalizeGeoLabel("Lagos. Nigeria; West")).toBe(
      "lagos nigeria west",
    );
  });

  it("returns empty string for empty input", () => {
    expect(canon.normalizeGeoLabel("")).toBe("");
  });

  it("is idempotent", () => {
    const first = canon.normalizeGeoLabel("Lagos, Nigeria");
    const second = canon.normalizeGeoLabel(first);
    expect(second).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// Hash determinism
// ---------------------------------------------------------------------------

describe("QueryCanonicalizer.hashFromParts() — determinism", () => {
  it("produces the same hash for identical inputs", () => {
    const parts = makeIdentityParts();
    const h1 = canon.hashFromParts(parts);
    const h2 = canon.hashFromParts(parts);
    expect(h1).toBe(h2);
  });

  it("produces a 64-character hex string", () => {
    const hash = canon.hashFromParts(makeIdentityParts());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is sensitive to canonicalText changes", () => {
    const base = makeIdentityParts({ canonicalText: "plumbers lagos nigeria" });
    const other = makeIdentityParts({
      canonicalText: "electricians lagos nigeria",
    });
    expect(canon.hashFromParts(base)).not.toBe(canon.hashFromParts(other));
  });

  it("is sensitive to providerId changes", () => {
    const base = makeIdentityParts({ providerId: "google-maps" });
    const other = makeIdentityParts({ providerId: "yelp" });
    expect(canon.hashFromParts(base)).not.toBe(canon.hashFromParts(other));
  });

  it("is sensitive to canonicalGeoLabel changes", () => {
    const lagos = makeIdentityParts({ canonicalGeoLabel: "lagos nigeria" });
    const abuja = makeIdentityParts({ canonicalGeoLabel: "abuja nigeria" });
    expect(canon.hashFromParts(lagos)).not.toBe(canon.hashFromParts(abuja));
  });

  it("produces known snapshot hash (regression guard)", () => {
    // This test pins the exact SHA-256 output. If the hashing logic
    // changes, this test will fail intentionally.
    const parts = makeIdentityParts({
      canonicalText: "plumbers lagos nigeria",
      canonicalGeoLabel: "lagos nigeria",
      providerId: "google-maps",
    });
    const hash = canon.hashFromParts(parts);
    expect(hash).toMatchSnapshot();
  });

  it("canonicalization-equivalent texts produce the same hash", () => {
    // "licensed emergency" and "emergency licensed" sort to the same text
    const h1 = canon.hashFromParts(
      makeIdentityParts({
        canonicalText: canon.normalizeText(
          "licensed emergency plumbers in Lagos",
        ),
      }),
    );
    const h2 = canon.hashFromParts(
      makeIdentityParts({
        canonicalText: canon.normalizeText(
          "emergency licensed plumbers in Lagos",
        ),
      }),
    );
    expect(h1).toBe(h2);
  });

  it("different provider + same text = different hash (collision prevention)", () => {
    const providers = ["google-maps", "yelp", "linkedin", "clutch"];
    const hashes = providers.map((pid) =>
      canon.hashFromParts(makeIdentityParts({ providerId: pid })),
    );
    const unique = new Set(hashes);
    expect(unique.size).toBe(providers.length);
  });

  it("different geo + same text = different hash (collision prevention)", () => {
    const geos = [
      "lagos nigeria",
      "abuja nigeria",
      "london uk",
      "new york usa",
    ];
    const hashes = geos.map((geo) =>
      canon.hashFromParts(makeIdentityParts({ canonicalGeoLabel: geo })),
    );
    const unique = new Set(hashes);
    expect(unique.size).toBe(geos.length);
  });
});

// ---------------------------------------------------------------------------
// canonicalize()
// ---------------------------------------------------------------------------

describe("QueryCanonicalizer.canonicalize()", () => {
  it("returns Ok with lifecycleState = canonicalized", () => {
    const query = makeQuery();
    const result = canon.canonicalize(query, emptyHashes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lifecycleState).toBe("canonicalized");
  });

  it("populates canonicalText from rawText", () => {
    const query = makeQuery({ rawText: "PLUMBERS, Lagos" });
    const result = canon.canonicalize(query, emptyHashes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonicalText).toBe("plumbers lagos");
  });

  it("populates canonicalGeoLabel from geoTarget.displayName", () => {
    const query = makeQuery();
    const result = canon.canonicalize(query, emptyHashes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonicalGeoLabel).toBe("lagos nigeria");
  });

  it("sets isDuplicateOfExisting=false when hash not in map", () => {
    const query = makeQuery();
    const result = canon.canonicalize(query, emptyHashes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isDuplicateOfExisting).toBe(false);
    expect(result.value.duplicateOfQueryId).toBeUndefined();
  });

  it("sets isDuplicateOfExisting=true when hash is already in map", () => {
    const query = makeQuery({ rawText: "plumbers Lagos, Nigeria" });
    const result1 = canon.canonicalize(query, emptyHashes);
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;

    const existingHash = result1.value.queryHash;
    const existingId = makeQueryId(99);
    const existing = new Map([[existingHash, existingId]]);

    const query2 = makeQuery({
      id: makeQueryId(2),
      rawText: "plumbers Lagos, Nigeria",
    });
    const result2 = canon.canonicalize(query2, existing);
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.value.isDuplicateOfExisting).toBe(true);
    expect(result2.value.duplicateOfQueryId).toBe(existingId);
  });

  it("returns Err(EMPTY_CANONICAL_TEXT) for whitespace-only rawText", () => {
    const query = makeQuery({ rawText: ",,, ;;;" });
    const result = canon.canonicalize(query, emptyHashes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMPTY_CANONICAL_TEXT");
  });

  it("preserves all original GeneratedQuery fields", () => {
    const query = makeQuery({ niche: "electricians", providerId: "yelp" });
    const result = canon.canonicalize(query, emptyHashes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.niche).toBe("electricians");
    expect(result.value.providerId).toBe("yelp");
    expect(result.value.id).toBe(query.id);
  });

  it("two canonically equivalent queries produce the same queryHash", () => {
    const q1 = makeQuery({
      id: makeQueryId(1),
      rawText: "Emergency Plumbers, Lagos",
    });
    const q2 = makeQuery({
      id: makeQueryId(2),
      rawText: "emergency plumbers lagos",
    });
    const r1 = canon.canonicalize(q1, emptyHashes);
    const r2 = canon.canonicalize(q2, emptyHashes);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.queryHash).toBe(r2.value.queryHash);
  });
});

// ---------------------------------------------------------------------------
// collapseByHash()
// ---------------------------------------------------------------------------

describe("QueryCanonicalizer.collapseByHash()", () => {
  it("returns empty array for empty input", () => {
    expect(canon.collapseByHash([])).toHaveLength(0);
  });

  it("returns single-element array unchanged", () => {
    const q = makeQuery();
    expect(canon.collapseByHash([q])).toHaveLength(1);
  });

  it("removes exact hash duplicates, keeping first occurrence", () => {
    const hash = makeHash("shared-hash");
    const q1 = makeQuery({ id: makeQueryId(1), queryHash: hash });
    const q2 = makeQuery({ id: makeQueryId(2), queryHash: hash });
    const result = canon.collapseByHash([q1, q2]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(makeQueryId(1));
  });

  it("preserves all queries with unique hashes", () => {
    const queries = [
      makeQuery({ id: makeQueryId(1), queryHash: makeHash("hash-a") }),
      makeQuery({ id: makeQueryId(2), queryHash: makeHash("hash-b") }),
      makeQuery({ id: makeQueryId(3), queryHash: makeHash("hash-c") }),
    ];
    expect(canon.collapseByHash(queries)).toHaveLength(3);
  });

  it("handles 3 duplicates among 5 queries correctly", () => {
    const h1 = makeHash("hash-1");
    const h2 = makeHash("hash-2");
    const queries = [
      makeQuery({ id: makeQueryId(1), queryHash: h1 }),
      makeQuery({ id: makeQueryId(2), queryHash: h2 }),
      makeQuery({ id: makeQueryId(3), queryHash: h1 }), // dup
      makeQuery({ id: makeQueryId(4), queryHash: h2 }), // dup
      makeQuery({ id: makeQueryId(5), queryHash: h1 }), // dup
    ];
    const result = canon.collapseByHash(queries);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe(makeQueryId(1));
    expect(result[1]?.id).toBe(makeQueryId(2));
  });

  it("preserves original array order for unique entries", () => {
    const queries = [
      makeQuery({ id: makeQueryId(3), queryHash: makeHash("c") }),
      makeQuery({ id: makeQueryId(1), queryHash: makeHash("a") }),
      makeQuery({ id: makeQueryId(2), queryHash: makeHash("b") }),
    ];
    const result = canon.collapseByHash(queries);
    expect(result.map((q) => q.id)).toEqual([
      makeQueryId(3),
      makeQueryId(1),
      makeQueryId(2),
    ]);
  });
});
