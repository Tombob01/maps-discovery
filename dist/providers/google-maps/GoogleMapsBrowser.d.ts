/**
 * @module providers/google-maps/GoogleMapsBrowser
 *
 * Manages the Playwright Chromium browser lifecycle for Google Maps scraping.
 *
 * Responsibilities:
 *   - Launch and close the Chromium browser
 *   - Create and manage browser contexts (one context = one isolated session)
 *   - Apply BrowserConfig (headless, slowMo, viewport, locale, timezone)
 *   - Block unnecessary resource types to reduce bandwidth and fingerprinting
 *   - Provide human-like random delays
 *   - Detect and handle consent dialogs on first visit
 *   - Detect CAPTCHA challenges
 *
 * This class owns NO scraping logic. It is a lifecycle + utility layer.
 * The GoogleMapsAdapter calls methods here to get pages and perform actions.
 */
import { ProviderError } from "../../core/errors/ProviderError.js";
import type { Result } from "../../core/types/common.js";
import type { BrowserConfig } from "../../core/types/rate-limit.js";
import type { Page } from "playwright";
/**
 * Resolves after a random delay in [minMs, maxMs].
 * Use between page interactions to appear human.
 */
export declare function humanDelay(minMs: number, maxMs: number): Promise<void>;
/**
 * Retries an async operation with exponential backoff.
 * Returns the first successful result or re-throws the last error.
 */
export declare function withRetry<T>(operation: () => Promise<T>, maxAttempts: number, baseDelayMs: number, capMs: number, _label: string): Promise<T>;
export declare class GoogleMapsBrowser {
    private readonly config;
    private browser;
    private context;
    constructor(config: BrowserConfig);
    /**
     * Launches Chromium and creates a browser context.
     * Safe to call only once — call shutdown() first to reinitialise.
     */
    launch(): Promise<Result<void, ProviderError>>;
    /**
     * Closes all pages, the context, and the browser.
     * Idempotent — safe to call when already shut down.
     */
    shutdown(): Promise<void>;
    get isReady(): boolean;
    /**
     * Opens a new page in the existing context.
     * Applies the default timeout from config.
     */
    newPage(): Promise<Result<Page, ProviderError>>;
    /**
     * Navigates to the Google Maps search URL for a query string.
     * Waits for the results sidebar to appear before returning.
     */
    navigateToSearch(page: Page, queryText: string): Promise<Result<void, ProviderError>>;
    /**
     * Scrolls the results sidebar downward by one viewport height,
     * triggering lazy-loading of the next batch of results.
     */
    scrollResultsSidebar(page: Page): Promise<void>;
    /**
     * Returns true if the page currently shows a CAPTCHA challenge.
     * Caller should stop scraping and surface a CAPTCHA_DETECTED error.
     */
    isCaptchaPresent(page: Page): Promise<boolean>;
    /**
     * Returns true when the results feed has reached its end —
     * the "end of results" sentinel is visible.
     */
    isEndOfResults(page: Page): Promise<boolean>;
    private _dismissConsentDialog;
    private _isTimeout;
    private _defaultUserAgent;
}
//# sourceMappingURL=GoogleMapsBrowser.d.ts.map