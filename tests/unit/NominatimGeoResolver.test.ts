/**
 * tests/unit/NominatimGeoResolver.test.ts
 *
 * Unit tests for NominatimGeoResolver.
 * All tests use injected mock fetch -- no live network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NominatimGeoResolver } from "../../src/query-engine/NominatimGeoResolver.js";
import { InMemoryGeoCache } from "../../src/query-engine/IGeoCache.js";
import { QUERY_ENGINE_DEFAULTS } from "../../src/query-engine/config/QueryEngineConfig.js";
import { makeGeoTarget } from "../helpers/builders.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG = QUERY_ENGINE_DEFAULTS.geoResolver;
const NOMINATIM_CFG = { userAgent: "maps-discovery-test/1.0" };

function makeNominatimResponse(lat: string, lon: string, display_name = "Test") {
  return [{ lat, lon, display_name }];
}

function makeSuccessFetch(lat: string, lon: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => makeNominatimResponse(lat, lon),
  });
}

function makeEmptyFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
}

function makeErrorFetch() {
  return vi.fn().mockRejectedValue(new Error("network error"));
}

function makeHttpErrorFetch(status = 500) {
  return vi.fn().mockResolvedValue({ ok: false, status });
}

function makeMalformedFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => { throw new SyntaxError("bad json"); },
  });
}

function makeResolver(fetchFn: typeof fetch) {
  return new NominatimGeoResolver(CONFIG, NOMINATIM_CFG, {
    cache: new InMemoryGeoCache(),
    fetch: fetchFn,
  });
}

// ---------------------------------------------------------------------------
// Priority 1: explicit coordinates
// ---------------------------------------------------------------------------

describe("NominatimGeoResolver -- Priority 1: explicit coordinates", () => {
  it("returns existing coordinates without calling fetch", async () => {
    const fetchFn = makeSuccessFetch("39.55", "-105.78");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const target = makeGeoTarget({ displayName: "Colorado", lat: 39.55, lng: -105.78 });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns the exact coordinates from GeoTarget.coordinates", async () => {
    const resolver = makeResolver(makeEmptyFetch() as unknown as typeof fetch);
    const target = makeGeoTarget({ displayName: "Custom", lat: 10.0, lng: 20.0 });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates).toEqual({ lat: 10.0, lng: 20.0 });
  });
});

// ---------------------------------------------------------------------------
// Priority 2: cache
// ---------------------------------------------------------------------------

describe("NominatimGeoResolver -- Priority 2: cache", () => {
  it("returns cached result on second call without calling fetch again", async () => {
    const fetchFn = makeSuccessFetch("39.55", "-105.78");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const target = makeGeoTarget({ displayName: "Colorado" });

    await resolver.resolve(target);
    await resolver.resolve(target);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("cache key is case-insensitive on displayName", async () => {
    const fetchFn = makeSuccessFetch("39.55", "-105.78");
    const cache = new InMemoryGeoCache();
    const resolver = new NominatimGeoResolver(CONFIG, NOMINATIM_CFG, {
      cache,
      fetch: fetchFn as unknown as typeof fetch,
    });

    await resolver.resolve(makeGeoTarget({ displayName: "Colorado" }));
    await resolver.resolve(makeGeoTarget({ displayName: "COLORADO" }));

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Priority 3: Nominatim happy paths
// ---------------------------------------------------------------------------

describe("NominatimGeoResolver -- Priority 3: Nominatim success", () => {
  it("resolves Colorado to approximate state coordinates", async () => {
    const fetchFn = makeSuccessFetch("39.5500507", "-105.7820674");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "Colorado" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(39.55, 1);
    expect(result.value.resolvedCoordinates.lng).toBeCloseTo(-105.78, 1);
  });

  it("resolves Dubai", async () => {
    const fetchFn = makeSuccessFetch("25.2048493", "55.2707828");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "Dubai" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(25.20, 1);
    expect(result.value.resolvedCoordinates.lng).toBeCloseTo(55.27, 1);
  });

  it("resolves Toronto", async () => {
    const fetchFn = makeSuccessFetch("43.6534817", "-79.3839347");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "Toronto" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(43.65, 1);
  });

  it("resolves Austin, Texas", async () => {
    const fetchFn = makeSuccessFetch("30.2711286", "-97.7436995");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "Austin, Texas" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(30.27, 1);
  });

  it("preserves all original GeoTarget fields in resolved result", async () => {
    const fetchFn = makeSuccessFetch("6.5244", "3.3792");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const target = makeGeoTarget({ displayName: "Lagos, Nigeria", city: "Lagos" });
    const result = await resolver.resolve(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.displayName).toBe("Lagos, Nigeria");
    expect(result.value.city).toBe("Lagos");
  });

  it("includes User-Agent header in request", async () => {
    const fetchFn = makeSuccessFetch("0", "0");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    await resolver.resolve(makeGeoTarget({ displayName: "Test" }));
    const callArgs = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers?.["User-Agent"]).toBe("maps-discovery-test/1.0");
  });

  it("does not include countrycodes param (global by default)", async () => {
    const fetchFn = makeSuccessFetch("0", "0");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    await resolver.resolve(makeGeoTarget({ displayName: "Denver" }));
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain("countrycodes");
  });

  it("sends query string in URL", async () => {
    const fetchFn = makeSuccessFetch("0", "0");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    await resolver.resolve(makeGeoTarget({ displayName: "Ontario" }));
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("q=Ontario");
  });
});

// ---------------------------------------------------------------------------
// Priority 4: fallback to PassthroughGeoResolver
// ---------------------------------------------------------------------------

describe("NominatimGeoResolver -- Priority 4: fallback", () => {
  it("falls back when fetch throws a network error", async () => {
    const resolver = makeResolver(makeErrorFetch() as unknown as typeof fetch);
    // "nigeria" resolves via PassthroughGeoResolver country name lookup
    const result = await resolver.resolve(makeGeoTarget({ displayName: "nigeria", country: "nigeria" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(9.08, 1);
  });

  it("falls back when Nominatim returns empty array", async () => {
    const resolver = makeResolver(makeEmptyFetch() as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "nigeria", country: "nigeria" }));
    expect(result.ok).toBe(true);
  });

  it("falls back when HTTP response is not ok", async () => {
    const resolver = makeResolver(makeHttpErrorFetch() as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "nigeria", country: "nigeria" }));
    expect(result.ok).toBe(true);
  });

  it("falls back when JSON is malformed", async () => {
    const resolver = makeResolver(makeMalformedFetch() as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "nigeria", country: "nigeria" }));
    expect(result.ok).toBe(true);
  });

  it("returns NOT_FOUND via fallback for unknown location", async () => {
    const resolver = makeResolver(makeEmptyFetch() as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "Neverland", country: "XX" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("resolves known ISO code via fallback (NG)", async () => {
    const resolver = makeResolver(makeEmptyFetch() as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "Lagos, Nigeria", country: "NG" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // NG centroid from PassthroughGeoResolver
    expect(result.value.resolvedCoordinates.lat).toBeCloseTo(9.08, 1);
  });

  it("does not cache failed lookups (retries on next call)", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => makeNominatimResponse("39.55", "-105.78") });
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const target = makeGeoTarget({ displayName: "Colorado" });

    // First call: empty -> fallback
    const first = await resolver.resolve(target);
    // Second call: should retry Nominatim (not cached)
    const second = await resolver.resolve(target);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.resolvedCoordinates.lat).toBeCloseTo(39.55, 1);
  });
});

// ---------------------------------------------------------------------------
// Invalid coordinate guards
// ---------------------------------------------------------------------------

describe("NominatimGeoResolver -- invalid coordinate filtering", () => {
  it("falls back when Nominatim returns out-of-range lat", async () => {
    const fetchFn = makeSuccessFetch("999", "0");
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "nigeria", country: "nigeria" }));
    expect(result.ok).toBe(true); // fallback resolved it
  });

  it("falls back when Nominatim returns non-numeric coordinates", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "not-a-number", lon: "also-bad", display_name: "x" }],
    });
    const resolver = makeResolver(fetchFn as unknown as typeof fetch);
    const result = await resolver.resolve(makeGeoTarget({ displayName: "nigeria", country: "nigeria" }));
    expect(result.ok).toBe(true);
  });
});
