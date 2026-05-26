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
import { chromium } from "playwright";
import { sel } from "./selectors.js";
import { ProviderError } from "../../core/errors/ProviderError.js";
import { ok, err } from "../../core/types/common.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROVIDER_ID = "google-maps";
/** Google Maps base URL — where all sessions start. */
const GOOGLE_MAPS_BASE_URL = "https://www.google.com/maps";
/**
 * Resource types to block — reduces data transfer and avoids ad trackers
 * that may trigger anti-bot systems.
 */
const BLOCKED_RESOURCE_TYPES = new Set(["font", "media"]);
/**
 * Domains to block outright — analytics, ads, beacons.
 * Keep this conservative: blocking too much breaks the page.
 */
const BLOCKED_URL_PATTERNS = [
    "googlesyndication.com",
    "googleadservices.com",
    "doubleclick.net",
    "google-analytics.com",
    "googletagmanager.com",
];
// ---------------------------------------------------------------------------
// Human-like delay helpers
// ---------------------------------------------------------------------------
/**
 * Returns a random integer in [min, max] inclusive.
 * Uses Math.random() — sufficient for jitter; not a security primitive.
 */
function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
/**
 * Resolves after a random delay in [minMs, maxMs].
 * Use between page interactions to appear human.
 */
export async function humanDelay(minMs, maxMs) {
    const ms = randomBetween(minMs, maxMs);
    await new Promise((resolve) => setTimeout(resolve, ms));
}
// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------
/**
 * Retries an async operation with exponential backoff.
 * Returns the first successful result or re-throws the last error.
 */
export async function withRetry(operation, maxAttempts, baseDelayMs, capMs, _label) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxAttempts)
                break;
            // Exponential backoff with cap
            const rawDelay = baseDelayMs * Math.pow(2, attempt - 1);
            const delay = Math.min(rawDelay, capMs);
            const jitter = randomBetween(0, Math.floor(delay * 0.2));
            await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }
    }
    throw lastError;
}
// ---------------------------------------------------------------------------
// GoogleMapsBrowser
// ---------------------------------------------------------------------------
export class GoogleMapsBrowser {
    config;
    browser = null;
    context = null;
    constructor(config) {
        this.config = config;
    }
    // ---------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------
    /**
     * Launches Chromium and creates a browser context.
     * Safe to call only once — call shutdown() first to reinitialise.
     */
    async launch() {
        if (this.browser !== null) {
            return ok(undefined);
        }
        try {
            this.browser = await chromium.launch({
                headless: this.config.headless,
                slowMo: this.config.slowMoMs,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--disable-extensions",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                ],
            });
            this.context = await this.browser.newContext({
                userAgent: this.config.userAgent ?? this._defaultUserAgent(),
                viewport: this.config.viewport,
                locale: this.config.locale,
                timezoneId: this.config.timezoneId,
                // Mask automation signals
                javaScriptEnabled: true,
                extraHTTPHeaders: {
                    "Accept-Language": this.config.locale,
                },
            });
            // Intercept requests to block unnecessary resources
            await this.context.route("**/*", async (route) => {
                const req = route.request();
                const resourceType = req.resourceType();
                const url = req.url();
                if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
                    await route.abort();
                    return;
                }
                const isBlocked = BLOCKED_URL_PATTERNS.some((pattern) => url.includes(pattern));
                if (isBlocked) {
                    await route.abort();
                    return;
                }
                await route.continue();
            });
            return ok(undefined);
        }
        catch (caught) {
            return err(ProviderError.fatal("BROWSER_LAUNCH_FAILED", PROVIDER_ID, `Failed to launch Chromium: ${caught instanceof Error ? caught.message : String(caught)}`, caught));
        }
    }
    /**
     * Closes all pages, the context, and the browser.
     * Idempotent — safe to call when already shut down.
     */
    async shutdown() {
        try {
            if (this.context !== null) {
                await this.context.close();
                this.context = null;
            }
        }
        catch {
            /* ignore */
        }
        try {
            if (this.browser !== null) {
                await this.browser.close();
                this.browser = null;
            }
        }
        catch {
            /* ignore */
        }
    }
    get isReady() {
        return this.browser !== null && this.context !== null;
    }
    // ---------------------------------------------------------------------------
    // Page management
    // ---------------------------------------------------------------------------
    /**
     * Opens a new page in the existing context.
     * Applies the default timeout from config.
     */
    async newPage() {
        if (this.context === null) {
            return err(ProviderError.fatal("BROWSER_LAUNCH_FAILED", PROVIDER_ID, "Browser context not initialised — call launch() first"));
        }
        try {
            const page = await this.context.newPage();
            page.setDefaultTimeout(this.config.timeoutMs);
            page.setDefaultNavigationTimeout(this.config.timeoutMs);
            // Mask navigator.webdriver and other automation signals
            await page.addInitScript(() => {
                Object.defineProperty(navigator, "webdriver", { get: () => undefined });
            });
            return ok(page);
        }
        catch (caught) {
            return err(ProviderError.retryable("BROWSER_CRASHED", PROVIDER_ID, `Failed to open new page: ${caught instanceof Error ? caught.message : String(caught)}`, caught));
        }
    }
    // ---------------------------------------------------------------------------
    // Navigation helpers
    // ---------------------------------------------------------------------------
    /**
     * Navigates to the Google Maps search URL for a query string.
     * Waits for the results sidebar to appear before returning.
     */
    async navigateToSearch(page, queryText) {
        const encoded = encodeURIComponent(queryText);
        const url = `${GOOGLE_MAPS_BASE_URL}/search/${encoded}`;
        try {
            await page.goto(url, { waitUntil: "domcontentloaded" });
            // Handle cookie / consent dialog if present
            await this._dismissConsentDialog(page);
            // Wait for the results feed to be present
            await page.waitForSelector(sel("resultsSidebar"), {
                timeout: this.config.timeoutMs,
            });
            return ok(undefined);
        }
        catch (caught) {
            if (this._isTimeout(caught)) {
                return err(ProviderError.retryable("PAGE_LOAD_TIMEOUT", PROVIDER_ID, `Timed out waiting for results on query: "${queryText}"`, caught));
            }
            return err(ProviderError.retryable("PAGE_LOAD_FAILED", PROVIDER_ID, `Navigation failed for query: "${queryText}": ${caught instanceof Error ? caught.message : String(caught)}`, caught));
        }
    }
    /**
     * Scrolls the results sidebar downward by one viewport height,
     * triggering lazy-loading of the next batch of results.
     */
    async scrollResultsSidebar(page) {
        // Pass the selector as a serialisable argument — correct Playwright pattern.
        // The cast satisfies TypeScript's evaluate signature while the runtime
        // function receives the selector string from the second argument.
        const fn = new Function("selectorStr", `
      var el = document.querySelector(selectorStr);
      if (el) { el.scrollTop += el.clientHeight; }
    `);
        await page.evaluate(fn, sel("resultsSidebar"));
    }
    // ---------------------------------------------------------------------------
    // Detection helpers
    // ---------------------------------------------------------------------------
    /**
     * Returns true if the page currently shows a CAPTCHA challenge.
     * Caller should stop scraping and surface a CAPTCHA_DETECTED error.
     */
    async isCaptchaPresent(page) {
        try {
            const captcha = await page.$(sel("captchaFrame"));
            return captcha !== null;
        }
        catch {
            return false;
        }
    }
    /**
     * Returns true when the results feed has reached its end —
     * the "end of results" sentinel is visible.
     */
    async isEndOfResults(page) {
        try {
            const sentinel = await page.$(sel("endOfResultsSentinel"));
            if (sentinel !== null)
                return true;
            const noMore = await page.$(sel("noMoreResultsText"));
            return noMore !== null;
        }
        catch {
            return false;
        }
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    async _dismissConsentDialog(page) {
        try {
            const consent = await page.$(sel("consentDialog"));
            if (consent !== null) {
                await humanDelay(300, 800);
                await consent.click();
                await humanDelay(500, 1200);
            }
        }
        catch {
            /* consent dialog may not be present — ignore */
        }
    }
    _isTimeout(err) {
        if (err instanceof Error) {
            return err.message.includes("Timeout") || err.message.includes("timeout");
        }
        return false;
    }
    _defaultUserAgent() {
        // A representative Chrome 125 UA string — kept in sync with Playwright's
        // bundled Chromium version. Update when upgrading Playwright.
        return ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/125.0.0.0 Safari/537.36");
    }
}
//# sourceMappingURL=GoogleMapsBrowser.js.map