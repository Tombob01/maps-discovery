/**
 * Dictionary index implementations test suite.
 * Covers: NicheDictionaryIndex and GeoDictionaryIndex in-memory implementations,
 * lookup semantics, edge cases (zero terms, whitespace-only synonyms,
 * duplicate modifiers, zero sub-locations), and multi-dictionary disambiguation.
 *
 * No filesystem access — all data constructed in-memory via builders.
 */

import { describe, it, expect } from "vitest";

import {
  makeNicheDictionary,
  makeNicheDictionaryIndex,
  makeNicheTerm,
  makeGeoDictionary,
  makeGeoDictionaryIndex,
  makeGeoRegion,
  makeGeoSubLocation,
} from "../helpers/builders.js";

// ---------------------------------------------------------------------------
// NicheDictionaryIndex
// ---------------------------------------------------------------------------

describe("NicheDictionaryIndex — get()", () => {
  it("returns the correct dictionary for an exact niche match", () => {
    const dict = makeNicheDictionary({ niche: "plumbers" });
    const index = makeNicheDictionaryIndex([dict]);
    expect(index.get("plumbers")).toBe(dict);
  });

  it("is case-insensitive", () => {
    const dict = makeNicheDictionary({ niche: "plumbers" });
    const index = makeNicheDictionaryIndex([dict]);
    expect(index.get("PLUMBERS")).toBe(dict);
    expect(index.get("Plumbers")).toBe(dict);
    expect(index.get("PLUMBERS")).toBeDefined();
  });

  it("trims surrounding whitespace in the lookup key", () => {
    const dict = makeNicheDictionary({ niche: "plumbers" });
    const index = makeNicheDictionaryIndex([dict]);
    expect(index.get("  plumbers  ")).toBe(dict);
  });

  it("returns undefined for unknown niche", () => {
    const index = makeNicheDictionaryIndex([makeNicheDictionary()]);
    expect(index.get("dentists")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const index = makeNicheDictionaryIndex([makeNicheDictionary()]);
    expect(index.get("")).toBeUndefined();
  });

  it("returns correct dictionary from a multi-niche index", () => {
    const plumbers = makeNicheDictionary({ niche: "plumbers" });
    const electricians = makeNicheDictionary({ niche: "electricians" });
    const index = makeNicheDictionaryIndex([plumbers, electricians]);
    expect(index.get("plumbers")).toBe(plumbers);
    expect(index.get("electricians")).toBe(electricians);
  });

  it("last registered dictionary wins on niche collision", () => {
    const first = makeNicheDictionary({ niche: "plumbers" });
    const second = makeNicheDictionary({ niche: "plumbers" });
    const index = makeNicheDictionaryIndex([first, second]);
    expect(index.get("plumbers")).toBe(second);
  });
});

describe("NicheDictionaryIndex — allNiches()", () => {
  it("returns empty array for empty index", () => {
    const index = makeNicheDictionaryIndex([]);
    expect(index.allNiches()).toHaveLength(0);
  });

  it("returns all loaded niche names", () => {
    const index = makeNicheDictionaryIndex([
      makeNicheDictionary({ niche: "plumbers" }),
      makeNicheDictionary({ niche: "electricians" }),
      makeNicheDictionary({ niche: "carpenters" }),
    ]);
    const niches = index.allNiches();
    expect(niches).toContain("plumbers");
    expect(niches).toContain("electricians");
    expect(niches).toContain("carpenters");
    expect(niches).toHaveLength(3);
  });

  it("niche names are lowercased in the index", () => {
    const index = makeNicheDictionaryIndex([
      makeNicheDictionary({ niche: "Plumbers" }),
    ]);
    expect(index.allNiches()[0]).toBe("plumbers");
  });
});

describe("NicheDictionaryIndex — size", () => {
  it("size = 0 for empty index", () => {
    expect(makeNicheDictionaryIndex([]).size).toBe(0);
  });

  it("size matches number of unique niches loaded", () => {
    const index = makeNicheDictionaryIndex([
      makeNicheDictionary({ niche: "plumbers" }),
      makeNicheDictionary({ niche: "electricians" }),
    ]);
    expect(index.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// NicheDictionary edge cases
// ---------------------------------------------------------------------------

describe("NicheDictionary — edge cases", () => {
  it("zero-term dictionary is valid and returns no synonyms/modifiers", () => {
    const dict = makeNicheDictionary({ niche: "empty-niche", terms: [] });
    const index = makeNicheDictionaryIndex([dict]);
    expect(index.get("empty-niche")).toBeDefined();
    expect(index.get("empty-niche")!.terms).toHaveLength(0);
  });

  it("term with no synonyms has empty synonyms array", () => {
    const term = makeNicheTerm({ term: "plumber", synonyms: [] });
    expect(term.synonyms).toHaveLength(0);
  });

  it("term with no modifiers has empty modifiers array", () => {
    const term = makeNicheTerm({ term: "plumber", modifiers: [] });
    expect(term.modifiers).toHaveLength(0);
  });

  it("term without plural/singular has those fields undefined", () => {
    const term = makeNicheTerm({ term: "services" });
    expect(term.plural).toBeUndefined();
    expect(term.singular).toBeUndefined();
  });

  it("term with plural but no singular is valid", () => {
    const term = makeNicheTerm({ term: "plumber", plural: "plumbers" });
    expect(term.plural).toBe("plumbers");
    expect(term.singular).toBeUndefined();
  });

  it("terms with duplicate modifiers are preserved as-is in the model", () => {
    // The dedup of modifiers is the strategy's responsibility, not the model's
    const term = makeNicheTerm({
      modifiers: ["emergency", "emergency", "local"],
    });
    expect(term.modifiers).toHaveLength(3);
  });

  it("multi-term dictionary preserves all terms", () => {
    const dict = makeNicheDictionary({
      niche: "plumbers",
      terms: [
        makeNicheTerm({ term: "plumber" }),
        makeNicheTerm({ term: "plumbing services" }),
        makeNicheTerm({ term: "drain cleaning" }),
      ],
    });
    expect(dict.terms).toHaveLength(3);
    expect(
      dict.terms.map(
        (
          t: import("../../src/query-engine/dictionaries/NicheDictionary.js").NicheTerm,
        ) => t.term,
      ),
    ).toContain("drain cleaning");
  });
});

// ---------------------------------------------------------------------------
// GeoDictionaryIndex — getByCountryCode()
// ---------------------------------------------------------------------------

describe("GeoDictionaryIndex — getByCountryCode()", () => {
  it("returns the correct dictionary for NG", () => {
    const dict = makeGeoDictionary({ countryCode: "NG" });
    const index = makeGeoDictionaryIndex([dict]);
    expect(index.getByCountryCode("NG")).toBe(dict);
  });

  it("is case-insensitive (ng → NG)", () => {
    const dict = makeGeoDictionary({ countryCode: "NG" });
    const index = makeGeoDictionaryIndex([dict]);
    expect(index.getByCountryCode("ng")).toBe(dict);
  });

  it("trims whitespace", () => {
    const dict = makeGeoDictionary({ countryCode: "NG" });
    const index = makeGeoDictionaryIndex([dict]);
    expect(index.getByCountryCode("  NG  ")).toBe(dict);
  });

  it("returns undefined for unknown code", () => {
    const index = makeGeoDictionaryIndex([makeGeoDictionary()]);
    expect(index.getByCountryCode("ZZ")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const index = makeGeoDictionaryIndex([makeGeoDictionary()]);
    expect(index.getByCountryCode("")).toBeUndefined();
  });
});

describe("GeoDictionaryIndex — getByCountryName()", () => {
  it("returns correct dictionary for 'Nigeria'", () => {
    const dict = makeGeoDictionary({ country: "Nigeria" });
    const index = makeGeoDictionaryIndex([dict]);
    expect(index.getByCountryName("Nigeria")).toBe(dict);
  });

  it("is case-insensitive", () => {
    const dict = makeGeoDictionary({ country: "Nigeria" });
    const index = makeGeoDictionaryIndex([dict]);
    expect(index.getByCountryName("NIGERIA")).toBe(dict);
    expect(index.getByCountryName("nigeria")).toBe(dict);
  });

  it("returns undefined for unknown country name", () => {
    const index = makeGeoDictionaryIndex([makeGeoDictionary()]);
    expect(index.getByCountryName("Atlantis")).toBeUndefined();
  });
});

describe("GeoDictionaryIndex — getSubLocations()", () => {
  it("returns sub-locations for a known region name", () => {
    const region = makeGeoRegion({
      name: "Lagos",
      subLocations: [
        makeGeoSubLocation("Victoria Island", ["VI"]),
        makeGeoSubLocation("Lekki"),
        makeGeoSubLocation("Ikeja"),
      ],
    });
    const index = makeGeoDictionaryIndex([
      makeGeoDictionary({ regions: [region] }),
    ]);
    const subs = index.getSubLocations("Lagos");
    expect(subs).toHaveLength(3);
    expect(
      subs.map(
        (
          s: import("../../src/query-engine/dictionaries/GeoDictionary.js").GeoSubLocation,
        ) => s.name,
      ),
    ).toContain("Victoria Island");
  });

  it("is case-insensitive for region lookup", () => {
    const region = makeGeoRegion({ name: "Lagos" });
    const index = makeGeoDictionaryIndex([
      makeGeoDictionary({ regions: [region] }),
    ]);
    expect(index.getSubLocations("LAGOS").length).toBeGreaterThan(0);
    expect(index.getSubLocations("lagos").length).toBeGreaterThan(0);
  });

  it("returns empty array for unknown region", () => {
    const index = makeGeoDictionaryIndex([makeGeoDictionary()]);
    expect(index.getSubLocations("UnknownCity")).toHaveLength(0);
  });

  it("returns empty array when region has no sub-locations", () => {
    const region = makeGeoRegion({ name: "EmptyRegion", subLocations: [] });
    const index = makeGeoDictionaryIndex([
      makeGeoDictionary({ regions: [region] }),
    ]);
    expect(index.getSubLocations("EmptyRegion")).toHaveLength(0);
  });

  it("searches across multiple country dictionaries", () => {
    const ngRegion = makeGeoRegion({
      name: "Lagos",
      subLocations: [makeGeoSubLocation("VI")],
    });
    const ghRegion = makeGeoRegion({
      name: "Accra",
      subLocations: [makeGeoSubLocation("Osu")],
    });
    const ngDict = makeGeoDictionary({
      countryCode: "NG",
      regions: [ngRegion],
    });
    const ghDict = makeGeoDictionary({
      countryCode: "GH",
      country: "Ghana",
      regions: [ghRegion],
    });
    const index = makeGeoDictionaryIndex([ngDict, ghDict]);

    const lagosSubs = index.getSubLocations("Lagos");
    const accraSubs = index.getSubLocations("Accra");
    expect(
      lagosSubs.map(
        (
          s: import("../../src/query-engine/dictionaries/GeoDictionary.js").GeoSubLocation,
        ) => s.name,
      ),
    ).toContain("VI");
    expect(
      accraSubs.map(
        (
          s: import("../../src/query-engine/dictionaries/GeoDictionary.js").GeoSubLocation,
        ) => s.name,
      ),
    ).toContain("Osu");
  });

  it("returns subs from all matching regions when two dicts have same region name", () => {
    // Edge case: two country dicts both have a region named "Capital"
    const r1 = makeGeoRegion({
      name: "Capital",
      subLocations: [makeGeoSubLocation("District A")],
    });
    const r2 = makeGeoRegion({
      name: "Capital",
      subLocations: [makeGeoSubLocation("District B")],
    });
    const d1 = makeGeoDictionary({ countryCode: "AA", regions: [r1] });
    const d2 = makeGeoDictionary({
      countryCode: "BB",
      country: "Bountiful",
      regions: [r2],
    });
    const index = makeGeoDictionaryIndex([d1, d2]);
    const subs = index.getSubLocations("Capital");
    expect(subs).toHaveLength(2);
    expect(
      subs.map(
        (
          s: import("../../src/query-engine/dictionaries/GeoDictionary.js").GeoSubLocation,
        ) => s.name,
      ),
    ).toContain("District A");
    expect(
      subs.map(
        (
          s: import("../../src/query-engine/dictionaries/GeoDictionary.js").GeoSubLocation,
        ) => s.name,
      ),
    ).toContain("District B");
  });
});

describe("GeoDictionaryIndex — size", () => {
  it("size = 0 for empty index", () => {
    expect(makeGeoDictionaryIndex([]).size).toBe(0);
  });

  it("size matches number of country dictionaries", () => {
    const index = makeGeoDictionaryIndex([
      makeGeoDictionary({ countryCode: "NG" }),
      makeGeoDictionary({ countryCode: "GH", country: "Ghana" }),
      makeGeoDictionary({ countryCode: "KE", country: "Kenya" }),
    ]);
    expect(index.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// GeoSubLocation — aliases
// ---------------------------------------------------------------------------

describe("GeoSubLocation — aliases", () => {
  it("sub-location with aliases preserves them", () => {
    const sub = makeGeoSubLocation("Victoria Island", ["VI", "V.I."]);
    expect(sub.aliases).toHaveLength(2);
    expect(sub.aliases).toContain("VI");
    expect(sub.aliases).toContain("V.I.");
  });

  it("sub-location without aliases has empty array", () => {
    const sub = makeGeoSubLocation("Ikeja");
    expect(sub.aliases).toHaveLength(0);
  });
});
