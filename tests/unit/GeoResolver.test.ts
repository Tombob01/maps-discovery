/**
 * GeoResolver test suite.
 * Covers: PassthroughGeoResolver priority chain, coordinate validation,
 * StaticCoordinateGeoResolver lookup and fallback, country name/code matching.
 */

import { describe, it, expect } from "vitest";

import { QUERY_ENGINE_DEFAULTS } from "../../src/query-engine/config/QueryEngineConfig.js";
import {
  PassthroughGeoResolver,
  StaticCoordinateGeoResolver,
} from "../../src/query-engine/GeoResolver.js";
import { makeGeoTarget, LAGOS_GEO, UNKNOWN_GEO } from "../helpers/builders.js";

const defaultConfig = QUERY_ENGINE_DEFAULTS.geoResolver;

// ---------------------------------------------------------------------------
// PassthroughGeoResolver
// ---------------------------------------------------------------------------

describe("PassthroughGeoResolver", () => {
  const resolver = new PassthroughGeoResolver(defaultConfig);

  it("returns existing coordinates when GeoTarget.coordinates is set", async () => {
    const target = makeGeoTarget({
      displayName: "Lagos, Nigeria",
      lat: 6.5244,
      lng: 3.3792,
    });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates).toEqual({
      lat: 6.5244,
      lng: 3.3792,
    });
  });

  it("builds ResolvedGeoTarget with all original fields preserved", async () => {
    const target = makeGeoTarget({
      displayName: "Lagos, Nigeria",
      lat: 6.5244,
      lng: 3.3792,
      city: "Lagos",
    });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.displayName).toBe("Lagos, Nigeria");
    expect(result.value.city).toBe("Lagos");
  });

  it("falls back to country centroid by ISO code NG", async () => {
    const target = makeGeoTarget({
      displayName: "Lagos, Nigeria",
      country: "NG",
    });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(9.08, 1);
    expect(result.value.resolvedCoordinates.lng).toBeCloseTo(8.67, 1);
  });

  it("falls back by country name 'nigeria' (case-insensitive)", async () => {
    const target = makeGeoTarget({ displayName: "Lagos", country: "Nigeria" });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates).toBeDefined();
  });

  it("falls back by country name alias 'uk'", async () => {
    const target = makeGeoTarget({ displayName: "London", country: "uk" });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(55.37, 1);
  });

  it("returns Err(NOT_FOUND) for unknown country", async () => {
    const result = await resolver.resolve(UNKNOWN_GEO);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns Err(INVALID_INPUT) for out-of-range lat when validateExistingCoordinates=true", async () => {
    const target = makeGeoTarget({ displayName: "Nowhere", lat: 999, lng: 0 });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("returns Err(INVALID_INPUT) for out-of-range lng", async () => {
    const target = makeGeoTarget({ displayName: "Nowhere", lat: 0, lng: 999 });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("accepts valid edge-case coordinates (lat=90, lng=180)", async () => {
    const target = makeGeoTarget({
      displayName: "North Pole",
      lat: 90,
      lng: 180,
    });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates).toEqual({ lat: 90, lng: 180 });
  });

  it("accepts valid edge-case coordinates (lat=-90, lng=-180)", async () => {
    const target = makeGeoTarget({
      displayName: "South Pole",
      lat: -90,
      lng: -180,
    });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates).toEqual({ lat: -90, lng: -180 });
  });

  it("skips coordinate validation when validateExistingCoordinates=false", async () => {
    const resolver = new PassthroughGeoResolver({
      validateExistingCoordinates: false,
    });
    const target = makeGeoTarget({ displayName: "Nowhere", lat: 999, lng: 0 });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
  });

  it.each(["US", "GB", "KE", "GH", "ZA", "IN", "AU", "DE", "FR", "SG"])(
    "resolves known country code %s",
    async (code) => {
      const target = makeGeoTarget({
        displayName: `City, ${code}`,
        country: code,
      });
      const result = await resolver.resolve(target);
      expect(result.ok).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// StaticCoordinateGeoResolver
// ---------------------------------------------------------------------------

describe("StaticCoordinateGeoResolver", () => {
  const coords = {
    "Lagos, Nigeria": { lat: 6.5244, lng: 3.3792 },
    "Accra, Ghana": { lat: 5.6037, lng: -0.187 },
    "Nairobi, Kenya": { lat: -1.2921, lng: 36.8219 },
  };
  const resolver = new StaticCoordinateGeoResolver(coords, defaultConfig);

  it("returns static coords for a known displayName (exact match)", async () => {
    const target = makeGeoTarget({ displayName: "Lagos, Nigeria" });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates).toEqual({
      lat: 6.5244,
      lng: 3.3792,
    });
  });

  it("matches case-insensitively", async () => {
    const target = makeGeoTarget({ displayName: "LAGOS, NIGERIA" });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(6.52, 1);
  });

  it("resolves by city name when displayName doesn't match but city does", async () => {
    const resolver = new StaticCoordinateGeoResolver(
      { lagos: { lat: 6.5244, lng: 3.3792 } },
      defaultConfig,
    );
    const target = makeGeoTarget({
      displayName: "Lagos, Nigeria",
      city: "Lagos",
    });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(6.52, 1);
  });

  it("falls back to PassthroughGeoResolver for unknown display names", async () => {
    const target = makeGeoTarget({
      displayName: "Unknown City",
      country: "NG",
    });
    const result = await resolver.resolve(target);
    // PassthroughGeoResolver can resolve NG → centroid
    expect(result.ok).toBe(true);
  });

  it("returns Err for unknown city with no passthrough match", async () => {
    const target = makeGeoTarget({
      displayName: "Atlantis Prime",
      country: "XX",
    });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(false);
  });

  it("returns Err for invalid static coordinates", async () => {
    const resolver = new StaticCoordinateGeoResolver(
      { "bad city": { lat: 999, lng: 0 } },
      defaultConfig,
    );
    const target = makeGeoTarget({ displayName: "bad city" });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("resolves all three known cities correctly", async () => {
    for (const [name, expected] of Object.entries(coords)) {
      const target = makeGeoTarget({ displayName: name });
      const result = await resolver.resolve(target);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.resolvedCoordinates.lat).toBeCloseTo(expected.lat, 3);
      expect(result.value.resolvedCoordinates.lng).toBeCloseTo(expected.lng, 3);
    }
  });
});
