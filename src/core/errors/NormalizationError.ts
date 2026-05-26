/**
 * @module core/errors/NormalizationError
 */
import { AppError } from "./BaseError.js";

export type NormalizationErrorCode =
  | "MISSING_REQUIRED_FIELD"
  | "MAPPING_FAILED"
  | "INVALID_PROVIDER"
  | "INVALID_PAYLOAD"
  | "NORMALIZATION_FAILED";

export interface NormalizationErrorOptions {
  readonly code: NormalizationErrorCode;
  readonly message: string;
  readonly providerId: string;
  readonly rawResultId: string;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
}

export class NormalizationError extends AppError {
  override readonly code: NormalizationErrorCode;
  readonly providerId: string;
  readonly rawResultId: string;

  constructor(options: NormalizationErrorOptions) {
    super(options.message, {
      cause: options.cause,
      ...(options.context !== undefined && { context: options.context }),
    });
    this.code = options.code;
    this.providerId = options.providerId;
    this.rawResultId = options.rawResultId;
  }
}
