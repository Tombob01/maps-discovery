/**
 * @module core/errors/NormalizationError
 * Errors arising during ProviderResult → BusinessRecord conversion.
 */
import { AppError } from "./BaseError.js";
export type NormalizationErrorCode = "MISSING_REQUIRED_FIELD" | "MAPPING_FAILED" | "INVALID_PAYLOAD" | "FIELD_PARSE_FAILED" | "FINGERPRINT_GENERATION_FAILED";
export declare class NormalizationError extends AppError {
    readonly code: NormalizationErrorCode;
    readonly providerId: string;
    readonly rawResultId: string;
    constructor(options: {
        code: NormalizationErrorCode;
        providerId: string;
        rawResultId: string;
        message: string;
        cause?: unknown;
        context?: Record<string, unknown>;
    });
}
//# sourceMappingURL=NormalizationError.d.ts.map