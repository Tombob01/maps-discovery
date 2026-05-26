/**
 * @module core/errors/DeduplicationError
 * Errors arising during the deduplication stage.
 */
import { AppError } from "./BaseError.js";
export type DeduplicationErrorCode = "DB_UNAVAILABLE" | "CACHE_UNAVAILABLE" | "STRATEGY_FAILED" | "INVALID_RECORD" | "FINGERPRINT_COLLISION";
export declare class DeduplicationError extends AppError {
    readonly code: DeduplicationErrorCode;
    readonly strategyId?: string;
    constructor(options: {
        code: DeduplicationErrorCode;
        message: string;
        strategyId?: string;
        cause?: unknown;
        context?: Record<string, unknown>;
    });
}
//# sourceMappingURL=DeduplicationError.d.ts.map