/**
 * @module core/errors/ConfigurationError
 * Errors arising from invalid configuration at startup or runtime.
 */

import { AppError } from "./BaseError.js";

export type ConfigurationErrorCode =
  | "MISSING_REQUIRED_VALUE"
  | "INVALID_VALUE"
  | "INVALID_TYPE"
  | "CONFLICTING_VALUES"
  | "PROVIDER_NOT_CONFIGURED";

export class ConfigurationError extends AppError {
  override readonly code: ConfigurationErrorCode;
  readonly key?: string;

  constructor(options: {
    code: ConfigurationErrorCode;
    message: string;
    key?: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    const _o: { cause?: unknown; context?: Record<string, unknown> } = {};
    if (options.cause !== undefined) _o.cause = options.cause;
    if (options.context !== undefined) _o.context = options.context;
    super(options.message, _o);
    this.code = options.code;
    if (options.key !== undefined) this.key = options.key;
  }
}

// ---------------------------------------------------------------------------

/**
 * @module core/errors/ValidationError
 * Errors arising from invalid input data at runtime boundaries.
 */

export type ValidationErrorCode =
  | "REQUIRED_FIELD_MISSING"
  | "FIELD_TOO_LONG"
  | "FIELD_TOO_SHORT"
  | "INVALID_FORMAT"
  | "OUT_OF_RANGE"
  | "UNKNOWN_VALUE";

export interface ValidationViolation {
  readonly field: string;
  readonly code: ValidationErrorCode;
  readonly message: string;
  readonly value?: unknown;
}

export class ValidationError extends AppError {
  override readonly code = "VALIDATION_FAILED" as const;
  readonly violations: readonly ValidationViolation[];

  constructor(options: {
    message: string;
    violations: readonly ValidationViolation[];
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.violations = options.violations;
  }
}
