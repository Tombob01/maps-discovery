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
import type { IPipelineStage, StageContext, StageError } from "./IPipelineStage.js";
import type { StageResult, NormalizationJobPayload } from "../core/models/Job.js";
import type { INormalizer } from "../core/interfaces/INormalizer.js";
import type { ProviderResult } from "../core/models/ProviderResult.js";
import type { BusinessRecord } from "../core/models/BusinessRecord.js";
import type { Result } from "../core/types/common.js";
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
    onSuccess?(record: BusinessRecord, payload: NormalizationJobPayload): Promise<void>;
}
export declare class NormalizationStage implements IPipelineStage<NormalizationJobPayload> {
    private readonly normalizer;
    private readonly options;
    readonly stageName: "normalization";
    constructor(normalizer: INormalizer, options: NormalizationStageOptions);
    execute(payload: NormalizationJobPayload, _ctx: StageContext): Promise<Result<StageResult, StageError>>;
}
//# sourceMappingURL=NormalizationStage.d.ts.map