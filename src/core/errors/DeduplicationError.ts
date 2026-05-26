/**
 * @module core/errors/DeduplicationError
 * Errors arising during the deduplication stage.
 */

import { AppError } from "./BaseError.js";

export type DeduplicationErrorCode =
  | "DB_UNAVAILABLE"
  | "CACHE_UNAVAILABLE"
  | "STRATEGY_FAILED"
  | "INVALID_RECORD"
  | "FINGERPRINT_COLLISION";

export class DeduplicationError extends AppError {
  override readonly code: DeduplicationErrorCode;
  readonly strategyId?: string;

  constructor(options: {
    code: DeduplicationErrorCode;
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
