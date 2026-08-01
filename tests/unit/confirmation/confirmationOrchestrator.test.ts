/**
 * tests/unit/confirmation/confirmationOrchestrator.test.ts
 *
 * Uses hand-written stub objects implementing IProposalStore and
 * IConfirmationStore directly, consistent with this codebase's
 * established convention of hand-rolling interface implementations
 * for tests rather than mocking a concrete class -- the orchestrator
 * depends on the interfaces, not Postgres.
 */

import { describe, it, expect, vi } from "vitest";
import { ConfirmationOrchestrator } from "../../../src/confirmation/ConfirmationOrchestrator.js";
import { ConfirmationService } from "../../../src/normalizer/ConfirmationService.js";
import type { IProposalStore, PersistedProposal } from "../../../src/storage/IProposalStore.js";
import type { IConfirmationStore, PersistedConfirmation } from "../../../src/storage/IConfirmationStore.js";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";
import type { Confirmation } from "../../../src/core/models/Confirmation.js";
import type { CandidateFingerprint } from "../../../src/core/models/CandidateIdentity.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";
import { isOk, isErr } from "../../../src/core/types/common.js";

const proposalId = "88888888-8888-8888-8888-888888888888" as UUID;

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

function makeStubProposalStore(
  proposal: PersistedProposal | null,
): { store: IProposalStore; fetchById: ReturnType<typeof vi.fn> } {
  const fetchById = vi.fn(async (_id: UUID) => proposal);
  const store: IProposalStore = {
    save: vi.fn(),
    fetchById,
    listByCandidateFingerprint: vi.fn(),
  };
  return { store, fetchById };
}

function makeStubConfirmationStore(
  result: PersistedConfirmation,
): { store: IConfirmationStore; save: ReturnType<typeof vi.fn> } {
  const save = vi.fn(async (_confirmation: Confirmation) => result);
  const store: IConfirmationStore = {
    save,
    fetchById: vi.fn(),
    listByProposalId: vi.fn(),
  };
  return { store, save };
}

describe("ConfirmationOrchestrator", () => {
  describe("success paths", () => {
    it("confirms a ratified decision: loads proposal, delegates to ConfirmationService, persists, returns PersistedConfirmation", async () => {
      const proposal = makeProposal();
      const persistedProposal: PersistedProposal = {
        id: proposalId,
        proposal,
        createdAt: new Date("2024-06-01T00:00:00Z"),
      };
      const { store: proposalStore, fetchById } = makeStubProposalStore(persistedProposal);

      const expectedPersisted: PersistedConfirmation = {
        id: "99999999-9999-9999-9999-999999999999" as UUID,
        confirmation: {
          proposalId,
          candidateFingerprint: proposal.candidateFingerprint,
          decision: "ratified",
          confirmedBy: "reviewer-1",
          confirmedAt: new Date("2024-06-02T00:00:00Z"),
        },
        createdAt: new Date("2024-06-02T00:00:00Z"),
      };
      const { store: confirmationStore, save } = makeStubConfirmationStore(expectedPersisted);

      const orchestrator = new ConfirmationOrchestrator(
        proposalStore,
        new ConfirmationService(),
        confirmationStore,
      );

      const result = await orchestrator.confirmProposal({
        proposalId,
        decision: "ratified",
        confirmedBy: "reviewer-1",
      });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBe(expectedPersisted);
      expect(fetchById).toHaveBeenCalledTimes(1);
      expect(fetchById).toHaveBeenCalledWith(proposalId);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0]?.[0]).toMatchObject({
        proposalId,
        decision: "ratified",
        confirmedBy: "reviewer-1",
      });
    });

    it("confirms a rejected decision", async () => {
      const proposal = makeProposal();
      const persistedProposal: PersistedProposal = {
        id: proposalId,
        proposal,
        createdAt: new Date("2024-06-01T00:00:00Z"),
      };
      const { store: proposalStore } = makeStubProposalStore(persistedProposal);

      const expectedPersisted: PersistedConfirmation = {
        id: "99999999-9999-9999-9999-999999999999" as UUID,
        confirmation: {
          proposalId,
          candidateFingerprint: proposal.candidateFingerprint,
          decision: "rejected",
          confirmedBy: "reviewer-2",
          confirmedAt: new Date("2024-06-02T00:00:00Z"),
        },
        createdAt: new Date("2024-06-02T00:00:00Z"),
      };
      const { store: confirmationStore, save } = makeStubConfirmationStore(expectedPersisted);

      const orchestrator = new ConfirmationOrchestrator(
        proposalStore,
        new ConfirmationService(),
        confirmationStore,
      );

      const result = await orchestrator.confirmProposal({
        proposalId,
        decision: "rejected",
        confirmedBy: "reviewer-2",
      });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.confirmation.decision).toBe("rejected");
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  describe("error paths", () => {
    it("returns PROPOSAL_NOT_FOUND when no persisted proposal exists, and never calls save()", async () => {
      const { store: proposalStore, fetchById } = makeStubProposalStore(null);
      const expectedPersisted: PersistedConfirmation = {
        id: "unused" as UUID,
        confirmation: {
          proposalId,
          candidateFingerprint: "fp-abc" as CandidateFingerprint,
          decision: "ratified",
          confirmedBy: "reviewer-1",
          confirmedAt: new Date(),
        },
        createdAt: new Date(),
      };
      const { store: confirmationStore, save } = makeStubConfirmationStore(expectedPersisted);

      const orchestrator = new ConfirmationOrchestrator(
        proposalStore,
        new ConfirmationService(),
        confirmationStore,
      );

      const result = await orchestrator.confirmProposal({
        proposalId,
        decision: "ratified",
        confirmedBy: "reviewer-1",
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe("PROPOSAL_NOT_FOUND");
      expect(fetchById).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalled();
    });

    it("forwards MISSING_CONFIRMED_BY from ConfirmationService without duplicating validation, and never calls save()", async () => {
      const proposal = makeProposal();
      const persistedProposal: PersistedProposal = {
        id: proposalId,
        proposal,
        createdAt: new Date("2024-06-01T00:00:00Z"),
      };
      const { store: proposalStore } = makeStubProposalStore(persistedProposal);
      const expectedPersisted: PersistedConfirmation = {
        id: "unused" as UUID,
        confirmation: {
          proposalId,
          candidateFingerprint: proposal.candidateFingerprint,
          decision: "ratified",
          confirmedBy: "x",
          confirmedAt: new Date(),
        },
        createdAt: new Date(),
      };
      const { store: confirmationStore, save } = makeStubConfirmationStore(expectedPersisted);

      const orchestrator = new ConfirmationOrchestrator(
        proposalStore,
        new ConfirmationService(),
        confirmationStore,
      );

      const result = await orchestrator.confirmProposal({
        proposalId,
        decision: "ratified",
        confirmedBy: "",
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe("MISSING_CONFIRMED_BY");
      expect(save).not.toHaveBeenCalled();
    });

    it("forwards INVALID_DECISION from ConfirmationService, and never calls save()", async () => {
      const proposal = makeProposal();
      const persistedProposal: PersistedProposal = {
        id: proposalId,
        proposal,
        createdAt: new Date("2024-06-01T00:00:00Z"),
      };
      const { store: proposalStore } = makeStubProposalStore(persistedProposal);
      const expectedPersisted: PersistedConfirmation = {
        id: "unused" as UUID,
        confirmation: {
          proposalId,
          candidateFingerprint: proposal.candidateFingerprint,
          decision: "ratified",
          confirmedBy: "reviewer-1",
          confirmedAt: new Date(),
        },
        createdAt: new Date(),
      };
      const { store: confirmationStore, save } = makeStubConfirmationStore(expectedPersisted);

      const orchestrator = new ConfirmationOrchestrator(
        proposalStore,
        new ConfirmationService(),
        confirmationStore,
      );

      const result = await orchestrator.confirmProposal({
        proposalId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        decision: "maybe" as any,
        confirmedBy: "reviewer-1",
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe("INVALID_DECISION");
      expect(save).not.toHaveBeenCalled();
    });
  });
});