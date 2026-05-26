/**
 * @module core/errors/ProviderError
 * Errors originating inside a discovery provider.
 */
import { AppError } from "./BaseError.js";
export type ProviderErrorCode = "BROWSER_LAUNCH_FAILED" | "BROWSER_CRASHED" | "PAGE_LOAD_TIMEOUT" | "PAGE_LOAD_FAILED" | "SELECTOR_NOT_FOUND" | "CAPTCHA_DETECTED" | "RATE_LIMITED" | "BLOCKED" | "PARSE_FAILED" | "PAGINATION_FAILED" | "RESUME_TOKEN_STALE" | "PROVIDER_UNAVAILABLE" | "UNEXPECTED";
export declare class ProviderError extends AppError {
    readonly code: ProviderErrorCode;
    readonly providerId: string;
    /** True if the worker should retry the job; false if it should give up. */
    readonly isRetryable: boolean;
    constructor(options: {
        code: ProviderErrorCode;
        providerId: string;
        message: string;
        isRetryable: boolean;
        cause?: unknown;
        context?: Record<string, unknown>;
    });
    static retryable(code: ProviderErrorCode, providerId: string, message: string, cause?: unknown): ProviderError;
    static fatal(code: ProviderErrorCode, providerId: string, message: string, cause?: unknown): ProviderError;
}
//# sourceMappingURL=ProviderError.d.ts.map