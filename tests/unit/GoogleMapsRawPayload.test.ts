/**
 * GoogleMapsRawPayload.test.ts
 * Verifies the payload type contract — all fields optional, typed correctly.
 */

import { describe, it, expect } from "vitest";

import { makeSamplePayload } from "./providers/google-maps/mocks.js";

import type { GoogleMapsRawPayload } from "../../src/providers/google-maps/GoogleMapsRawPayload.js";

describe("GoogleMapsRawPayload", () => {
  it("accepts a fully populated payload", () => {
    const payload = makeSamplePayload();
    expect(payload.name).toBe("Ace Plumbers Ltd");
    expect(payload.placeId).toBe("ChIJtest123");
    expect(payload.phone).toBe("+2348012345678");
    expect(payload.detailPanelScraped).toBe(true);
  });

  it("accepts a completely empty payload (all fields optional)", () => {
    const empty: GoogleMapsRawPayload = {};
    expect(empty.name).toBeUndefined();
    expect(empty.placeId).toBeUndefined();
    expect(empty.address).toBeUndefined();
  });

  it("accepts a minimal payload with only searchQuery", () => {
    const minimal: GoogleMapsRawPayload = { searchQuery: "plumbers Lagos" };
    expect(minimal.searchQuery).toBe("plumbers Lagos");
    expect(minimal.name).toBeUndefined();
  });

  it("coordinates field accepts lat/lng object", () => {
    const payload = makeSamplePayload({
      coordinates: { lat: 6.5244, lng: 3.3792 },
    });
    expect(payload.coordinates?.lat).toBeCloseTo(6.5244, 4);
    expect(payload.coordinates?.lng).toBeCloseTo(3.3792, 4);
  });

  it("hoursRaw accepts an array of strings", () => {
    const payload = makeSamplePayload({
      hoursRaw: ["Monday: 8:00 AM – 6:00 PM", "Tuesday: 8:00 AM – 6:00 PM"],
    });
    expect(payload.hoursRaw).toHaveLength(2);
    expect(payload.hoursRaw?.[0]).toContain("Monday");
  });

  it("resultPosition is a number", () => {
    const payload = makeSamplePayload({ resultPosition: 7 });
    expect(payload.resultPosition).toBe(7);
  });

  it("detailPanelScraped accepts false", () => {
    const payload = makeSamplePayload({ detailPanelScraped: false });
    expect(payload.detailPanelScraped).toBe(false);
  });

  it("listingUrl preserves the full URL string", () => {
    const url =
      "https://www.google.com/maps/place/Business/@6.52,3.38,17z/data=!1sChIJabc";
    const payload = makeSamplePayload({ listingUrl: url });
    expect(payload.listingUrl).toBe(url);
  });

  it("ratingText is a raw string (not a number)", () => {
    const payload = makeSamplePayload({ ratingText: "4.5 stars" });
    expect(typeof payload.ratingText).toBe("string");
    expect(payload.ratingText).toContain("4.5");
  });

  it("reviewCountText is a raw string (not a number)", () => {
    const payload = makeSamplePayload({ reviewCountText: "1,234 reviews" });
    expect(typeof payload.reviewCountText).toBe("string");
    expect(payload.reviewCountText).toContain("1,234");
  });
});
