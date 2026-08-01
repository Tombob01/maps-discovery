/**
 * @module pipeline/ProposalProductionStage
 *
 * Pipeline stage: reads a ProposalProductionJobPayload, invokes
 * ProposalOrchestrator.produceProposal(), and returns a StageResult.
 *
 * Simpler than NormalizationStage by design: ProposalOrchestrator already
 * internally resolves the raw result via IRawResultStore.fetchById(), so
 * this stage has no fetchRawResult dependency of its own -- it depends
 * only on ProposalOrchestrator, never fetching raw results directly.
 *
 * Best-effort, independent of normalization: RAW_RESULT_NOT_FOUND and
 * ProposalBuilder/business-validation failures are graceful skips (never
 * retried); only infrastructure failures (thrown exceptions) are
 * surfaced as retryable stage errors.
 */

import type {
  IPipelineStage,
  StageContext,
  StageError,
} from "./IPipelineStage.js";
import type {
  StageResult,
  ProposalProductionJobPayload,
} from "../core/models/Job.js";
import type { ProposalOrchestrator } from "../proposal/ProposalOrchestrator.js";
import type { Result } from "../core/types/common.js";
import { ok, err, isOk } from "../core/types/common.js";

export class ProposalProductionStage
  implements IPipelineStage<ProposalProductionJobPayload>
{
  readonly stageName = "proposal-production" as const;

  constructor(private readonly proposalOrchestrator: ProposalOrchestrator) {}

  async execute(
    payload: ProposalProductionJobPayload,
    _ctx: StageContext,
  ): Promise<Result<StageResult, StageError>> {
    let produceResult: Awaited<ReturnType<ProposalOrchestrator["produceProposal"]>>;
    try {
      produceResult = await this.proposalOrchestrator.produceProposal({
        rawResultId: payload.rawResultId,
      });
    } catch (e) {
      return err({
        code: "DEPENDENCY_UNAVAILABLE",
        stage: this.stageName,
        message: `ProposalOrchestrator.produceProposal threw: ${String(e)}`,
        cause: e,
      });
    }

    if (!isOk(produceResult)) {
      // Both RAW_RESULT_NOT_FOUND and ProposalBuilder validation errors
      // (NormalizationErrorDetail) are business/data conditions, not
      // infrastructure failures -- graceful skip, never retried.
      return ok({
        success: true,
        skipped: true,
        skipReason:
          produceResult.error.code === "RAW_RESULT_NOT_FOUND"
            ? produceResult.error.message
            : `Proposal build failed: ${produceResult.error.message}`,
      });
    }

    const persisted = produceResult.value;

    return ok({
      success: true,
      meta: { proposalId: persisted.id },
    });
  }
}