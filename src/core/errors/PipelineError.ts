/**
 * @module core/errors/PipelineError
 * Errors arising in pipeline orchestration (coordinator, worker lifecycle).
 */

import { AppError } from "./BaseError.js";

import type { QueueName, StageName } from "../models/Job.js";

export type PipelineErrorCode =
  | "STAGE_INIT_FAILED"
  | "WORKER_CRASHED"
  | "QUEUE_UNAVAILABLE"
  | "JOB_ENQUEUE_FAILED"
  | "CHECKPOINT_WRITE_FAILED"
  | "RUN_NOT_FOUND"
  | "RUN_ALREADY_RUNNING"
  | "INVALID_JOB_PAYLOAD";

export class PipelineError extends AppError {
  override readonly code: PipelineErrorCode;
  readonly stage?: StageName;
  readonly queue?: QueueName;
  readonly jobId?: string;

  constructor(options: {
    code: PipelineErrorCode;
    message: string;
    stage?: StageName;
    queue?: QueueName;
    jobId?: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    const _o: { cause?: unknown; context?: Record<string, unknown> } = {};
    if (options.cause !== undefined) _o.cause = options.cause;
    if (options.context !== undefined) _o.context = options.context;
    super(options.message, _o);
    this.code = options.code;
    if (options.stage !== undefined) this.stage = options.stage;
    if (options.queue !== undefined) this.queue = options.queue;
    if (options.jobId !== undefined) this.jobId = options.jobId;
  }
}

// ---------------------------------------------------------------------------

/**
 * @module core/errors/QueryEngineError
 * Errors arising in query generation and expansion.
 */

export type QueryEngineErrorCode =
  | "INVALID_SEED"
  | "GEO_RESOLUTION_FAILED"
  | "EXPANSION_STRATEGY_FAILED"
  | "ALL_STRATEGIES_EXHAUSTED"
  | "NO_QUERIES_GENERATED"
  | "MAX_VARIANTS_EXCEEDED";

export class QueryEngineError extends AppError {
  override readonly code: QueryEngineErrorCode;
  readonly strategyId?: string;

  constructor(options: {
    code: QueryEngineErrorCode;
    message: string;
    strategyId?: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    const _o: { cause?: unknown; context?: Record<string, unknown> } = {};
    if (options.cause !== undefined) _o.cause = options.cause;
    if (options.context !== undefined) _o.context = options.context;
    super(options.message, _o);
    this.code = options.code;
    if (options.strategyId !== undefined) this.strategyId = options.strategyId;
  }
}

// ---------------------------------------------------------------------------

/**
 * @module core/errors/GeoResolutionError
 * Errors arising when resolving a GeoTarget to coordinates.
 */

export type GeoResolutionErrorCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_INPUT";

export class GeoResolutionError extends AppError {
  override readonly code: GeoResolutionErrorCode;

  constructor(options: {
    code: GeoResolutionErrorCode;
    message: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    const _o: { cause?: unknown; context?: Record<string, unknown> } = {};
    if (options.cause !== undefined) _o.cause = options.cause;
    if (options.context !== undefined) _o.context = options.context;
    super(options.message, _o);
    this.code = options.code;
  }
}
