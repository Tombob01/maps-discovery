/**
 * @module tests/unit/pipeline/ProposalProductionCoordinator
 */

import { describe, it, expect } from "vitest";
import { ProposalProductionCoordinator } from "../../../src/pipeline/ProposalProductionCoordinator.js";
import { InMemoryQueue } from "../../../src/queue/InMemoryQueue.js";
import type { ProposalProductionJobPayload, StageResult } from "../../../src/core/models/Job.js";
import type { ProposalProductionStage } from "../../../src/pipeline/ProposalProductionStage.js";
import type { RunID, QueryID, UUID } from "../../../src/core/types/common.js";

function makePayload(n: number): ProposalProductionJobPayload {
  return {
    runId: "run-1" as RunID,
    queryId: "q-1" as QueryID,
    rawResultId: `00000000-0000-0000-0000-00000000000${n}` as UUID,
    providerId: "google-maps",
  };
}

/**
 * Cast-based partial stub for ProposalProductionStage -- this is a
 * concrete class, not an interface, so there is no I<X>Store-style
 * hand-written-implementer convention available for it. Matches the
 * pattern established in tests/unit/pipeline/proposalProductionStage.test.ts
 * per PROJECT_MASTER_HANDOFF.md Section 2.18 (third, newest testing
 * convention). Only `stageName` and `execute` are provided since those
 * are the only members PipelineRunner actually calls.
 */
function makeStubStage(
  onExecute: (payload: ProposalProductionJobPayload) => Promise<{ ok: true; value: StageResult }>,
): ProposalProductionStage {
  return {
    stageName: "proposal-production" as const,
    execute: onExecute,
  } as unknown as ProposalProductionStage;
}

describe("ProposalProductionCoordinator", () => {
  it("drains all queued jobs via the wrapped PipelineRunner", async () => {
    const queue = new InMemoryQueue<ProposalProductionJobPayload>("proposal-production");
    await queue.enqueue(makePayload(1));
    await queue.enqueue(makePayload(2));

    let executed = 0;
    const stubStage = makeStubStage(async () => {
      executed++;
      return { ok: true, value: { success: true } };
    });

    const coordinator = new ProposalProductionCoordinator(queue, stubStage);
    await coordinator.drain();

    expect(executed).toBe(2);
    expect(coordinator.stats.succeeded).toBe(2);

    const depth = await queue.depth();
    expect(depth.ok ? depth.value : -1).toBe(0);
  });

  it("exposes underlying runner stats, including skipped jobs", async () => {
    const queue = new InMemoryQueue<ProposalProductionJobPayload>("proposal-production");
    const stubStage = makeStubStage(async () => ({
      ok: true,
      value: { success: true, skipped: true, skipReason: "test" },
    }));

    const coordinator = new ProposalProductionCoordinator(queue, stubStage);
    await queue.enqueue(makePayload(1));
    await coordinator.drain();

    expect(coordinator.stats.skipped).toBe(1);
    expect(coordinator.stats.processed).toBe(1);
  });

  it("constructs with no RunLifecycleService, RuntimeExecutor, or RuntimeFacade dependency", () => {
    const queue = new InMemoryQueue<ProposalProductionJobPayload>("proposal-production");
    const stubStage = makeStubStage(async () => ({ ok: true, value: { success: true } }));

    const coordinator = new ProposalProductionCoordinator(queue, stubStage);
    expect(coordinator).toBeDefined();
  });
});