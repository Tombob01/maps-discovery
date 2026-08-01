/**
 * @module confirmation/ConfirmationOrchestrator
 *
 * Thin coordination layer bridging persisted proposals, the
 * persistence-agnostic ConfirmationService, and confirmation
 * persistence. Per the Phase 4C/4D architectural audits, this
 * component is deliberately narrow:
 *
 *   - Loads a persisted proposal by id.
 *   - Delegates ALL confirmation validation and construction to
 *     ConfirmationService -- never duplicates its checks.
 *   - Persists the resulting Confirmation.
 *
 * Explicitly does NOT perform: publication/materialization,
 * authority resolution, BusinessRecordFactory invocation, proposal
 * production (ProposalBuilder), pipeline integration, or confirmation
 * eligibility logic. Those remain out of scope for this component by
 * design, per Phase 4A-4C's separation of ratification from
 * publication.
 */

import type { IProposalStore, PersistedProposal } from "../storage/IProposalStore.js";
import type { IConfirmationStore, PersistedConfirmation } from "../storage/IConfirmationStore.js";
import type {
  ConfirmationService,
  ConfirmationDecisionInput,
  ConfirmationError,
} from "../normalizer/ConfirmationService.js";
import type { ConfirmationDecision } from "../core/models/Confirmation.js";
import type { Result, UUID } from "../core/types/common.js";
import { ok, err, isOk } from "../core/types/common.js";

export interface ConfirmProposalInput {
  readonly proposalId: UUID;
  readonly decision: ConfirmationDecision;
  readonly confirmedBy: string;
  readonly confirmedAt?: Date;
}

export type ConfirmProposalErrorCode = "PROPOSAL_NOT_FOUND";

export interface ProposalNotFoundError {
  readonly code: ConfirmProposalErrorCode;
  readonly message: string;
}

export type ConfirmProposalError = ProposalNotFoundError | ConfirmationError;

export class ConfirmationOrchestrator {
  constructor(
    private readonly proposalStore: IProposalStore,
    private readonly confirmationService: ConfirmationService,
    private readonly confirmationStore: IConfirmationStore,
  ) {}

  async confirmProposal(
    input: ConfirmProposalInput,
  ): Promise<Result<PersistedConfirmation, ConfirmProposalError>> {
    const persistedProposal: PersistedProposal | null = await this.proposalStore.fetchById(
      input.proposalId,
    );

    if (persistedProposal === null) {
      return err({
        code: "PROPOSAL_NOT_FOUND",
        message: `No persisted proposal found for id "${input.proposalId}"`,
      });
    }

    const decisionInput: ConfirmationDecisionInput = {
      decision: input.decision,
      confirmedBy: input.confirmedBy,
      ...(input.confirmedAt !== undefined ? { confirmedAt: input.confirmedAt } : {}),
    };

    const confirmationResult = this.confirmationService.confirm(
      persistedProposal.proposal,
      persistedProposal.id,
      decisionInput,
    );

    if (!isOk(confirmationResult)) {
      return err(confirmationResult.error);
    }

    const persisted = await this.confirmationStore.save(confirmationResult.value);

    return ok(persisted);
  }
}