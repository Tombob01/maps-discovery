/**
 * @module pipeline/ProposalProductionCoordinator
 *
 * Thin wrapper around PipelineRunner<ProposalProductionJobPayload>, pairing
 * the proposal-production queue with its stage so callers never need to
 * know how to pair them correctly -- mirrors the ConfirmationOrchestrator /
 * ProposalOrchestrator naming convention (see PROJECT_MASTER_HANDOFF.md,
 * ADR Phase 4E-D-3).
 *
 * Deliberately has NO RunLifecycleService, RuntimeExecutor, or
 * RuntimeFacade dependency, and is not wired into any existing call
 * graph as part of this milestone -- nothing invokes drain()
 * automatically (see PROJECT_MASTER_HANDOFF.md Section 11.4, an
 * explicitly open question, not resolved by this file).
 */

import { PipelineRunner } from "./PipelineRunner.js";
import type { PipelineRunnerOptions, RunnerStats } from "./PipelineRunner.js";
import type { IQueue } from "../queue/IQueue.js";
import type { ProposalProductionJobPayload } from "../core/models/Job.js";
import type { ProposalProductionStage } from "./ProposalProductionStage.js";

export class ProposalProductionCoordinator {
  private readonly runner: PipelineRunner<ProposalProductionJobPayload>;

  constructor(
    queue: IQueue<ProposalProductionJobPayload>,
    stage: ProposalProductionStage,
    opts?: PipelineRunnerOptions,
  ) {
    this.runner = new PipelineRunner<ProposalProductionJobPayload>(queue, stage, opts);
  }

  /**
   * Processes all currently queued proposal-production jobs then stops.
   * Delegates entirely to the wrapped PipelineRunner.drain().
   */
  async drain(): Promise<void> {
    return this.runner.drain();
  }

  /** Delegates to the underlying PipelineRunner's stats. */
  get stats(): RunnerStats {
    return this.runner.stats;
  }
}