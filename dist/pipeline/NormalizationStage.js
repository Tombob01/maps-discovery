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
import { ok, err, isOk } from "../core/types/common.js";
export class NormalizationStage {
    normalizer;
    options;
    stageName = "normalization";
    constructor(normalizer, options) {
        this.normalizer = normalizer;
        this.options = options;
    }
    async execute(payload, _ctx) {
        // 1. Fetch raw result
        let rawResult;
        try {
            rawResult = await this.options.fetchRawResult(payload.rawResultId);
        }
        catch (e) {
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
        const normCtx = {
            providerId: payload.providerId,
            runId: payload.runId,
            queryId: payload.queryId,
            collectedAt: rawResult.collectedAt,
        };
        // 3. Normalize
        let normalizeResult;
        try {
            normalizeResult = await this.normalizer.normalize(rawResult, normCtx);
        }
        catch (e) {
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
            }
            catch (e) {
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
//# sourceMappingURL=NormalizationStage.js.map