/**
 * @module normalizer/ConfirmationService
 *
 * Confirmation responsibility for Family E Phase 2. Sole producer of
 * Confirmation objects. No dependency on BusinessRecordFactory,
 * persistence, or the production pipeline.
 */

import type { IdentityProposal } from "../core/models/IdentityProposal.js";
import type { Confirmation, ConfirmationDecision } from "../core/models/Confirmation.js";
import type { Result, UUID } from "../core/types/common.js";
import { ok, err } from "../core/types/common.js";

export interface ConfirmationDecisionInput {
  readonly decision: ConfirmationDecision;
  readonly confirmedBy: string;
  readonly confirmedAt?: Date;
}

export type ConfirmationErrorCode =
  | "MISSING_PROPOSAL"
  | "MISSING_CONFIRMED_BY"
  | "INVALID_DECISION";

export interface ConfirmationError {
  readonly code: ConfirmationErrorCode;
  readonly message: string;
}

export class ConfirmationService {
  confirm(
    proposal: IdentityProposal,
    proposalId: UUID,
    input: ConfirmationDecisionInput,
  ): Result<Confirmation, ConfirmationError> {
    if (!proposal) {
      return err({ code: "MISSING_PROPOSAL", message: "A proposal is required to record a confirmation" });
    }
    if (!input.confirmedBy || input.confirmedBy.trim() === "") {
      return err({ code: "MISSING_CONFIRMED_BY", message: "confirmedBy is required" });
    }
    if (input.decision !== "ratified" && input.decision !== "rejected") {
      return err({ code: "INVALID_DECISION", message: `Invalid decision: ${String(input.decision)}` });
    }

    const shared = {
      proposalId,
      candidateFingerprint: proposal.candidateFingerprint,
      confirmedBy: input.confirmedBy,
      confirmedAt: input.confirmedAt ?? new Date(),
    };

    const confirmation: Confirmation =
      input.decision === "ratified"
        ? { ...shared, decision: "ratified" }
        : { ...shared, decision: "rejected" };

    return ok(confirmation);
  }
}
