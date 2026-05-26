/**
 * @module core/errors/NormalizationError
 * Errors arising during ProviderResult → BusinessRecord conversion.
 */

import { AppError } from "./BaseError.js";

export type NormalizationErrorCode =
  | "MISSING_REQUIRED_FIELD"
  | "MAPPING_FAILED"
  | "INVALID_PAYLOAD"
  | "FIELD_PARSE_FAILED"
  | "FINGERPRINT_GENERATION_FAILED";

export class NormalizationError extends AppError {
  override readonly code: NormalizationErrorCode;
  readonly providerId: string;
  readonly rawResultId: string;

  constructor(options: {
    code: NormalizationErrorCode;
    providerId: string;
    rawResultId: string;
    message: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    const _o: { cause?: unknown; context?: Record<string, unknown> } = {};
    if (options.cause !== undefined) _o.cause = options.cause;
    if (options.context !== undefined) _o.context = options.context;
    super(options.message, _o);
    this.code = options.code;
    this.providerId = options.providerId;
    this.rawResultId = options.rawResultId;
  }
}
