/**
 * @module pipeline/NormalizationStage
 *
 * Pipeline stage: reads a NormalizationJobPayload, runs BusinessNormalizer,
 * and returns a StageResult.
 *
 * In production the normalized record would be persisted to DB here.
 * This implementation keeps the stage pure / testable by accepting an
 * optional onSuccess callback for side effects.
 */

import type {
  IPipelineStage,
  StageContext,
  StageError,
} from "./IPipelineStage.js";
import type {
  StageResult,
  NormalizationJobPayload,
} from "../core/models/Job.js";
import type {
  INormalizer,
  NormalizationContext,
} from "../core/interfaces/INormalizer.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
import { ok, err, isOk } from "../core/types/common.js";

export interface NormalizationStageOptions {
  /**
   * Fetches the raw ProviderResult by id.
   * In production: a DB read. In tests: an in-memory store.
   */
  fetchRawResult(rawResultId: string): Promise<ProviderResult | null>;

  /**
   * Called after a successful normalization.
   * Use for persistence, downstream queue enqueue, etc.
   */
  onSuccess?(
    record: BusinessRecord,
    payload: NormalizationJobPayload,
  ): Promise<void>;
}

export class NormalizationStage implements IPipelineStage<NormalizationJobPayload> {
  readonly stageName = "normalization" as const;

  constructor(
    private readonly normalizer: INormalizer,
    private readonly options: NormalizationStageOptions,
  ) {}

  async execute(
    payload: NormalizationJobPayload,
    _ctx: StageContext,
  ): Promise<Result<StageResult, StageError>> {
    // 1. Fetch raw result
    let rawResult: ProviderResult | null;
    try {
    console.log("[norm] payload:", JSON.stringify({runId: payload.runId, queryId: payload.queryId, rawResultId: payload.rawResultId, providerId: payload.providerId}));
      rawResult = await this.options.fetchRawResult(payload.rawResultId);
    } catch (e) {
      return err({
        code: "DEPENDENCY_UNAVAILABLE",
        stage: this.stageName,
        message: `Failed to fetch raw result "${payload.rawResultId}": ${String(e)}`,
        cause: e,
      });
    }

    if (rawResult === null) {
      // Record was deleted or never existed â€” skip gracefully
      return ok({
        success: true,
        skipped: true,
        skipReason: `rawResultId "${payload.rawResultId}" not found`,
      });
    }

    // 2. Build normalization context
    const normCtx: NormalizationContext = {
      providerId: payload.providerId,
      runId: payload.runId,
      queryId: payload.queryId,
      collectedAt: rawResult.collectedAt,
    };

    // 3. Normalize
    let normalizeResult: Awaited<ReturnType<INormalizer["normalize"]>>;
    try {
      normalizeResult = await this.normalizer.normalize(rawResult, normCtx);
    } catch (e) {
      return err({
        code: "UNEXPECTED_ERROR",
        stage: this.stageName,
        message: `Normalizer threw: ${String(e)}`,
        cause: e,
      });
    }

    if (!isOk(normalizeResult)) {
      // Normalization failed â€” treat as a skipped record (don't retry)
      return ok({
        success: true,
        skipped: true,
        skipReason: `Normalization failed: ${normalizeResult.error.message}`,
      });
    }

    const record = normalizeResult.value;

    // 4. Side effects (persist, enqueue downstream, etc.)
    if (this.options.onSuccess) {
      try {
        await this.options.onSuccess(record, payload);
      } catch (e) {
        return err({
          code: "DEPENDENCY_UNAVAILABLE",
          stage: this.stageName,
          message: `onSuccess callback threw: ${String(e)}`,
          cause: e,
        });
      }
    }

    return ok({
      success: true,
      meta: { businessId: record.id, fingerprint: record.fingerprint },
    });
  }
}
