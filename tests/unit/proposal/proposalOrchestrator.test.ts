/**
 * tests/unit/proposal/proposalOrchestrator.test.ts
 *
 * Uses hand-written stub objects implementing IRawResultStore and
 * IProposalStore directly, consistent with confirmationOrchestrator.test.ts's
 * convention. Uses a real ProposalBuilder (with a real CandidateComputer +
 * GoogleMapsProviderMapper) so builder validation is exercised genuinely,
 * not stubbed -- mirroring proposalBuilder.test.ts's own approach.
 */

import { describe, it, expect, vi } from "vitest";
import { ProposalOrchestrator } from "../../../src/proposal/ProposalOrchestrator.js";
import { ProposalBuilder } from "../../../src/normalizer/ProposalBuilder.js";
import { GoogleMapsProviderMapper } from "../../../src/normalizer/GoogleMapsProviderMapper.js";
import type { IRawResultStore } from "../../../src/storage/IRawResultStore.js";
import type { IProposalStore, PersistedProposal } from "../../../src/storage/IProposalStore.js";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";
import type { ProviderResult } from "../../../src/core/models/ProviderResult.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";
import { isOk, isErr } from "../../../src/core/types/common.js";

const rawResultId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as UUID;

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

function makeRawResult(rawPayload: unknown = fullPayload): ProviderResult {
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

function makeStubRawResultStore(
  result: ProviderResult | null,
): { store: IRawResultStore; fetchById: ReturnType<typeof vi.fn> } {
  const fetchById = vi.fn(async (_id: UUID) => result);
  const store: IRawResultStore = {
    save: vi.fn(),
    fetch: vi.fn(),
    fetchById,
    saveAndGetId: vi.fn(),
  };
  return { store, fetchById };
}

function makeStubProposalStore(
  result: PersistedProposal,
): { store: IProposalStore; save: ReturnType<typeof vi.fn> } {
  const save = vi.fn(async (_proposal: IdentityProposal) => result);
  const store: IProposalStore = {
    save,
    fetchById: vi.fn(),
    listByCandidateFingerprint: vi.fn(),
  };
  return { store, save };
}

function makeBuilder(): ProposalBuilder {
  return new ProposalBuilder([new GoogleMapsProviderMapper()]);
}

describe("ProposalOrchestrator", () => {
  describe("success path", () => {
    it("loads the raw result, builds, and persists the proposal, returning PersistedProposal", async () => {
      const rawResult = makeRawResult();
      const { store: rawResultStore, fetchById } = makeStubRawResultStore(rawResult);

      const expectedPersisted: PersistedProposal = {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as UUID,
        proposal: {} as IdentityProposal,
        createdAt: new Date("2024-06-01T00:00:00Z"),
      };
      const { store: proposalStore, save } = makeStubProposalStore(expectedPersisted);

      const orchestrator = new ProposalOrchestrator(rawResultStore, makeBuilder(), proposalStore);

      const result = await orchestrator.produceProposal({ rawResultId });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBe(expectedPersisted);
      expect(fetchById).toHaveBeenCalledTimes(1);
      expect(fetchById).toHaveBeenCalledWith(rawResultId);
      expect(save).toHaveBeenCalledTimes(1);
      const savedProposal = save.mock.calls[0]?.[0] as IdentityProposal;
      expect(savedProposal.name).toBe("Ace Plumbers Ltd");
      expect(savedProposal.rawResultId).toBe(rawResultId);
    });

    it("passes countryCodeHint through to the NormalizationContext when provided", async () => {
      const rawResult = makeRawResult();
      const { store: rawResultStore } = makeStubRawResultStore(rawResult);
      const expectedPersisted: PersistedProposal = {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as UUID,
        proposal: {} as IdentityProposal,
        createdAt: new Date(),
      };
      const { store: proposalStore, save } = makeStubProposalStore(expectedPersisted);
      const builder = makeBuilder();
      const buildSpy = vi.spyOn(builder, "build");

      const orchestrator = new ProposalOrchestrator(rawResultStore, builder, proposalStore);

      await orchestrator.produceProposal({ rawResultId, countryCodeHint: "NG" });

      expect(buildSpy).toHaveBeenCalledTimes(1);
      const passedContext = buildSpy.mock.calls[0]?.[1];
      expect(passedContext?.countryCodeHint).toBe("NG");
      void save;
    });
  });

  describe("error paths", () => {
    it("returns RAW_RESULT_NOT_FOUND when no raw result exists, and never calls proposalStore.save()", async () => {
      const { store: rawResultStore, fetchById } = makeStubRawResultStore(null);
      const expectedPersisted: PersistedProposal = {
        id: "unused" as UUID,
        proposal: {} as IdentityProposal,
        createdAt: new Date(),
      };
      const { store: proposalStore, save } = makeStubProposalStore(expectedPersisted);

      const orchestrator = new ProposalOrchestrator(rawResultStore, makeBuilder(), proposalStore);

      const result = await orchestrator.produceProposal({ rawResultId });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe("RAW_RESULT_NOT_FOUND");
      expect(fetchById).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalled();
    });

    it("forwards ProposalBuilder validation errors unchanged, and never calls proposalStore.save()", async () => {
      const rawResult = makeRawResult({ rating: 4.5 });
      const { store: rawResultStore } = makeStubRawResultStore(rawResult);
      const expectedPersisted: PersistedProposal = {
        id: "unused" as UUID,
        proposal: {} as IdentityProposal,
        createdAt: new Date(),
      };
      const { store: proposalStore, save } = makeStubProposalStore(expectedPersisted);

      const orchestrator = new ProposalOrchestrator(rawResultStore, makeBuilder(), proposalStore);

      const result = await orchestrator.produceProposal({ rawResultId });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect("code" in result.error).toBe(true);
      expect(save).not.toHaveBeenCalled();
    });
  });
});