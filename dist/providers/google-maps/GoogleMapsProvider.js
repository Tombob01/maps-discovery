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
import {} from "./GoogleMapsAdapter.js";
import { humanDelay, withRetry, } from "./GoogleMapsBrowser.js";
import { ProviderError } from "../../core/errors/ProviderError.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROVIDER_ID = "google-maps";
const DISPLAY_NAME = "Google Maps";
/**
 * Maximum results Google Maps typically surfaces for any query.
 * The sidebar rarely shows more than ~120 results regardless of scrolling.
 */
const GOOGLE_MAPS_MAX_RESULTS = 120;
/** Delay range between scrolling and checking for new cards (ms). */
const SCROLL_SETTLE_MIN_MS = 800;
const SCROLL_SETTLE_MAX_MS = 1800;
/** How many scroll attempts before declaring end-of-results. */
const MAX_EMPTY_SCROLL_ATTEMPTS = 4;
function encodeCursor(cursor) {
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
function decodeCursor(encoded) {
    try {
        const json = Buffer.from(encoded, "base64url").toString("utf8");
        const parsed = JSON.parse(json);
        if (typeof parsed === "object" &&
            parsed !== null &&
            "yieldedCount" in parsed &&
            typeof parsed.yieldedCount === "number" &&
            "queryHash" in parsed &&
            typeof parsed.queryHash === "string") {
            return parsed;
        }
        return null;
    }
    catch {
        return null;
    }
}
function buildResumeToken(yieldedCount, queryHash) {
    const cursor = { yieldedCount, queryHash };
    return {
        strategy: "cursor",
        pageRequest: {
            kind: "cursor",
            cursor: encodeCursor(cursor),
        },
        providerContext: { yieldedCount },
        createdAt: Date.now(),
    };
}
// ---------------------------------------------------------------------------
// GoogleMapsProvider
// ---------------------------------------------------------------------------
export class GoogleMapsProvider {
    id = PROVIDER_ID;
    displayName = DISPLAY_NAME;
    policy;
    capabilities = {
        supportsGeoFilter: true,
        supportsResultCount: false, // Google Maps does not expose total count
        supportsHours: true,
        supportsPriceLevel: true,
        supportsCoordinates: true,
        maxResultsPerQuery: GOOGLE_MAPS_MAX_RESULTS,
    };
    browser;
    adapter;
    _browserReady = false;
    constructor(policy, browser, adapter) {
        this.policy = policy;
        this.browser = browser;
        this.adapter = adapter;
    }
    // ---------------------------------------------------------------------------
    // IBrowserProvider — lifecycle
    // ---------------------------------------------------------------------------
    get browserReady() {
        return this._browserReady;
    }
    async initializeBrowser() {
        const result = await this.browser.launch();
        if (result.ok) {
            this._browserReady = true;
        }
        return result;
    }
    async closeBrowser() {
        await this.browser.shutdown();
        this._browserReady = false;
    }
    // ---------------------------------------------------------------------------
    // IProvider — health check
    // ---------------------------------------------------------------------------
    async checkHealth() {
        if (!this._browserReady) {
            return {
                status: "unavailable",
                reason: "Browser not initialised — call initializeBrowser() first",
            };
        }
        if (!this.browser.isReady) {
            return {
                status: "unavailable",
                reason: "Browser instance is not running",
            };
        }
        return { status: "healthy" };
    }
    // ---------------------------------------------------------------------------
    // IProvider — shutdown
    // ---------------------------------------------------------------------------
    async shutdown() {
        await this.closeBrowser();
    }
    // ---------------------------------------------------------------------------
    // IProvider — discover (async generator)
    // ---------------------------------------------------------------------------
    async *discover(query, options) {
        // Guard: browser must be ready
        if (!this._browserReady) {
            throw ProviderError.fatal("BROWSER_LAUNCH_FAILED", PROVIDER_ID, "Browser not initialised — call initializeBrowser() before discover()");
        }
        const maxResults = options?.maxResults ?? GOOGLE_MAPS_MAX_RESULTS;
        // ── Decode resume cursor ─────────────────────────────────────────────────
        let skipCount = 0; // how many results to skip (already yielded in prior session)
        if (options?.resumeToken !== undefined) {
            const token = options.resumeToken;
            if (token.strategy === "cursor" && token.pageRequest.kind === "cursor") {
                const decoded = decodeCursor(token.pageRequest.cursor);
                if (decoded === null || decoded.queryHash !== query.queryHash) {
                    throw ProviderError.fatal("RESUME_TOKEN_STALE", PROVIDER_ID, "Resume token is stale or belongs to a different query");
                }
                skipCount = decoded.yieldedCount;
            }
        }
        // ── Open a new page ──────────────────────────────────────────────────────
        const pageResult = await this.browser.newPage();
        if (!pageResult.ok)
            throw pageResult.error;
        const page = pageResult.value;
        try {
            // ── Navigate to search ─────────────────────────────────────────────────
            const navResult = await withRetry(() => this.browser.navigateToSearch(page, query.rawText), this.policy.retry.maxAttempts, this.policy.retry.backoffBaseMs, this.policy.retry.backoffCapMs, `navigate:${query.rawText}`);
            if (!navResult.ok)
                throw navResult.error;
            // ── Scraping loop ──────────────────────────────────────────────────────
            const seenPlaceIds = new Set();
            let totalYielded = 0;
            let emptyScrolls = 0;
            let lastCardCount = 0;
            while (totalYielded < maxResults) {
                // Check for CAPTCHA before each batch
                if (await this.browser.isCaptchaPresent(page)) {
                    throw ProviderError.fatal("CAPTCHA_DETECTED", PROVIDER_ID, `CAPTCHA detected during discovery of query: "${query.rawText}"`);
                }
                // Collect all cards currently visible
                const cards = await this.adapter.getResultCards(page);
                const cardCount = cards.length;
                if (cardCount === lastCardCount) {
                    // No new cards loaded since last scroll
                    if (await this.browser.isEndOfResults(page))
                        break;
                    emptyScrolls++;
                    if (emptyScrolls >= MAX_EMPTY_SCROLL_ATTEMPTS)
                        break;
                    // Scroll to load more
                    await this.browser.scrollResultsSidebar(page);
                    await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
                    continue;
                }
                emptyScrolls = 0;
                lastCardCount = cardCount;
                for (let i = 0; i < cards.length && totalYielded < maxResults; i++) {
                    const card = cards[i];
                    if (card === undefined)
                        continue;
                    // Skip cards we've already yielded in a previous session
                    if (i < skipCount)
                        continue;
                    // Apply inter-request delay
                    if (i > 0) {
                        const delay = this.policy.rateLimit.minDelayBetweenRequestsMs +
                            Math.floor(Math.random() * this.policy.rateLimit.jitterMs);
                        await humanDelay(delay, delay + this.policy.rateLimit.jitterMs);
                    }
                    // Extract raw payload
                    let payload;
                    try {
                        payload = await this.adapter.extractFromCard(page, card, query.rawText, i + 1);
                    }
                    catch (extractErr) {
                        // Non-fatal: skip this card and continue
                        continue;
                    }
                    // Derive a stable result ID — prefer Place ID, fall back to URL hash
                    const resultId = payload.placeId ??
                        this._syntheticId(payload.listingUrl ?? `position:${i}`);
                    // Skip duplicates within the same session
                    if (seenPlaceIds.has(resultId))
                        continue;
                    seenPlaceIds.add(resultId);
                    totalYielded++;
                    const resumeToken = buildResumeToken(totalYielded, query.queryHash);
                    const result = {
                        providerId: PROVIDER_ID,
                        providerResultId: resultId,
                        rawPayload: payload,
                        sourceUrl: payload.listingUrl ?? null,
                        collectedAt: new Date(),
                        runId: query.runId,
                        queryId: query.id,
                        resumeToken,
                    };
                    yield result;
                }
                // After processing the current batch, scroll for more
                if (await this.browser.isEndOfResults(page))
                    break;
                await this.browser.scrollResultsSidebar(page);
                await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
            }
        }
        finally {
            // Always close the page — even if the generator was abandoned mid-run
            await page.close().catch(() => {
                /* ignore */
            });
        }
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    /**
     * Creates a synthetic result ID when no Place ID is available.
     * Deterministic given the same input, but not a cryptographic hash.
     */
    _syntheticId(input) {
        // Simple djb2 hash for a short deterministic string
        let hash = 5381;
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
        }
        return `synthetic:${(hash >>> 0).toString(16)}`;
    }
}
//# sourceMappingURL=GoogleMapsProvider.js.map