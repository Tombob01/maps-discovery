/**
 * @module providers/google-maps/GoogleMapsProvider
 *
 * Google Maps business discovery provider.
 *
 * Implements IBrowserProvider (extends IProvider).
 *
 * Discovery algorithm:
 *   1. Navigate to Google Maps search for the resolved query text
 *   2. Capture the live search URL immediately after navigation succeeds
 *   3. Scroll the sidebar to load results progressively
 *   4. For each new result card: open detail panel, extract raw payload
 *   5. After extraction, restore the search page via explicit goto(searchUrl)
 *      rather than page.goBack() — goBack() is non-deterministic on Maps SPA
 *   6. Yield a ProviderResult containing the GoogleMapsRawPayload
 *   7. Continue scrolling until end-of-results or maxResults reached
 *   8. On each yield, attach a ResumeToken encoding scroll progress
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
 *   - Search page restoration failure → log and skip remaining cards in batch
 */

import { type GoogleMapsAdapter } from "./GoogleMapsAdapter.js";
import {
  type GoogleMapsBrowser,
  humanDelay,
  withRetry,
} from "./GoogleMapsBrowser.js";
import { ProviderError } from "../../core/errors/ProviderError.js";

import type { GoogleMapsRawPayload } from "./GoogleMapsRawPayload.js";
import type {
  IBrowserProvider,
  ProviderCapabilities,
  ProviderHealth,
  DiscoveryOptions,
} from "../../core/interfaces/IProvider.js";
import type { ProviderResult } from "../../core/models/ProviderResult.js";
import type { ResolvedQuery } from "../../core/models/Query.js";
import type { Result } from "../../core/types/common.js";
import type { ResumeToken } from "../../core/types/pagination.js";
import type { ScrapingPolicy } from "../../core/types/rate-limit.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_ID = "google-maps";
const DISPLAY_NAME = "Google Maps";

// ---------------------------------------------------------------------------
// Minimal structured logger
//
// All scraping diagnostics go through this helper so they can be silenced in
// production by setting LOG_LEVEL or by switching the implementation.
// Uses console.debug (filtered out by default in most log aggregators) rather
// than console.log, so discovery runs are not noisy in production.
// Errors always go to console.error regardless of level.
// ---------------------------------------------------------------------------

const log = {
  debug: (...args: unknown[]): void => {
    // Replace with a structured logger (pino, winston, etc.) if needed.
    // console.debug is suppressed by default in most production log pipelines.
    console.debug("[discover]", ...args);
  },
  error: (...args: unknown[]): void => {
    console.error("[discover]", ...args);
  },
};

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

/**
 * Maximum total scroll attempts when re-hydrating feed depth after search page restoration.
 * Each scroll typically loads ~9 additional cards; 5 attempts × ~9 cards = ~45 additional
 * cards on top of the initial ~9, covering most real-world result sets.
 */
const MAX_FEED_DEPTH_RESTORE_ATTEMPTS = 5;

/**
 * How many consecutive scroll attempts that produce no new cards before giving up.
 * Google Maps lazy rendering is asynchronous — a single non-increasing scroll does NOT
 * mean the feed is exhausted. Require this many stagnant scrolls before bailing out.
 */
const MAX_FEED_DEPTH_STAGNANT_ATTEMPTS = 2;

/**
 * Timeout (ms) to wait for the results feed after restoring the search page.
 * Shorter than the full page timeout — if the feed doesn't appear within
 * this window after an explicit goto(), something is wrong.
 */
const SEARCH_RESTORE_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Resume cursor — what's stored in ResumeToken.pageRequest.cursor
// ---------------------------------------------------------------------------

interface GoogleMapsCursor {
  /** IDs of results already yielded — used for identity-based resume. */
  readonly yieldedIds: readonly string[];
  /** The search query text — used to verify the token is still valid. */
  readonly queryHash: string;
}

function encodeCursor(cursor: GoogleMapsCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(encoded: string): GoogleMapsCursor | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "yieldedIds" in parsed &&
      Array.isArray((parsed as { yieldedIds: unknown }).yieldedIds) &&
      "queryHash" in parsed &&
      typeof (parsed as { queryHash: unknown }).queryHash === "string"
    ) {
      return parsed as GoogleMapsCursor;
    }
    return null;
  } catch {
    return null;
  }
}

function buildResumeToken(
  yieldedIds: readonly string[],
  queryHash: string,
): ResumeToken {
  const cursor: GoogleMapsCursor = { yieldedIds, queryHash };
  return {
    strategy: "cursor",
    pageRequest: {
      kind: "cursor",
      cursor: encodeCursor(cursor),
    },
    providerContext: { yieldedCount: yieldedIds.length },
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// GoogleMapsProvider
// ---------------------------------------------------------------------------

export class GoogleMapsProvider implements IBrowserProvider {
  readonly id: typeof PROVIDER_ID = PROVIDER_ID;
  readonly displayName: typeof DISPLAY_NAME = DISPLAY_NAME;
  readonly policy: ScrapingPolicy;

  readonly capabilities: ProviderCapabilities = {
    supportsGeoFilter: true,
    supportsResultCount: false, // Google Maps does not expose total count
    supportsHours: true,
    supportsPriceLevel: true,
    supportsCoordinates: true,
    maxResultsPerQuery: GOOGLE_MAPS_MAX_RESULTS,
  };

  private readonly browser: GoogleMapsBrowser;
  private readonly adapter: GoogleMapsAdapter;
  private _browserReady = false;

  constructor(
    policy: ScrapingPolicy,
    browser: GoogleMapsBrowser,
    adapter: GoogleMapsAdapter,
  ) {
    this.policy = policy;
    this.browser = browser;
    this.adapter = adapter;
  }

  // ---------------------------------------------------------------------------
  // IBrowserProvider — lifecycle
  // ---------------------------------------------------------------------------

  get browserReady(): boolean {
    return this._browserReady;
  }

  async initializeBrowser(): Promise<Result<void>> {
    const result = await this.browser.launch();
    if (result.ok) {
      this._browserReady = true;
    }
    return result;
  }

  async closeBrowser(): Promise<void> {
    await this.browser.shutdown();
    this._browserReady = false;
  }

  // ---------------------------------------------------------------------------
  // IProvider — health check
  // ---------------------------------------------------------------------------

  async checkHealth(): Promise<ProviderHealth> {
    if (!this._browserReady) {
      return {
        status: "unavailable",
        reason: "BROWSER_LAUNCH_FAILED: Browser not initialised — call initializeBrowser() first",
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

  async shutdown(): Promise<void> {
    await this.closeBrowser();
  }

  // ---------------------------------------------------------------------------
  // IProvider — discover (async generator)
  // ---------------------------------------------------------------------------

  async *discover(
    query: ResolvedQuery,
    options?: DiscoveryOptions,
  ): AsyncGenerator<ProviderResult, void, undefined> {
    // Guard: browser must be ready
    if (!this._browserReady) {
      throw ProviderError.fatal(
        "BROWSER_LAUNCH_FAILED",
        PROVIDER_ID,
        "BROWSER_LAUNCH_FAILED: Browser not initialised — call initializeBrowser() before discover()",
      );
    }

    const maxResults = options?.maxResults ?? GOOGLE_MAPS_MAX_RESULTS;

    // ── Decode resume cursor ─────────────────────────────────────────────────
    // Identity-based resume: pre-populate seenPlaceIds from the token so we
    // skip any result whose ID was already yielded, regardless of position.
    const resumedIds = new Set<string>();

    if (options?.resumeToken !== undefined) {
      const token = options.resumeToken;
      if (token.strategy === "cursor" && token.pageRequest.kind === "cursor") {
        const decoded = decodeCursor(token.pageRequest.cursor);
        if (decoded === null || decoded.queryHash !== query.queryHash) {
          throw ProviderError.fatal(
            "RESUME_TOKEN_STALE",
            PROVIDER_ID,
            "Resume token is stale or belongs to a different query",
          );
        }
        for (const id of decoded.yieldedIds) {
          resumedIds.add(id);
        }
      }
    }

    // ── Open a new page ───────────────────────────────────────────────────────
    const pageResult = await this.browser.newPage();
    if (!pageResult.ok) throw pageResult.error;
    const page = pageResult.value;

    try {
      // ── Navigate to search ────────────────────────────────────────────────
      const navResult = await withRetry(
        () => this.browser.navigateToSearch(page, query.rawText),
        this.policy.retry.maxAttempts,
        this.policy.retry.backoffBaseMs,
        this.policy.retry.backoffCapMs,
        `navigate:${query.rawText}`,
      );
      if (!navResult.ok) throw navResult.error;

      // ── Capture the live search URL immediately after navigation ──────────
      // We use this for deterministic restoration after detail panel visits.
      // page.goBack() is unreliable on Maps because:
      //   - Maps is a SPA: the "back" entry in browser history may be a
      //     partially-constructed state, not a fully-rendered search results page
      //   - The sidebar / feed DOM is not guaranteed to be reconstructed from
      //     history; Maps often re-renders an empty or wrong state
      //   - The consent redirect can intercept goBack() on first runs
      // Explicit goto(searchUrl) is deterministic: Maps always renders the
      // full results feed for a direct search URL request.
      const searchUrl = page.url();
      log.debug(`searchUrl captured: ${searchUrl}`);

      // ── Scraping loop ─────────────────────────────────────────────────────
      const seenPlaceIds = new Set<string>(resumedIds);
      let totalYielded = 0;
      let emptyScrolls = 0;
      let lastCardCount = 0;

      while (totalYielded < maxResults) {
        // Check for CAPTCHA before each batch
        if (await this.browser.isCaptchaPresent(page)) {
          throw ProviderError.fatal(
            "CAPTCHA_DETECTED",
            PROVIDER_ID,
            `CAPTCHA detected during discovery of query: "${query.rawText}"`,
          );
        }

        // Collect all cards currently visible
        const cards = await this.adapter.getResultCards(page);
        const cardCount = cards.length;

        if (cardCount === lastCardCount) {
          // No new cards loaded since last scroll
          if (await this.browser.isEndOfResults(page)) break;

          emptyScrolls++;
          if (emptyScrolls >= MAX_EMPTY_SCROLL_ATTEMPTS) break;

          // Scroll to load more
          await this.browser.scrollResultsSidebar(page);
          await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
          continue;
        }

        emptyScrolls = 0;
        const processFromIndex = lastCardCount;
        lastCardCount = cardCount;

        for (
          let i = processFromIndex;
          i < cards.length && totalYielded < maxResults;
          i++
        ) {
          const card = cards[i];
          if (card === undefined) continue;

          // Apply inter-request delay
          if (i > 0) {
            const delay =
              this.policy.rateLimit.minDelayBetweenRequestsMs +
              Math.floor(Math.random() * this.policy.rateLimit.jitterMs);
            await humanDelay(delay, delay + this.policy.rateLimit.jitterMs);
          }

          // Capture how many cards were loaded before we navigate away.
          // After restoration, goto() resets the feed scroll to the top and
          // Maps only renders the first ~9 cards again. We need to re-scroll
          // to at least this depth before re-querying cards.
          const previousCardCount = cards.length;

          // Extract raw payload — this clicks the card and opens the detail panel,
          // navigating the page away from the search results URL.
          let payload: GoogleMapsRawPayload;
          try {
            payload = await this.adapter.extractFromCard(
              page,
              card,
              query.rawText,
              i + 1, // 1-based position
            );
          } catch (extractErr) {
            log.error(
              `extractFromCard failed at i=${i}:`,
              extractErr instanceof Error
                ? extractErr.message
                : String(extractErr),
            );
            // The click inside extractFromCard may have partially fired —
            // the URL could be mid-transition. Only restore if we actually
            // navigated away; if the URL is still the search URL, the page
            // is already in the right state and a redundant goto() would
            // reload the entire feed unnecessarily.
            if (page.url() !== searchUrl) {
              await this._restoreSearchPage(page, searchUrl, i);
            }
            continue;
          }

          // ── Restore search page after detail extraction ───────────────────
          // extractFromCard() always fires card.click(), which triggers a Maps
          // SPA navigation. We check page.url() before restoring: if the URL
          // already matches searchUrl (e.g. click fired but detail panel never
          // opened, leaving the page on the search results), skip the goto()
          // to avoid an unnecessary full feed reload.
          //
          // We use explicit goto(searchUrl) rather than goBack() because:
          //   - goBack() relies on browser history state, which Maps does not
          //     reliably populate for SPA transitions
          //   - A direct URL request always produces a fully-rendered feed
          let restored = true;
          if (page.url() !== searchUrl) {
            restored = await this._restoreSearchPage(page, searchUrl, i);
          } else {
            log.debug(`i=${i} URL unchanged — skipping restoration goto`);
          }

          if (!restored) {
            // Could not restore the search page — the session may be broken
            // (consent dialog, CAPTCHA, network error). Abort this batch.
            // The cards processed so far have already been yielded; the run
            // will end with a partial result set rather than crashing.
            log.error(`search page restoration failed at i=${i} — aborting batch`);
            break;
          }

          // Re-query cards after restoring feed depth.
          // goto() resets scroll to top; _restoreFeedDepth scrolls until
          // at least previousCardCount cards are rendered again (or bails out).
          const freshCards = await this._restoreFeedDepth(page, previousCardCount);
          log.debug(
            `i=${i} post-restore cards: ${freshCards.length} (target: ${previousCardCount})`,
          );

          // Derive a stable result ID — prefer Place ID, fall back to URL hash
          const resultId =
            payload.placeId ??
            this._syntheticId(payload.listingUrl ?? `position:${i}`);

          // Skip duplicates within the same session
          if (seenPlaceIds.has(resultId)) continue;
          seenPlaceIds.add(resultId);

          totalYielded++;

          const resumeToken = buildResumeToken(
            Array.from(seenPlaceIds),
            query.queryHash,
          );

          const result: ProviderResult = {
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

          // After yielding, update lastCardCount to the freshly-queried count
          // so the outer loop doesn't re-process cards we already handled.
          // Note: freshCards.length may differ from cards.length if Maps
          // rendered additional results while we were on the detail panel.
          lastCardCount = freshCards.length;
        }

        // After processing the current batch, scroll for more
        if (await this.browser.isEndOfResults(page)) break;
        await this.browser.scrollResultsSidebar(page);
        await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
      }
    } finally {
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
   * Restores the search results page by navigating explicitly to the captured
   * search URL, then waiting for the results feed to be ready.
   *
   * Returns true if the feed is present and ready for card queries.
   * Returns false if navigation or the feed wait times out — caller should
   * treat this as a non-recoverable batch error and stop processing.
   *
   * Why explicit goto() instead of goBack():
   *   Google Maps is a SPA. When a card detail panel opens, Maps updates
   *   the URL and re-renders the right panel in-place — it does NOT push a
   *   clean history entry that goBack() can reliably reconstruct. The back
   *   entry may resolve to an intermediate SPA state with no sidebar feed,
   *   or trigger a consent/redirect interception on some sessions. A direct
   *   goto() with the original search URL bypasses all of that: Maps always
   *   constructs a full search results page from a direct URL request.
   */
  private async _restoreSearchPage(
    page: import("playwright").Page,
    searchUrl: string,
    cardIndex: number,
  ): Promise<boolean> {
    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('div[role="feed"]', {
        timeout: SEARCH_RESTORE_TIMEOUT_MS,
      });
      log.debug(`search page restored after card i=${cardIndex}`);
      return true;
    } catch (err) {
      log.error(
        `search page restoration failed after card i=${cardIndex}:`,
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  /**
   * After restoring the search page via goto(), Maps resets the feed scroll
   * position to the top and only renders the first batch of cards (~9).
   * This helper re-scrolls the feed until at least `targetCount` cards are
   * visible, mirroring the depth that was loaded before the detail panel visit.
   *
   * Returns the card array at the point we stop (either target reached,
   * scroll stalled, or max attempts exhausted). The caller uses this as
   * `freshCards` to avoid a redundant extra getResultCards() call.
   *
   * Bounded by MAX_FEED_DEPTH_RESTORE_ATTEMPTS to prevent infinite loops.
   */
  private async _restoreFeedDepth(
    page: import('playwright').Page,
    targetCount: number,
  ): Promise<object[]> {
    let currentCards = await this.adapter.getResultCards(page);
    if (currentCards.length >= targetCount) {
      log.debug(
        `_restoreFeedDepth: target ${targetCount} met immediately (${currentCards.length} cards)`,
      );
      return currentCards;
    }

    // Google Maps lazy rendering is asynchronous after a full page restoration.
    // A single scroll often produces no immediate DOM change even though more
    // cards will appear after a short settle delay. Track consecutive stagnant
    // attempts separately from total attempts so one empty scroll doesn't abort.
    let stagnantAttempts = 0;
    let previousRenderedCount = currentCards.length;

    for (let attempt = 0; attempt < MAX_FEED_DEPTH_RESTORE_ATTEMPTS; attempt++) {
      await this.browser.scrollResultsSidebar(page);
      // Use a slightly longer settle window after restoration — Maps lazy rendering
      // is slower after a full goto() than during normal incremental scrolling.
      await humanDelay(SCROLL_SETTLE_MAX_MS, SCROLL_SETTLE_MAX_MS + 500);
      currentCards = await this.adapter.getResultCards(page);

      const grew = currentCards.length > previousRenderedCount;
      if (grew) {
        stagnantAttempts = 0;
        log.debug(
          `_restoreFeedDepth attempt ${attempt + 1}: ${previousRenderedCount} -> ${currentCards.length}/${targetCount} cards (growing)`,
        );
        previousRenderedCount = currentCards.length;
      } else {
        stagnantAttempts++;
        log.debug(
          `_restoreFeedDepth attempt ${attempt + 1}: ${currentCards.length}/${targetCount} cards (stagnant ${stagnantAttempts}/${MAX_FEED_DEPTH_STAGNANT_ATTEMPTS})`,
        );
      }

      if (currentCards.length >= targetCount) {
        log.debug(`_restoreFeedDepth: target ${targetCount} reached after ${attempt + 1} scrolls`);
        break;
      }
      if (stagnantAttempts >= MAX_FEED_DEPTH_STAGNANT_ATTEMPTS) {
        log.debug(
          `_restoreFeedDepth: bailing after ${stagnantAttempts} stagnant scrolls (best: ${currentCards.length}/${targetCount})`,
        );
        break;
      }
    }

    return currentCards;
  }

  /**
   * Creates a synthetic result ID when no Place ID is available.
   * Deterministic given the same input, but not a cryptographic hash.
   */
  private _syntheticId(input: string): string {
    // Simple djb2 hash for a short deterministic string
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    }
    return `synthetic:${(hash >>> 0).toString(16)}`;
  }
}
