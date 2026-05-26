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
export declare abstract class AppError extends Error {
    /** Stable, ALL_CAPS string code for programmatic handling. */
    abstract readonly code: string;
    /** Structured context for logging — no sensitive data. */
    readonly context: Readonly<Record<string, unknown>>;
    /** Original error that caused this one, if any. */
    readonly cause: unknown;
    /** Override name so it matches the concrete class name. */
    name: string;
    constructor(message: string, options?: {
        cause?: unknown;
        context?: Record<string, unknown>;
    });
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=BaseError.d.ts.map