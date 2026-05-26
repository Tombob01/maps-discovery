/**
 * tests/unit/normalizer/normalizer.test.ts
 *
 * Covers: PhoneNormalizer, AddressNormalizer, HoursNormalizer,
 * GoogleMapsProviderMapper, BusinessNormalizer (integration),
 * and fingerprintRecord.
 */

import { describe, it, expect } from "vitest";
import { PhoneNormalizer } from "../../../src/normalizer/PhoneNormalizer.js";
import { AddressNormalizer } from "../../../src/normalizer/AddressNormalizer.js";
import { HoursNormalizer } from "../../../src/normalizer/HoursNormalizer.js";
import { GoogleMapsProviderMapper } from "../../../src/normalizer/GoogleMapsProviderMapper.js";
import { BusinessNormalizer } from "../../../src/normalizer/BusinessNormalizer.js";
import { fingerprintRecord } from "../../../src/normalizer/fingerprint.js";
import type { NormalizationContext } from "../../../src/core/interfaces/INormalizer.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { RunID, QueryID } from "../../../src/core/types/common.js";
import { isOk, isErr } from "../../../src/core/types/common.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const ctx: NormalizationContext = {
  providerId: "google-maps",
  runId: "run-1",
  queryId: "query-1",
  collectedAt: new Date("2024-01-15T10:00:00Z"),
  countryCodeHint: "NG",
};

function makeProviderResult(rawPayload: unknown = {}): ProviderResult {
  return {
    providerId: "google-maps",
    providerResultId: "ChIJ123",
    rawPayload,
    sourceUrl: "https://maps.google.com/place/123",
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-1" as RunID,
    queryId: "query-1" as QueryID,
    resumeToken: {
      strategy: "offset",
      pageRequest: { kind: "offset", page: 1, pageSize: 20 },
      createdAt: Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// PhoneNormalizer
// ---------------------------------------------------------------------------

describe("PhoneNormalizer", () => {
  const normalizer = new PhoneNormalizer();

  it("returns null for null input", () => {
    const r = normalizer.normalize(null, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });

  it("returns null for empty string", () => {
    const r = normalizer.normalize("", ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });

  it("normalises a valid Nigerian number to E.164", () => {
    const r = normalizer.normalize("+234 801 234 5678", ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe("+2348012345678");
  });

  it("normalises a valid international number with + prefix", () => {
    const r = normalizer.normalize("+1 415 555 2671", {
      ...ctx,
      countryCodeHint: "US",
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toMatch(/^\+1/);
  });

  it("returns err for a clearly invalid number", () => {
    const r = normalizer.normalize("not-a-phone", ctx);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.field).toBe("phone");
      expect(["PARSE_FAILED", "INVALID_FORMAT"]).toContain(r.error.code);
    }
  });

  it("handles whitespace-only input as null", () => {
    const r = normalizer.normalize("   ", ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AddressNormalizer
// ---------------------------------------------------------------------------

describe("AddressNormalizer", () => {
  const normalizer = new AddressNormalizer();

  it("normalises a full structured address", () => {
    const r = normalizer.normalize(
      {
        addressRaw: "1 Marina, Lagos Island, Lagos, Nigeria",
        street: "1 Marina",
        city: "Lagos",
        state: "Lagos",
        postalCode: "100001",
        country: "Nigeria",
      },
      ctx,
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.city).toBe("Lagos");
      expect(r.value.countryCode).toBe("NG");
      expect(r.value.raw).toBe("1 Marina, Lagos Island, Lagos, Nigeria");
    }
  });

  it("falls back to assembling raw from parts when addressRaw missing", () => {
    const r = normalizer.normalize({ city: "Accra", country: "Ghana" }, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.raw).toContain("Accra");
      expect(r.value.countryCode).toBe("GH");
    }
  });

  it("returns err when no address data at all", () => {
    const r = normalizer.normalize({}, ctx);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("EMPTY_VALUE");
  });

  it("keeps null for missing individual fields", () => {
    const r = normalizer.normalize(
      { addressRaw: "Somewhere", city: "Lagos" },
      ctx,
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.street).toBeNull();
      expect(r.value.postalCode).toBeNull();
    }
  });

  it("infers countryCode from 2-letter country string", () => {
    const r = normalizer.normalize({ addressRaw: "Test", country: "ZA" }, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.countryCode).toBe("ZA");
  });

  it("trims whitespace from fields", () => {
    const r = normalizer.normalize(
      { addressRaw: "  Lagos  ", city: " Lagos " },
      ctx,
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.raw).toBe("Lagos");
      expect(r.value.city).toBe("Lagos");
    }
  });
});

// ---------------------------------------------------------------------------
// HoursNormalizer
// ---------------------------------------------------------------------------

describe("HoursNormalizer", () => {
  const normalizer = new HoursNormalizer();

  it("returns null for null input", () => {
    const r = normalizer.normalize(null, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });

  it("returns null for empty array", () => {
    const r = normalizer.normalize([], ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });

  it("parses a simple Mon-Fri range", () => {
    const r = normalizer.normalize(["Mon-Fri: 09:00-17:00"], ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value) {
      expect(r.value.parsed).not.toBeNull();
      expect(r.value.parsed).toHaveLength(5); // Mon, Tue, Wed, Thu, Fri
      const mon = r.value.parsed!.find((d) => d.day === "monday");
      expect(mon?.open).toBe("09:00");
      expect(mon?.close).toBe("17:00");
      expect(mon?.isClosed).toBe(false);
    }
  });

  it("parses a closed day", () => {
    const r = normalizer.normalize(["Sunday: Closed"], ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value?.parsed) {
      const sun = r.value.parsed.find((d) => d.day === "sunday");
      expect(sun?.isClosed).toBe(true);
      expect(sun?.open).toBeNull();
      expect(sun?.close).toBeNull();
    }
  });

  it("parses a single day", () => {
    const r = normalizer.normalize(["Saturday: 10:00-14:00"], ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value?.parsed) {
      expect(r.value.parsed).toHaveLength(1);
      expect(r.value.parsed[0]?.day).toBe("saturday");
    }
  });

  it("preserves the raw strings", () => {
    const raw = Object.freeze(["Mon-Fri: 09:00-17:00", "Saturday: Closed"]);
    const r = normalizer.normalize(raw, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value) {
      expect(r.value.raw).toBe(raw);
    }
  });

  it("returns parsed=null for unparseable lines", () => {
    const r = normalizer.normalize(["gibberish hours data"], ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value) {
      // raw preserved, parsed null when nothing could be parsed
      expect(r.value.raw).toHaveLength(1);
      expect(r.value.parsed).toBeNull();
    }
  });

  it("parses multiple days from multi-line input", () => {
    const r = normalizer.normalize(
      ["Monday: 08:00-18:00", "Tuesday: 08:00-18:00", "Sunday: Closed"],
      ctx,
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r) && r.value?.parsed) {
      expect(r.value.parsed).toHaveLength(3);
    }
  });
});

// ---------------------------------------------------------------------------
// GoogleMapsProviderMapper
// ---------------------------------------------------------------------------

describe("GoogleMapsProviderMapper", () => {
  const mapper = new GoogleMapsProviderMapper();

  it("providerId is 'google-maps'", () => {
    expect(mapper.providerId).toBe("google-maps");
  });

  it("extracts fields from a full payload", () => {
    const r = mapper.extractFields({
      name: "Ace Plumbers",
      phone: "+234 801 234 5678",
      address: "1 Marina, Lagos",
      city: "Lagos",
      country: "Nigeria",
      lat: 6.5244,
      lng: 3.3792,
      rating: 4.5,
      reviewCount: 123,
      priceLevel: 2,
      categories: ["plumbing"],
      hours: ["Mon-Fri: 09:00-17:00"],
      placeId: "ChIJ123",
      url: "https://maps.google.com/place/123",
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.name).toBe("Ace Plumbers");
      expect(r.value.lat).toBe(6.5244);
      expect(r.value.categories).toEqual(["plumbing"]);
      expect(r.value.externalIds?.googlePlaceId).toBe("ChIJ123");
    }
  });

  it("returns err for non-object payload", () => {
    const r = mapper.extractFields("a string");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("INVALID_PAYLOAD_SHAPE");
  });

  it("returns err when name is missing", () => {
    const r = mapper.extractFields({ rating: 4.5 });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("MISSING_REQUIRED_KEY");
  });

  it("handles minimal payload (name only)", () => {
    const r = mapper.extractFields({ name: "Minimal Biz" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.name).toBe("Minimal Biz");
      expect(r.value.phone).toBeUndefined();
      expect(r.value.lat).toBeUndefined();
    }
  });

  it("omits externalIds when no placeId", () => {
    const r = mapper.extractFields({ name: "Biz" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.externalIds).toBeUndefined();
  });

  it("returns err for null payload", () => {
    const r = mapper.extractFields(null);
    expect(isErr(r)).toBe(true);
  });

  it("returns err for array payload", () => {
    const r = mapper.extractFields([{ name: "Biz" }]);
    expect(isErr(r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fingerprintRecord
// ---------------------------------------------------------------------------

describe("fingerprintRecord", () => {
  function makePartial(overrides = {}) {
    return {
      externalIds: {},
      name: "Ace Plumbers",
      normalizedName: "ace plumbers",
      address: {
        raw: "Lagos",
        street: null,
        city: "Lagos",
        state: null,
        postalCode: null,
        country: "Nigeria",
        countryCode: "NG",
      },
      geo: null,
      phone: null,
      normalizedPhone: null,
      website: null,
      categories: Object.freeze([]),
      primaryCategory: null,
      rating: null,
      reviewCount: null,
      hours: null,
      priceLevel: null,
      sourceProvider: "google-maps",
      sourceUrl: null,
      collectedAt: new Date(),
      runId: "run-1" as RunID,
      queryId: "query-1" as QueryID,
      normalizationStatus: "complete" as const,
      deduplicationStatus: "pending" as const,
      exportStatus: "pending" as const,
      ...overrides,
    };
  }

  it("returns a non-empty string", () => {
    const fp = fingerprintRecord(makePartial());
    expect(typeof fp).toBe("string");
    expect(fp.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same input", () => {
    const a = fingerprintRecord(makePartial());
    const b = fingerprintRecord(makePartial());
    expect(a).toBe(b);
  });

  it("differs when name changes", () => {
    const a = fingerprintRecord(
      makePartial({ normalizedName: "ace plumbers" }),
    );
    const b = fingerprintRecord(
      makePartial({ normalizedName: "best electricians" }),
    );
    expect(a).not.toBe(b);
  });

  it("differs when city changes", () => {
    const a = fingerprintRecord(makePartial());
    const b = fingerprintRecord(
      makePartial({
        address: {
          raw: "Abuja",
          street: null,
          city: "Abuja",
          state: null,
          postalCode: null,
          country: "Nigeria",
          countryCode: "NG",
        },
      }),
    );
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// BusinessNormalizer — integration
// ---------------------------------------------------------------------------

describe("BusinessNormalizer — integration", () => {
  const mapper = new GoogleMapsProviderMapper();
  const normalizer = new BusinessNormalizer([mapper]);

  const fullPayload = {
    name: "Ace Plumbers Ltd",
    phone: "+234 801 234 5678",
    website: "https://aceplumbers.ng",
    address: "1 Marina, Lagos Island, Lagos, Nigeria",
    street: "1 Marina",
    city: "Lagos",
    state: "Lagos",
    country: "Nigeria",
    lat: 6.5244,
    lng: 3.3792,
    rating: 4.5,
    reviewCount: 123,
    priceLevel: 2,
    categories: ["plumbing", "home-services"],
    hours: ["Mon-Fri: 09:00-17:00", "Saturday: 10:00-14:00"],
    placeId: "ChIJ123",
    url: "https://maps.google.com/place/123",
  };

  it("normalises a full provider result into a BusinessRecord", async () => {
    const result = makeProviderResult(fullPayload);
    const r = await normalizer.normalize(result, ctx);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const rec = r.value;
    expect(rec.name).toBe("Ace Plumbers Ltd");
    expect(rec.normalizedName).toBe("ace plumbers ltd");
    expect(rec.normalizedPhone).toBe("+2348012345678");
    expect(rec.address.city).toBe("Lagos");
    expect(rec.geo).toEqual({ lat: 6.5244, lng: 3.3792 });
    expect(rec.rating).toBe(4.5);
    expect(rec.reviewCount).toBe(123);
    expect(rec.priceLevel).toBe(2);
    expect(rec.categories).toEqual(["plumbing", "home-services"]);
    expect(rec.primaryCategory).toBe("plumbing");
    expect(rec.hours?.parsed).not.toBeNull();
    expect(rec.normalizationStatus).toBe("complete");
    expect(rec.deduplicationStatus).toBe("pending");
    expect(rec.exportStatus).toBe("pending");
    expect(rec.sourceProvider).toBe("google-maps");
    expect(typeof rec.fingerprint).toBe("string");
  });

  it("returns err for unknown provider", async () => {
    const result = {
      ...makeProviderResult(fullPayload),
      providerId: "unknown-provider",
    };
    const r = await normalizer.normalize(result, ctx);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("INVALID_PROVIDER");
  });

  it("returns err when mapper fails (bad payload shape)", async () => {
    const result = makeProviderResult("not an object");
    const r = await normalizer.normalize(result, ctx);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("MAPPING_FAILED");
  });

  it("returns err when name is missing", async () => {
    const result = makeProviderResult({ rating: 4.5 });
    const r = await normalizer.normalize(result, ctx);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("MAPPING_FAILED");
  });

  it("degrades gracefully when phone is invalid (phone=null in record)", async () => {
    const result = makeProviderResult({ ...fullPayload, phone: "not-a-phone" });
    const r = await normalizer.normalize(result, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.normalizedPhone).toBeNull();
      expect(r.value.phone).toBe("not-a-phone"); // raw preserved
      expect(r.value.normalizationStatus).toBe("complete");
    }
  });

  it("handles missing optional fields (geo=null, hours=null)", async () => {
    const minimal = { name: "Minimal Biz" };
    const result = makeProviderResult(minimal);
    const r = await normalizer.normalize(result, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.geo).toBeNull();
      expect(r.value.hours).toBeNull();
      expect(r.value.phone).toBeNull();
      expect(r.value.normalizedPhone).toBeNull();
    }
  });

  it("ignores priceLevel outside 1-4 range", async () => {
    const result = makeProviderResult({ ...fullPayload, priceLevel: 7 });
    const r = await normalizer.normalize(result, ctx);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.priceLevel).toBeNull();
  });

  it("produces the same fingerprint for identical inputs", async () => {
    const result = makeProviderResult(fullPayload);
    const r1 = await normalizer.normalize(result, ctx);
    const r2 = await normalizer.normalize(result, ctx);
    expect(isOk(r1) && isOk(r2)).toBe(true);
    if (isOk(r1) && isOk(r2)) {
      expect(r1.value.fingerprint).toBe(r2.value.fingerprint);
    }
  });

  it("produces different fingerprints for different businesses", async () => {
    const r1 = await normalizer.normalize(makeProviderResult(fullPayload), ctx);
    const r2 = await normalizer.normalize(
      makeProviderResult({
        ...fullPayload,
        name: "Best Electricians",
        city: "Abuja",
      }),
      ctx,
    );
    expect(isOk(r1) && isOk(r2)).toBe(true);
    if (isOk(r1) && isOk(r2)) {
      expect(r1.value.fingerprint).not.toBe(r2.value.fingerprint);
    }
  });
});
