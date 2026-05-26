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

interface ProviderWindow {
  count: number;
  windowStart: number;
}

export class RateLimitCache {
  private readonly windows = new Map<string, ProviderWindow>();

  constructor(private readonly config: RateLimitConfig) {}

  /**
   * Attempts to consume one token for the given providerId.
   * Returns `true` if the request is within the limit, `false` if rate-limited.
   */
  consume(providerId: string): boolean {
    const now = Date.now();
    const existing = this.windows.get(providerId);

    if (
      existing === undefined ||
      now - existing.windowStart >= this.config.windowMs
    ) {
      // New window
      this.windows.set(providerId, { count: 1, windowStart: now });
      return true;
    }

    if (existing.count >= this.config.maxRequests) {
      return false;
    }

    existing.count += 1;
    return true;
  }

  /**
   * Returns the remaining tokens for a provider in the current window.
   * Returns maxRequests if no window is active.
   */
  remaining(providerId: string): number {
    const now = Date.now();
    const existing = this.windows.get(providerId);

    if (
      existing === undefined ||
      now - existing.windowStart >= this.config.windowMs
    ) {
      return this.config.maxRequests;
    }

    return Math.max(0, this.config.maxRequests - existing.count);
  }

  /**
   * Returns the milliseconds until the current window resets for a provider.
   * Returns 0 if no window is active or the window has already expired.
   */
  msUntilReset(providerId: string): number {
    const now = Date.now();
    const existing = this.windows.get(providerId);

    if (existing === undefined) return 0;

    const elapsed = now - existing.windowStart;
    if (elapsed >= this.config.windowMs) return 0;

    return this.config.windowMs - elapsed;
  }

  /** Reset the window for a specific provider. */
  reset(providerId: string): void {
    this.windows.delete(providerId);
  }

  /** Reset all provider windows. */
  resetAll(): void {
    this.windows.clear();
  }
}
