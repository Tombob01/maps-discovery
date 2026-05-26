/**
 * Expansion strategies test suite.
 * Covers: SynonymExpansionStrategy, ModifierExpansionStrategy,
 * PluralExpansionStrategy, GeoExpansionStrategy, provenance tracking,
 * budget enforcement, and duplicate filtering.
 */

import { describe, it, expect } from "vitest";

import { GeoExpansionStrategy } from "../../src/query-engine/strategies/GeoExpansionStrategy.js";
import { ModifierExpansionStrategy } from "../../src/query-engine/strategies/ModifierExpansionStrategy.js";
import { PluralExpansionStrategy } from "../../src/query-engine/strategies/PluralExpansionStrategy.js";
import { SynonymExpansionStrategy } from "../../src/query-engine/strategies/SynonymExpansionStrategy.js";
import {
  makeQuery,
  makeExpansionContext,
  makeNicheDictionary,
  makeNicheDictionaryIndex,
  makeGeoDictionary,
  makeGeoDictionaryIndex,
  makeGeoTarget,
  makeGeoSubLocation,
  makeGeoRegion,
  makeHash,
  LAGOS_GEO,
} from "../helpers/builders.js";
import { niches, nigeGeo, emptyGeo } from "../helpers/instances.js";

// ============================================================================
// SynonymExpansionStrategy
// ============================================================================

describe("SynonymExpansionStrategy", () => {
  const strategy = new SynonymExpansionStrategy(niches);

  it("has id = synonym", () => {
    expect(strategy.id).toBe("synonym");
  });

  it("generates synonym variants for a matched term", async () => {
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value).toContain("plumbing contractor Lagos, Nigeria");
  });

  it("generates all three synonyms for plumber", async () => {
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("plumbing contractor Lagos, Nigeria");
    expect(result.value).toContain("pipefitter Lagos, Nigeria");
    expect(result.value).toContain("drainage specialist Lagos, Nigeria");
  });

  it("returns empty array when niche has no dictionary", async () => {
    const query = makeQuery({ niche: "unknown-niche" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("returns empty array when no term matches the rawText", async () => {
    const query = makeQuery({
      rawText: "restaurants Lagos",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("respects maxNew budget", async () => {
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 2 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(2);
  });

  it("does not include the original rawText as a variant", async () => {
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toContain(query.rawText);
  });

  it("does not duplicate already-existing variants", async () => {
    const query = makeQuery({
      rawText: "plumber Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({
      maxNew: 10,
      existingVariants: ["plumbing contractor Lagos, Nigeria"],
    });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toContain("plumbing contractor Lagos, Nigeria");
  });

  it("is case-insensitive for term matching", async () => {
    const query = makeQuery({
      rawText: "PLUMBER Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  it("does not partially replace within compound words", async () => {
    // "plumber" should not match inside "plumbers" with wrong boundary
    const query = makeQuery({
      rawText: "plumbers Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should not produce "plumbing contractors Lagos" from replacing "plumber" in "plumbers"
    const noPartial = result.value.every(
      (v) => !v.includes("plumbing contractors Lagos"),
    );
    expect(noPartial).toBe(true);
  });

  describe("provenance (applyWithMetadata)", () => {
    it("attaches strategyId = synonym", () => {
      const query = makeQuery({
        rawText: "plumber Lagos, Nigeria",
        niche: "plumbers",
      });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThan(0);
      result.value.forEach((c) => {
        expect(c.metadata.strategyId).toBe("synonym");
      });
    });

    it("attaches sourceTerm = plumber", () => {
      const query = makeQuery({
        rawText: "plumber Lagos, Nigeria",
        niche: "plumbers",
      });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.sourceTerm).toBe("plumber");
      });
    });

    it("attaches confidence = 0.85", () => {
      const query = makeQuery({
        rawText: "plumber Lagos, Nigeria",
        niche: "plumbers",
      });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.confidence).toBe(0.85);
      });
    });

    it("attaches parentQueryHash from the source query", () => {
      const hash = makeHash("parent-hash");
      const query = makeQuery({
        rawText: "plumber Lagos, Nigeria",
        niche: "plumbers",
        queryHash: hash,
      });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.parentQueryHash).toBe(hash);
      });
    });
  });
});

// ============================================================================
// ModifierExpansionStrategy
// ============================================================================

describe("ModifierExpansionStrategy", () => {
  const strategy = new ModifierExpansionStrategy(niches);

  it("has id = modifier", () => {
    expect(strategy.id).toBe("modifier");
  });

  it("generates modifier-prefixed variants", async () => {
    const query = makeQuery({
      rawText: "plumbers Lagos, Nigeria",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value).toContain("emergency plumbers Lagos, Nigeria");
    expect(result.value).toContain("residential plumbers Lagos, Nigeria");
  });

  it("does not add a modifier already present in the rawText", async () => {
    const query = makeQuery({
      rawText: "emergency plumbers Lagos",
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hasDoubleEmergency = result.value.some((v) =>
      v.startsWith("emergency emergency"),
    );
    expect(hasDoubleEmergency).toBe(false);
  });

  it("returns empty for unknown niche", async () => {
    const query = makeQuery({ niche: "unknown" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("respects maxNew budget", async () => {
    const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 2 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(2);
  });

  it("deduplicates across terms with overlapping modifiers", async () => {
    const dict = makeNicheDictionary({
      niche: "plumbers",
      terms: [
        { term: "plumber", synonyms: [], modifiers: ["local", "emergency"] },
        {
          term: "plumbing services",
          synonyms: [],
          modifiers: ["local", "affordable"],
        },
      ],
    });
    const idx = makeNicheDictionaryIndex([dict]);
    const strategy = new ModifierExpansionStrategy(idx);
    const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const localCount = result.value.filter((v) =>
      v.startsWith("local "),
    ).length;
    expect(localCount).toBe(1);
  });

  describe("provenance", () => {
    it("sets strategyId = modifier and sourceTerm = the modifier word", () => {
      const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.strategyId).toBe("modifier");
        expect(typeof c.metadata.sourceTerm).toBe("string");
        expect(c.metadata.sourceTerm).toBeTruthy();
      });
    });

    it("confidence = 0.80", () => {
      const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.confidence).toBe(0.8);
      });
    });
  });
});

// ============================================================================
// PluralExpansionStrategy
// ============================================================================

describe("PluralExpansionStrategy", () => {
  const strategy = new PluralExpansionStrategy(niches);

  it("has id = plural", () => {
    expect(strategy.id).toBe("plural");
  });

  it("generates plural form when rawText contains singular term", async () => {
    const query = makeQuery({ rawText: "plumber Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("plumbers Lagos");
  });

  it("generates singular form when rawText contains plural term", async () => {
    const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("plumber Lagos");
  });

  it("returns empty for unknown niche", async () => {
    const query = makeQuery({ niche: "unknown" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("does not generate a variant when term has no plural/singular", async () => {
    const dict = makeNicheDictionary({
      niche: "services",
      terms: [{ term: "services", synonyms: [], modifiers: [] }],
    });
    const idx = makeNicheDictionaryIndex([dict]);
    const strategy = new PluralExpansionStrategy(idx);
    const query = makeQuery({ rawText: "services Lagos", niche: "services" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("does not produce a variant if substitution is a no-op", async () => {
    // If the dictionary says plural = "plumbers" but the rawText already IS "plumbers",
    // the substitution of "plumbers" → "plumbers" must be dropped.
    const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toContain("plumbers Lagos");
  });

  it("respects maxNew budget", async () => {
    const query = makeQuery({ rawText: "plumber Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 1 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(1);
  });

  describe("provenance", () => {
    it("confidence = 0.90", () => {
      const query = makeQuery({ rawText: "plumber Lagos", niche: "plumbers" });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.confidence).toBe(0.9);
      });
    });

    it("strategyId = plural", () => {
      const query = makeQuery({ rawText: "plumber Lagos", niche: "plumbers" });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.strategyId).toBe("plural");
      });
    });
  });
});

// ============================================================================
// GeoExpansionStrategy
// ============================================================================

describe("GeoExpansionStrategy", () => {
  const strategy = new GeoExpansionStrategy(nigeGeo);

  it("has id = geo", () => {
    expect(strategy.id).toBe("geo");
  });

  it("generates sub-location variants for Lagos", async () => {
    const query = makeQuery({
      rawText: "plumbers Lagos",
      geoTarget: makeGeoTarget({
        displayName: "Lagos, Nigeria",
        city: "Lagos",
      }),
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.some((v) => v.includes("Victoria Island"))).toBe(true);
    expect(result.value.some((v) => v.includes("Lekki"))).toBe(true);
    expect(result.value.some((v) => v.includes("Ikeja"))).toBe(true);
  });

  it("generates alias variants at slightly lower confidence", async () => {
    const query = makeQuery({
      rawText: "plumbers Lagos",
      geoTarget: makeGeoTarget({
        displayName: "Lagos, Nigeria",
        city: "Lagos",
      }),
      niche: "plumbers",
    });
    const context = makeExpansionContext({ maxNew: 20 });
    const result = strategy.applyWithMetadata(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // VI is an alias for Victoria Island
    const viVariant = result.value.find((c) => c.rawText.includes(" VI"));
    if (viVariant) {
      const mainVariant = result.value.find((c) =>
        c.rawText.includes("Victoria Island"),
      );
      expect(viVariant.metadata.confidence!).toBeLessThan(
        mainVariant!.metadata.confidence!,
      );
    }
  });

  it("returns empty when no geo dictionary matches", async () => {
    const strategy = new GeoExpansionStrategy(emptyGeo);
    const query = makeQuery({ rawText: "plumbers Lagos", niche: "plumbers" });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("returns empty when city name not in rawText", async () => {
    // rawText has "Abuja" but geoTarget city is "Lagos" → no match
    const query = makeQuery({
      rawText: "plumbers Abuja",
      geoTarget: makeGeoTarget({
        displayName: "Lagos, Nigeria",
        city: "Lagos",
      }),
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("returns empty when sub-locations array is empty", async () => {
    const dict = makeGeoDictionary({
      regions: [makeGeoRegion({ name: "EmptyCity", subLocations: [] })],
    });
    const idx = makeGeoDictionaryIndex([dict]);
    const strategy = new GeoExpansionStrategy(idx);
    const query = makeQuery({
      rawText: "plumbers EmptyCity",
      geoTarget: makeGeoTarget({
        displayName: "EmptyCity, Nigeria",
        city: "EmptyCity",
      }),
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("respects maxNew budget", async () => {
    const query = makeQuery({
      rawText: "plumbers Lagos",
      geoTarget: makeGeoTarget({
        displayName: "Lagos, Nigeria",
        city: "Lagos",
      }),
    });
    const context = makeExpansionContext({ maxNew: 2 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(2);
  });

  it("falls back to state when city is absent", async () => {
    const query = makeQuery({
      rawText: "plumbers Lagos",
      geoTarget: makeGeoTarget({
        displayName: "Lagos, Nigeria",
        state: "Lagos",
      }), // city absent
    });
    const context = makeExpansionContext({ maxNew: 10 });
    const result = await strategy.apply(query, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  describe("provenance", () => {
    it("confidence = 0.75 for primary sub-location names", () => {
      const query = makeQuery({
        rawText: "plumbers Lagos",
        geoTarget: makeGeoTarget({
          displayName: "Lagos, Nigeria",
          city: "Lagos",
        }),
      });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const primaries = result.value.filter((c) =>
        ["Victoria Island", "Lekki", "Ikeja", "Surulere"].some((n) =>
          c.rawText.includes(n),
        ),
      );
      primaries.forEach((c) => {
        expect(c.metadata.confidence).toBe(0.75);
      });
    });

    it("strategyId = geo", () => {
      const query = makeQuery({
        rawText: "plumbers Lagos",
        geoTarget: makeGeoTarget({
          displayName: "Lagos, Nigeria",
          city: "Lagos",
        }),
      });
      const context = makeExpansionContext({ maxNew: 10 });
      const result = strategy.applyWithMetadata(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.value.forEach((c) => {
        expect(c.metadata.strategyId).toBe("geo");
      });
    });
  });
});

// ============================================================================
// Cross-strategy: budget enforcement
// ============================================================================

describe("Budget enforcement across all strategies", () => {
  const allStrategies = [
    new SynonymExpansionStrategy(niches),
    new ModifierExpansionStrategy(niches),
    new PluralExpansionStrategy(niches),
    new GeoExpansionStrategy(nigeGeo),
  ];

  it.each([0, 1, 3, 5])("maxNew=%i is never exceeded", async (maxNew) => {
    const query = makeQuery({
      rawText: "plumber Lagos",
      niche: "plumbers",
      geoTarget: makeGeoTarget({
        displayName: "Lagos, Nigeria",
        city: "Lagos",
      }),
    });
    const context = makeExpansionContext({ maxNew });

    for (const strategy of allStrategies) {
      const result = await strategy.apply(query, context);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.length).toBeLessThanOrEqual(maxNew);
    }
  });
});
