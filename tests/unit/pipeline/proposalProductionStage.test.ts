/**
 * tests/unit/pipeline/proposalProductionStage.test.ts
 *
 * Uses a cast-based stub for ProposalOrchestrator's public shape, since
 * it is a concrete class (not an interface) -- there is no I<X>Store-style
 * contract to hand-implement here, unlike this codebase's usual storage
 * stubbing convention.
 */

import { describe, it, expect, vi } from "vitest";
import { ProposalProductionStage } from "../../../src/pipeline/ProposalProductionStage.js";
import type { StageContext } from "../../../src/pipeline/IPipelineStage.js";
import type { ProposalProductionJobPayload } from "../../../src/core/models/Job.js";
import type { ProposalOrchestrator } from "../../../src/proposal/ProposalOrchestrator.js";
import type { PersistedProposal } from "../../../src/storage/IProposalStore.js";
import type { IdentityProposal } from "../../../src/core/models/IdentityProposal.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";
import { ok, err, isOk } from "../../../src/core/types/common.js";

const rawResultId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as UUID;

function makePayload(): ProposalProductionJobPayload {
  return {
    runId: "run-1" as RunID,
    queryId: "query-1" as QueryID,
    rawResultId,
    providerId: "google-maps",
  };
}

const ctx: StageContext = { runId: "run-1", stageId: "stage-1", attempt: 1 };

function makeStubOrchestrator(
  impl: ProposalOrchestrator["produceProposal"],
): ProposalOrchestrator {
  return { produceProposal: impl } as unknown as ProposalOrchestrator;
}

describe("ProposalProductionStage", () => {
  it("has stageName 'proposal-production'", () => {
    const stage = new ProposalProductionStage(makeStubOrchestrator(vi.fn()));
    expect(stage.stageName).toBe("proposal-production");
  });

  describe("success", () => {
    it("returns success: true and calls produceProposal with the payload's rawResultId", async () => {
      const persisted: PersistedProposal = {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as UUID,
        proposal: {} as IdentityProposal,
        createdAt: new Date(),
      };
      const produceProposal = vi.fn(async () => ok(persisted));
      const stage = new ProposalProductionStage(makeStubOrchestrator(produceProposal));

      const result = await stage.execute(makePayload(), ctx);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.success).toBe(true);
      expect(result.value.skipped).toBeUndefined();
      expect(produceProposal).toHaveBeenCalledWith({ rawResultId });
    });
  });

  describe("graceful skips", () => {
    it("skips gracefully on RAW_RESULT_NOT_FOUND", async () => {
      const produceProposal = vi.fn(async () =>
        err({ code: "RAW_RESULT_NOT_FOUND" as const, message: "not found" }),
      );
      const stage = new ProposalProductionStage(makeStubOrchestrator(produceProposal));

      const result = await stage.execute(makePayload(), ctx);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.success).toBe(true);
      expect(result.value.skipped).toBe(true);
    });

    it("skips gracefully on ProposalBuilder validation failure", async () => {
      const produceProposal = vi.fn(async () =>
        err({
          code: "MISSING_REQUIRED_FIELD" as const,
          message: "name is required",
          providerId: "google-maps",
        }),
      );
      const stage = new ProposalProductionStage(makeStubOrchestrator(produceProposal));

      const result = await stage.execute(makePayload(), ctx);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.success).toBe(true);
      expect(result.value.skipped).toBe(true);
    });
  });

  describe("infrastructure failures", () => {
    it("returns a retryable StageError when produceProposal throws", async () => {
      const produceProposal = vi.fn(async () => {
        throw new Error("DB connection lost");
      });
      const stage = new ProposalProductionStage(makeStubOrchestrator(produceProposal));

      const result = await stage.execute(makePayload(), ctx);

      expect(isOk(result)).toBe(false);
      if (isOk(result)) return;
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toContain("DB connection lost");
    });
  });
});