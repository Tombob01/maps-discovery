/**
 * @module core/errors/BaseError
 *
 * Base error class for the maps-discovery platform.
 *
 * All domain errors extend AppError so callers can:
 *   - Distinguish domain errors from unexpected runtime errors
 *   - Access a stable `code` string for logging/alerting
 *   - Access structured `context` without string parsing
 *   - Preserve original cause chains for debugging
 */

// ---------------------------------------------------------------------------
// AppError — base class
// ---------------------------------------------------------------------------

export abstract class AppError extends Error {
  /** Stable, ALL_CAPS string code for programmatic handling. */
  abstract readonly code: string;

  /** Structured context for logging — no sensitive data. */
  readonly context: Readonly<Record<string, unknown>>;

  /** Original error that caused this one, if any. */
  override readonly cause: unknown;

  /** Override name so it matches the concrete class name. */
  override name: string;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      context?: Record<string, unknown>;
    },
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = new.target.name;
    this.cause = options?.cause;
    this.context = Object.freeze(options?.context ?? {});
    // Restore prototype chain (required when extending built-in Error in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message }
          : this.cause,
    };
  }
}
