/**
 * @module pipeline/IPipelineStage
 *
 * A pipeline stage consumes jobs from one queue and optionally produces
 * jobs onto downstream queues.
 *
 * Each stage is independently runnable and testable.
 */
import type { Result } from "../core/types/common.js";
import type { StageResult, StageName } from "../core/models/Job.js";
export interface StageContext {
    readonly runId: string;
    readonly stageId: string;
    readonly attempt: number;
}
export interface IPipelineStage<TPayload> {
    readonly stageName: StageName;
    /**
     * Execute one job.
     * Returns Ok<StageResult> on success (including graceful skips).
     * Returns Err<StageError> only for infrastructure failures that should
     * trigger a nack + retry.
     */
    execute(payload: TPayload, ctx: StageContext): Promise<Result<StageResult, StageError>>;
}
export type StageErrorCode = "DEPENDENCY_UNAVAILABLE" | "UNEXPECTED_ERROR" | "TIMEOUT" | "INVALID_PAYLOAD";
export interface StageError {
    readonly code: StageErrorCode;
    readonly stage: StageName;
    readonly message: string;
    readonly cause?: unknown;
}
//# sourceMappingURL=IPipelineStage.d.ts.map