/**
 * @module core/types/rate-limit
 * Rate-limit and scraping-behaviour configuration shapes.
 * These are read-only data contracts — no enforcement logic lives here.
 */
export interface RateLimitConfig {
    /** Maximum requests per minute across all concurrent workers. */
    readonly requestsPerMinute: number;
    /** Hard floor between any two consecutive requests (ms). */
    readonly minDelayBetweenRequestsMs: number;
    /**
     * Jitter window added on top of minDelay to avoid thundering-herd.
     * Actual delay = minDelay + random(0, jitterMs).
     */
    readonly jitterMs: number;
    /** Max number of requests in flight simultaneously. */
    readonly maxConcurrent: number;
}
export type BackoffStrategy = "fixed" | "linear" | "exponential";
export interface RetryConfig {
    readonly maxAttempts: number;
    readonly backoffStrategy: BackoffStrategy;
    /** Base delay in ms (meaning depends on strategy). */
    readonly backoffBaseMs: number;
    /** Upper bound on backoff delay regardless of strategy (ms). */
    readonly backoffCapMs: number;
    /** HTTP status codes that should trigger a retry. */
    readonly retryableStatusCodes: readonly number[];
}
export interface BrowserConfig {
    readonly headless: boolean;
    /** If true, record a HAR trace for debugging. */
    readonly recordHar: boolean;
    readonly userAgent: string | null;
    readonly viewport: ViewportSize;
    readonly timeoutMs: number;
    /** Artificial slow-down for conservative scraping (ms). */
    readonly slowMoMs: number;
    /** Locale forwarded in Accept-Language header. */
    readonly locale: string;
    /** Timezone ID (e.g. "Africa/Lagos"). */
    readonly timezoneId: string;
}
export interface ViewportSize {
    readonly width: number;
    readonly height: number;
}
/**
 * Policy applied to a single provider instance.
 * Combines rate-limit, retry, and browser settings into one object
 * so providers receive a single config reference.
 */
export interface ScrapingPolicy {
    readonly rateLimit: RateLimitConfig;
    readonly retry: RetryConfig;
    readonly browser: BrowserConfig;
    /**
     * If true, the provider should bail after the first recoverable error
     * rather than retrying. Useful for conservative initial runs.
     */
    readonly conservativeMode: boolean;
}
//# sourceMappingURL=rate-limit.d.ts.map