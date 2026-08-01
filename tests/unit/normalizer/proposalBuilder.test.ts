/**
 * tests/unit/normalizer/proposalBuilder.test.ts
 *
 * Runtime behavioral tests only. Covers: ProposalBuilder produces the
 * expected IdentityProposal, correctly reuses the shared CandidateComputer,
 * and shares dependency wiring with BusinessNormalizer without duplication.
 *
 * Compile-time structural-separation checks live separately in
 * identityProposal.typecheck.test.ts.
 */

import { describe, it, expect } from "vitest";
import { ProposalBuilder } from "../../../src/normalizer/ProposalBuilder.js";
import { BusinessNormalizer } from "../../../src/normalizer/BusinessNormalizer.js";
import { CandidateComputer } from "../../../src/normalizer/CandidateComputer.js";
import { GoogleMapsProviderMapper } from "../../../src/normalizer/GoogleMapsProviderMapper.js";
import type { NormalizationContext } from "../../../src/core/interfaces/INormalizer.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";
import { isOk } from "../../../src/core/types/common.js";

const ctx: NormalizationContext = {
  providerId: "google-maps",
  runId: "run-1",
  queryId: "query-1",
  collectedAt: new Date("2024-01-15T10:00:00Z"),
  countryCodeHint: "NG",
};

const rawResultId = "11111111-1111-1111-1111-111111111111" as UUID;

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

describe("ProposalBuilder", () => {
  const mapper = new GoogleMapsProviderMapper();
  const builder = new ProposalBuilder([mapper]);

  it("produces an IdentityProposal from a full provider result", () => {
    const result = makeProviderResult(fullPayload);
    const r = builder.build(result, ctx, rawResultId);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const proposal = r.value;
    expect(proposal.name).toBe("Ace Plumbers Ltd");
    expect(proposal.normalizedName).toBe("ace plumbers ltd");
    expect(proposal.normalizedPhone).toBe("+2348012345678");
    expect(proposal.address.raw).toBe("1 Marina, Lagos Island, Lagos, Nigeria");
    expect(proposal.geo).toEqual({ lat: 6.5244, lng: 3.3792 });
    expect(proposal.categories).toEqual(["Plumbing", "Home Services"]);
    expect(proposal.primaryCategory).toBe("Plumbing");
    expect(typeof proposal.candidateFingerprint).toBe("string");
    expect((proposal.candidateFingerprint as string).length).toBeGreaterThan(0);
  });

  it("does not include authoritative-only fields", () => {
    const result = makeProviderResult(fullPayload);
    const r = builder.build(result, ctx, rawResultId);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect("id" in r.value).toBe(false);
    expect("fingerprint" in r.value).toBe(false);
    expect("normalizationStatus" in r.value).toBe(false);
    expect("deduplicationStatus" in r.value).toBe(false);
    expect("exportStatus" in r.value).toBe(false);
  });

  it("returns err when name is missing (same validation as BusinessNormalizer)", () => {
    const result = makeProviderResult({ rating: 4.5 });
    const r = builder.build(result, ctx, rawResultId);
    expect(isOk(r)).toBe(false);
  });
});

describe("Shared CandidateComputer — no duplicated wiring", () => {
  it("BusinessNormalizer and ProposalBuilder can share one CandidateComputer instance", async () => {
    const mapper = new GoogleMapsProviderMapper();
    const computer = new CandidateComputer([mapper]);

    // Both consume the exact same computer instance — no separate mapper
    // map or sub-normalizer instances are constructed per class.
    const normalizer = new BusinessNormalizer(computer);
    const builder = new ProposalBuilder(computer);

    const result = makeProviderResult(fullPayload);
    const proposalResult = builder.build(result, ctx, rawResultId);
    const recordResult = await normalizer.normalize(result, ctx);

    expect(isOk(proposalResult)).toBe(true);
    expect(isOk(recordResult)).toBe(true);
    if (!isOk(proposalResult) || !isOk(recordResult)) return;

    // Same underlying computed value from the one shared computation;
    // different branded types at each projection.
    expect(proposalResult.value.candidateFingerprint as string).toBe(
      recordResult.value.fingerprint as string,
    );
  });
});
