/**
 * tests/unit/normalizer/confirmationService.test.ts
 */

import { describe, it, expect } from "vitest";
import { ConfirmationService } from "../../../src/normalizer/ConfirmationService.js";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";
import type { CandidateFingerprint } from "../../../src/core/models/CandidateIdentity.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";
import { isOk, isErr } from "../../../src/core/types/common.js";

function makeProposal(overrides: Partial<IdentityProposal> = {}): IdentityProposal {
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
    categories: [],
    primaryCategory: null,
    rating: null,
    reviewCount: null,
    hours: null,
    priceLevel: null,
    services: null,
    sourceProvider: "google-maps",
    sourceUrl: null,
    collectedAt: new Date("2024-01-15T10:00:00Z"),
    runId: "run-1" as RunID,
    queryId: "query-1" as QueryID,
    candidateFingerprint: "fp-abc" as CandidateFingerprint,
    rawResultId: "11111111-1111-1111-1111-111111111111" as UUID,
    ...overrides,
  };
}

const proposalId = "22222222-2222-2222-2222-222222222222" as UUID;

describe("ConfirmationService", () => {
  const service = new ConfirmationService();

  it("produces a ratified Confirmation referencing the proposal's candidateFingerprint", () => {
    const proposal = makeProposal();
    const result = service.confirm(proposal, proposalId, { decision: "ratified", confirmedBy: "reviewer-1" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.candidateFingerprint).toBe(proposal.candidateFingerprint);
    expect(result.value.decision).toBe("ratified");
    expect(result.value.confirmedBy).toBe("reviewer-1");
    expect(result.value.confirmedAt).toBeInstanceOf(Date);
  });

  it("produces a rejected Confirmation", () => {
    const proposal = makeProposal();
    const result = service.confirm(proposal, proposalId, { decision: "rejected", confirmedBy: "reviewer-2" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.decision).toBe("rejected");
  });

  it("uses provided confirmedAt when given", () => {
    const proposal = makeProposal();
    const fixed = new Date("2025-01-01T00:00:00Z");
    const result = service.confirm(proposal, proposalId, { decision: "ratified", confirmedBy: "r", confirmedAt: fixed });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.confirmedAt).toBe(fixed);
  });

  it("returns err when confirmedBy is empty", () => {
    const proposal = makeProposal();
    const result = service.confirm(proposal, proposalId, { decision: "ratified", confirmedBy: "" });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe("MISSING_CONFIRMED_BY");
  });

  it("does not include authoritative-only fields on the Confirmation", () => {
    const proposal = makeProposal();
    const result = service.confirm(proposal, proposalId, { decision: "ratified", confirmedBy: "r" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect("id" in result.value).toBe(false);
    expect("fingerprint" in result.value).toBe(false);
    expect("normalizationStatus" in result.value).toBe(false);
    expect("deduplicationStatus" in result.value).toBe(false);
    expect("exportStatus" in result.value).toBe(false);
  });
});
