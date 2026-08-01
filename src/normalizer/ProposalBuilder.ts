/**
 * @module normalizer/ProposalBuilder
 *
 * Produces IdentityProposal instances from the same CandidateComputer
 * BusinessNormalizer uses. Does not call BusinessNormalizer.normalize()
 * and is not called by it — both independently consume the shared
 * computer, and neither duplicates its dependency wiring (mapper
 * registry, sub-normalizer construction).
 *
 * Not wired into the production pipeline. No caller in this codebase
 * currently invokes this builder; it exists to prove the Proposal
 * boundary is structurally distinct and independently functional ahead
 * of the future Confirmation responsibility. There is no conversion path
 * from IdentityProposal to BusinessRecord anywhere in this module.
 */

import type {
  IProviderMapper,
  NormalizationContext,
  NormalizationErrorDetail,
} from "../core/interfaces/INormalizer.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type {
  IdentityProposal,
  CandidateFingerprint,
} from "../core/models/IdentityProposal.js";
import type { Result, UUID } from "../core/types/common.js";
import { ok, isOk } from "../core/types/common.js";
import { CandidateComputer } from "./CandidateComputer.js";

export class ProposalBuilder {
  private readonly computer: CandidateComputer;

  /**
   * Accepts either a provider-mapper list (builds its own
   * CandidateComputer) or an already-constructed CandidateComputer
   * (allows sharing one computer with a BusinessNormalizer, avoiding
   * duplicated dependency wiring).
   */
  constructor(mappersOrComputer: readonly IProviderMapper[] | CandidateComputer) {
    this.computer =
      mappersOrComputer instanceof CandidateComputer
        ? mappersOrComputer
        : new CandidateComputer(mappersOrComputer);
  }

  build(
    result: ProviderResult,
    context: NormalizationContext,
    rawResultId: UUID,
  ): Result<IdentityProposal, NormalizationErrorDetail> {
    const candidateResult = this.computer.compute(result, context);

    if (!isOk(candidateResult)) {
      return candidateResult;
    }

    const { computedFingerprint, ...candidateFields } = candidateResult.value;

    const proposal: IdentityProposal = {
      ...candidateFields,
      candidateFingerprint: computedFingerprint as unknown as CandidateFingerprint,
      rawResultId,
    };

    return ok(proposal);
  }
}
