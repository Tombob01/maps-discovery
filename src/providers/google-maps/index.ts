/**
 * @module providers/google-maps
 *
 * Public surface for the Google Maps provider package.
 *
 * Primary entry point: createGoogleMapsProvider()
 * All internal components (browser, adapter) are wired here via DI.
 */

import { GoogleMapsAdapter } from "./GoogleMapsAdapter.js";
import { GoogleMapsBrowser } from "./GoogleMapsBrowser.js";
import { GoogleMapsProvider } from "./GoogleMapsProvider.js";

import type { ScrapingPolicy } from "../../core/types/rate-limit.js";

// ---------------------------------------------------------------------------
// Re-exports — public surface
// ---------------------------------------------------------------------------

export { GoogleMapsProvider } from "./GoogleMapsProvider.js";
export { GoogleMapsBrowser } from "./GoogleMapsBrowser.js";
export { GoogleMapsAdapter } from "./GoogleMapsAdapter.js";
export type { GoogleMapsRawPayload } from "./GoogleMapsRawPayload.js";
export { SELECTORS, sel } from "./selectors.js";
export type { SelectorKey } from "./selectors.js";

// ---------------------------------------------------------------------------
// Default scraping policy — conservative, production-safe defaults
// ---------------------------------------------------------------------------

/**
 * Conservative default policy for the Google Maps provider.
 *
 * Tune these values via environment variables or by passing your own
 * ScrapingPolicy to createGoogleMapsProvider().
 *
 * Defaults are deliberately slow:
 *   - 2 requests per minute maximum
 *   - 3 second floor between requests
 *   - Headless off in development, on in production
 *   - slowMo 150ms — renders page interactions more human-like
 */
export const DEFAULT_GOOGLE_MAPS_POLICY: ScrapingPolicy = {
  rateLimit: {
    requestsPerMinute: 2,
    minDelayBetweenRequestsMs: 3_000,
    jitterMs: 2_000,
    maxConcurrent: 1,
  },
  retry: {
    maxAttempts: 3,
    backoffStrategy: "exponential",
    backoffBaseMs: 5_000,
    backoffCapMs: 60_000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
  },
  browser: {
    headless: true,
    recordHar: false,
    userAgent: null, // uses GoogleMapsBrowser default UA
    viewport: { width: 1280, height: 800 },
    timeoutMs: 30_000,
    slowMoMs: 150,
    locale: "en-US",
    timezoneId: "Africa/Lagos",
  },
  conservativeMode: true,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fully wired GoogleMapsProvider with injected dependencies.
 *
 * @param policy - Scraping policy. Defaults to DEFAULT_GOOGLE_MAPS_POLICY.
 *
 * @example
 * const provider = createGoogleMapsProvider();
 * await provider.initializeBrowser();
 * try {
 *   for await (const result of provider.discover(resolvedQuery)) {
 *     await persistResult(result);
 *   }
 * } finally {
 *   await provider.shutdown();
 * }
 */
export function createGoogleMapsProvider(
  policy: ScrapingPolicy = DEFAULT_GOOGLE_MAPS_POLICY,
): GoogleMapsProvider {
  const browser = new GoogleMapsBrowser(policy.browser);
  const adapter = new GoogleMapsAdapter();
  return new GoogleMapsProvider(policy, browser, adapter);
}
