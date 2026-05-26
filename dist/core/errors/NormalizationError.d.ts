/**
 * @module core/errors/NormalizationError
 */
import { AppError } from "./BaseError.js";
export type NormalizationErrorCode = "MISSING_REQUIRED_FIELD" | "MAPPING_FAILED" | "INVALID_PROVIDER" | "INVALID_PAYLOAD" | "NORMALIZATION_FAILED";
export interface NormalizationErrorOptions {
    readonly code: NormalizationErrorCode;
    readonly message: string;
    readonly providerId: string;
    readonly rawResultId: string;
    readonly cause?: unknown;
    readonly context?: Record<string, unknown>;
}
export declare class NormalizationError extends AppError {
    readonly code: NormalizationErrorCode;
    readonly providerId: string;
    readonly rawResultId: string;
    constructor(options: NormalizationErrorOptions);
}
//# sourceMappingURL=NormalizationError.d.ts.map