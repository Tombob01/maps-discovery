/**
 * @module core/errors/ConfigurationError
 * Errors arising from invalid configuration at startup or runtime.
 */
import { AppError } from "./BaseError.js";
export type ConfigurationErrorCode = "MISSING_REQUIRED_VALUE" | "INVALID_VALUE" | "INVALID_TYPE" | "CONFLICTING_VALUES" | "PROVIDER_NOT_CONFIGURED";
export declare class ConfigurationError extends AppError {
    readonly code: ConfigurationErrorCode;
    readonly key?: string;
    constructor(options: {
        code: ConfigurationErrorCode;
        message: string;
        key?: string;
        cause?: unknown;
        context?: Record<string, unknown>;
    });
}
/**
 * @module core/errors/ValidationError
 * Errors arising from invalid input data at runtime boundaries.
 */
export type ValidationErrorCode = "REQUIRED_FIELD_MISSING" | "FIELD_TOO_LONG" | "FIELD_TOO_SHORT" | "INVALID_FORMAT" | "OUT_OF_RANGE" | "UNKNOWN_VALUE";
export interface ValidationViolation {
    readonly field: string;
    readonly code: ValidationErrorCode;
    readonly message: string;
    readonly value?: unknown;
}
export declare class ValidationError extends AppError {
    readonly code: "VALIDATION_FAILED";
    readonly violations: readonly ValidationViolation[];
    constructor(options: {
        message: string;
        violations: readonly ValidationViolation[];
        cause?: unknown;
    });
}
//# sourceMappingURL=ConfigurationError.d.ts.map