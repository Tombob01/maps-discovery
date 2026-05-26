/**
 * @module providers/google-maps/GoogleMapsProvider
 *
 * Google Maps business discovery provider.
 *
 * Implements IBrowserProvider (extends IProvider).
 *
 * Discovery algorithm:
 *   1. Navigate to Google Maps search for the resolved query text
 *   2. Scroll the sidebar to load results progressively
 *   3. For each new result card: open detail panel, extract raw payload
 *   4. Yield a ProviderResult containing the GoogleMapsRawPayload
 *   5. Continue scrolling until end-of-results or maxResults reached
 *   6. On each yield, attach a ResumeToken encoding scroll progress
 *
 * Resumability:
 *   - ResumeToken carries { strategy: "cursor", pageRequest: { cursor } }
 *     where cursor = the index of the last successfully yielded result
 *   - On restart, the provider scrolls past already-collected results
 *     before yielding new ones
 *
 * Error handling:
 *   - CAPTCHA detected → throw ProviderError.fatal (session is compromised)
 *   - Page load timeout → retry up to policy.retry.maxAttempts
 *   - Browser crash → throw ProviderError.retryable (job will be requeued)
 *   - Individual card extraction failure → log and skip (non-fatal)
 */
import { type GoogleMapsAdapter } from "./GoogleMapsAdapter.js";
import { type GoogleMapsBrowser } from "./GoogleMapsBrowser.js";
import type { IBrowserProvider, ProviderCapabilities, ProviderHealth, DiscoveryOptions } from "../../core/interfaces/IProvider.js";
import type { ProviderResult } from "../../core/models/ProviderResult.js";
import type { ResolvedQuery } from "../../core/models/Query.js";
import type { Result } from "../../core/types/common.js";
import type { ScrapingPolicy } from "../../core/types/rate-limit.js";
declare const PROVIDER_ID = "google-maps";
declare const DISPLAY_NAME = "Google Maps";
export declare class GoogleMapsProvider implements IBrowserProvider {
    readonly id: typeof PROVIDER_ID;
    readonly displayName: typeof DISPLAY_NAME;
    readonly policy: ScrapingPolicy;
    readonly capabilities: ProviderCapabilities;
    private readonly browser;
    private readonly adapter;
    private _browserReady;
    constructor(policy: ScrapingPolicy, browser: GoogleMapsBrowser, adapter: GoogleMapsAdapter);
    get browserReady(): boolean;
    initializeBrowser(): Promise<Result<void>>;
    closeBrowser(): Promise<void>;
    checkHealth(): Promise<ProviderHealth>;
    shutdown(): Promise<void>;
    discover(query: ResolvedQuery, options?: DiscoveryOptions): AsyncGenerator<ProviderResult, void, undefined>;
    /**
     * Creates a synthetic result ID when no Place ID is available.
     * Deterministic given the same input, but not a cryptographic hash.
     */
    private _syntheticId;
}
export {};
//# sourceMappingURL=GoogleMapsProvider.d.ts.map