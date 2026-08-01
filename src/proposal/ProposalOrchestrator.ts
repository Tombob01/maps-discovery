/**
 * @module proposal/ProposalOrchestrator
 *
 * Thin coordination layer bridging raw discovery results, the
 * persistence-agnostic ProposalBuilder, and proposal persistence.
 * Structurally mirrors confirmation/ConfirmationOrchestrator.ts:
 *
 *   - Loads a raw result by its raw_results.id UUID.
 *   - Delegates ALL candidate computation and validation to
 *     ProposalBuilder -- never duplicates its checks.
 *   - Persists the resulting IdentityProposal.
 *
 * Explicitly does NOT perform: raw-result production/discovery,
 * confirmation, publication/materialization, BusinessRecordFactory
 * invocation, or pipeline integration. Those remain out of scope for
 * this component by design.
 */

import type { IRawResultStore } from "../storage/IRawResultStore.js";
import type { IProposalStore, PersistedProposal } from "../storage/IProposalStore.js";
import type {
  NormalizationContext,
  NormalizationErrorDetail,
} from "../core/interfaces/INormalizer.js";
import type { ProposalBuilder } from "../normalizer/ProposalBuilder.js";
import type { Result, UUID } from "../core/types/common.js";
import { ok, err, isOk } from "../core/types/common.js";

export interface ProduceProposalInput {
  readonly rawResultId: UUID;
  readonly countryCodeHint?: string;
}

export type ProduceProposalErrorCode = "RAW_RESULT_NOT_FOUND";

export interface RawResultNotFoundError {
  readonly code: ProduceProposalErrorCode;
  readonly message: string;
}

export type ProduceProposalError = RawResultNotFoundError | NormalizationErrorDetail;

export class ProposalOrchestrator {
  constructor(
    private readonly rawResultStore: IRawResultStore,
    private readonly proposalBuilder: ProposalBuilder,
    private readonly proposalStore: IProposalStore,
  ) {}

  async produceProposal(
    input: ProduceProposalInput,
  ): Promise<Result<PersistedProposal, ProduceProposalError>> {
    const rawResult = await this.rawResultStore.fetchById(input.rawResultId);

    if (rawResult === null) {
      return err({
        code: "RAW_RESULT_NOT_FOUND",
        message: `No raw result found for id "${input.rawResultId}"`,
      });
    }

    const context: NormalizationContext = {
      providerId: rawResult.providerId,
      runId: rawResult.runId,
      queryId: rawResult.queryId,
      collectedAt: rawResult.collectedAt,
      ...(input.countryCodeHint !== undefined ? { countryCodeHint: input.countryCodeHint } : {}),
    };

    const buildResult = this.proposalBuilder.build(rawResult, context, input.rawResultId);

    if (!isOk(buildResult)) {
      return err(buildResult.error);
    }

    const persisted = await this.proposalStore.save(buildResult.value);

    return ok(persisted);
  }
}