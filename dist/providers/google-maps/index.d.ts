/**
 * @module providers/google-maps
 *
 * Public surface for the Google Maps provider package.
 *
 * Primary entry point: createGoogleMapsProvider()
 * All internal components (browser, adapter) are wired here via DI.
 */
import { GoogleMapsProvider } from "./GoogleMapsProvider.js";
import type { ScrapingPolicy } from "../../core/types/rate-limit.js";
export { GoogleMapsProvider } from "./GoogleMapsProvider.js";
export { GoogleMapsBrowser } from "./GoogleMapsBrowser.js";
export { GoogleMapsAdapter } from "./GoogleMapsAdapter.js";
export type { GoogleMapsRawPayload } from "./GoogleMapsRawPayload.js";
export { SELECTORS, sel } from "./selectors.js";
export type { SelectorKey } from "./selectors.js";
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
export declare const DEFAULT_GOOGLE_MAPS_POLICY: ScrapingPolicy;
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
export declare function createGoogleMapsProvider(policy?: ScrapingPolicy): GoogleMapsProvider;
//# sourceMappingURL=index.d.ts.map