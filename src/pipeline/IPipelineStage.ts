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

// ---------------------------------------------------------------------------
// Stage context — passed into every execute() call
// ---------------------------------------------------------------------------

export interface StageContext {
  readonly runId: string;
  readonly stageId: string; // unique per execution instance (for logging)
  readonly attempt: number; // delivery attempt count (1-based)
}

// ---------------------------------------------------------------------------
// IPipelineStage
// ---------------------------------------------------------------------------

export interface IPipelineStage<TPayload> {
  readonly stageName: StageName;

  /**
   * Execute one job.
   * Returns Ok<StageResult> on success (including graceful skips).
   * Returns Err<StageError> only for infrastructure failures that should
   * trigger a nack + retry.
   */
  execute(
    payload: TPayload,
    ctx: StageContext,
  ): Promise<Result<StageResult, StageError>>;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type StageErrorCode =
  | "DEPENDENCY_UNAVAILABLE"
  | "UNEXPECTED_ERROR"
  | "TIMEOUT"
  | "INVALID_PAYLOAD";

export interface StageError {
  readonly code: StageErrorCode;
  readonly stage: StageName;
  readonly message: string;
  readonly cause?: unknown;
}
