/**
 * @module cache/RateLimitCache
 *
 * Per-provider rate limit state using a fixed-window counter.
 *
 * Each provider gets an independent window. When the window expires it
 * resets automatically. `consume()` attempts to take one token and returns
 * whether the request is allowed.
 */
export interface RateLimitConfig {
    /** Maximum requests allowed per window. */
    readonly maxRequests: number;
    /** Window duration in milliseconds. */
    readonly windowMs: number;
}
export declare class RateLimitCache {
    private readonly config;
    private readonly windows;
    constructor(config: RateLimitConfig);
    /**
     * Attempts to consume one token for the given providerId.
     * Returns `true` if the request is within the limit, `false` if rate-limited.
     */
    consume(providerId: string): boolean;
    /**
     * Returns the remaining tokens for a provider in the current window.
     * Returns maxRequests if no window is active.
     */
    remaining(providerId: string): number;
    /**
     * Returns the milliseconds until the current window resets for a provider.
     * Returns 0 if no window is active or the window has already expired.
     */
    msUntilReset(providerId: string): number;
    /** Reset the window for a specific provider. */
    reset(providerId: string): void;
    /** Reset all provider windows. */
    resetAll(): void;
}
//# sourceMappingURL=RateLimitCache.d.ts.map