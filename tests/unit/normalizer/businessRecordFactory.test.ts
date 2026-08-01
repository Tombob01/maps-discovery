/**
 * tests/unit/normalizer/businessRecordFactory.test.ts
 *
 * Runtime behavioral tests. Covers: BusinessRecordFactory produces the
 * expected BusinessRecord shape, and BusinessNormalizer (delegating to the
 * factory) produces output identical to calling the factory directly for
 * the same candidate data.
 */

import { describe, it, expect } from "vitest";
import { BusinessRecordFactory } from "../../../src/normalizer/BusinessRecordFactory.js";
import { BusinessNormalizer } from "../../../src/normalizer/BusinessNormalizer.js";
import { CandidateComputer } from "../../../src/normalizer/CandidateComputer.js";
import { GoogleMapsProviderMapper } from "../../../src/normalizer/GoogleMapsProviderMapper.js";
import type { NormalizationContext } from "../../../src/core/interfaces/INormalizer.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { RunID, QueryID } from "../../../src/core/types/common.js";
import { isOk } from "../../../src/core/types/common.js";

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

const fullPayload = {
  name: "Ace Plumbers Ltd",
  phone: "+234 801 234 5678",
  website: "https://aceplumbers.ng",
  address: "1 Marina, Lagos Island, Lagos, Nigeria",
  placeId: "ChIJ123",
  listingUrl: "https://maps.google.com/place/123",
  ratingText: "4.5 stars",
  reviewCountText: "123 reviews",
  categoryText: "Plumbing, Home Services",
  coordinates: { lat: 6.5244, lng: 3.3792 },
  hoursRaw: ["Mon-Fri: 09:00-17:00", "Saturday: 10:00-14:00"],
};

describe("BusinessRecordFactory", () => {
  const mapper = new GoogleMapsProviderMapper();
  const computer = new CandidateComputer([mapper]);

  it("creates a BusinessRecord with id derived from fingerprint and default status fields", () => {
    const result = makeProviderResult(fullPayload);
    const candidateResult = computer.compute(result, ctx);
    expect(isOk(candidateResult)).toBe(true);
    if (!isOk(candidateResult)) return;

    const record = BusinessRecordFactory.create(candidateResult.value);

    expect(record.id as string).toBe(candidateResult.value.computedFingerprint as string);
    expect(record.fingerprint as string).toBe(candidateResult.value.computedFingerprint as string);
    expect(record.normalizationStatus).toBe("complete");
    expect(record.deduplicationStatus).toBe("pending");
    expect(record.exportStatus).toBe("pending");
    expect(record.name).toBe("Ace Plumbers Ltd");
  });

  it("does not leak computedFingerprint onto the resulting BusinessRecord", () => {
    const result = makeProviderResult(fullPayload);
    const candidateResult = computer.compute(result, ctx);
    expect(isOk(candidateResult)).toBe(true);
    if (!isOk(candidateResult)) return;

    const record = BusinessRecordFactory.create(candidateResult.value);
    expect("computedFingerprint" in record).toBe(false);
  });
});

describe("BusinessNormalizer delegation parity", () => {
  it("BusinessNormalizer.normalize() output matches BusinessRecordFactory.create() for identical candidate data", async () => {
    const mapper = new GoogleMapsProviderMapper();
    const computer = new CandidateComputer([mapper]);
    const normalizer = new BusinessNormalizer(computer);

    const result = makeProviderResult(fullPayload);
    const candidateResult = computer.compute(result, ctx);
    expect(isOk(candidateResult)).toBe(true);
    if (!isOk(candidateResult)) return;

    const expected = BusinessRecordFactory.create(candidateResult.value);
    const actual = await normalizer.normalize(result, ctx);

    expect(isOk(actual)).toBe(true);
    if (!isOk(actual)) return;

    expect(actual.value).toEqual(expected);
  });
});
