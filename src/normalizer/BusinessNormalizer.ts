/**
 * @module normalizer/BusinessNormalizer
 *
 * Top-level normalizer. Delegates field-level computation to the shared
 * CandidateComputer and shapes its output into a BusinessRecord.
 *
 * Internal refactor only — public method signature, return type, and all
 * observable behavior are unchanged from the prior implementation.
 * Existing callers (`new BusinessNormalizer(mappers)`) require no change.
 */

import type {
  INormalizer,
  IProviderMapper,
  NormalizationContext,
  NormalizationErrorDetail,
} from "../core/interfaces/INormalizer.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { Result } from "../core/types/common.js";
import { ok, isOk } from "../core/types/common.js";
import { CandidateComputer } from "./CandidateComputer.js";
import { BusinessRecordFactory } from "./BusinessRecordFactory.js";

export class BusinessNormalizer implements INormalizer {
  private readonly computer: CandidateComputer;

  /**
   * Accepts either a provider-mapper list (builds its own CandidateComputer,
   * matching all existing call sites) or an already-constructed
   * CandidateComputer (allows sharing one computer with a ProposalBuilder,
   * avoiding duplicated dependency wiring). Both forms are fully
   * backward-compatible with existing callers.
   */
  constructor(mappersOrComputer: readonly IProviderMapper[] | CandidateComputer) {
    this.computer =
      mappersOrComputer instanceof CandidateComputer
        ? mappersOrComputer
        : new CandidateComputer(mappersOrComputer);
  }

  async normalize(
    result: ProviderResult,
    context: NormalizationContext,
  ): Promise<Result<BusinessRecord, NormalizationErrorDetail>> {
    const candidateResult = this.computer.compute(result, context);

    if (!isOk(candidateResult)) {
      return candidateResult;
    }

    const record = BusinessRecordFactory.create(candidateResult.value);

    return ok(record);
  }
}
