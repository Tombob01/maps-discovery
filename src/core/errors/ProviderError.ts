/**
 * @module core/errors/ProviderError
 * Errors originating inside a discovery provider.
 */

import { AppError } from "./BaseError.js";

export type ProviderErrorCode =
  | "BROWSER_LAUNCH_FAILED" // Playwright could not start
  | "BROWSER_CRASHED" // Browser died mid-session
  | "PAGE_LOAD_TIMEOUT" // Navigation timed out
  | "PAGE_LOAD_FAILED" // HTTP error (4xx/5xx) or DNS failure
  | "SELECTOR_NOT_FOUND" // Expected DOM element missing
  | "CAPTCHA_DETECTED" // Anti-bot challenge encountered
  | "RATE_LIMITED" // Provider returned 429 or equivalent
  | "BLOCKED" // IP/session permanently blocked
  | "PARSE_FAILED" // Could not extract fields from DOM/JSON
  | "PAGINATION_FAILED" // Could not advance to next page
  | "RESUME_TOKEN_STALE" // Stored token is no longer valid
  | "PROVIDER_UNAVAILABLE" // Health check failed
  | "UNEXPECTED"; // Catch-all for unclassified errors

export class ProviderError extends AppError {
  override readonly code: ProviderErrorCode;
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
  }) {
    const _o: { cause?: unknown; context?: Record<string, unknown> } = {};
    if (options.cause !== undefined) _o.cause = options.cause;
    if (options.context !== undefined) _o.context = options.context;
    super(options.message, _o);
    this.code = options.code;
    this.providerId = options.providerId;
    this.isRetryable = options.isRetryable;
  }

  static retryable(
    code: ProviderErrorCode,
    providerId: string,
    message: string,
    cause?: unknown,
  ): ProviderError {
    return new ProviderError({
      code,
      providerId,
      message,
      isRetryable: true,
      cause,
    });
  }

  static fatal(
    code: ProviderErrorCode,
    providerId: string,
    message: string,
    cause?: unknown,
  ): ProviderError {
    return new ProviderError({
      code,
      providerId,
      message,
      isRetryable: false,
      cause,
    });
  }
}
