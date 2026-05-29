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

      // Capture the search URL immediately after navigation.
      // Used to detect when extractFromCard navigates away and to restore the page.
      const searchUrl = page.url();

      // ── Scraping loop ──────────────────────────────────────────────────────
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
        // processFromIndex must never exceed cardCount — if lastCardCount is
        // higher than cardCount (feed collapsed after a deferred restoration),
        // clamping prevents the inner loop from starting past the array end
        // and silently running zero iterations, which would regress lastCardCount.
        const processFromIndex = Math.min(lastCardCount, cardCount);
        lastCardCount = cardCount;

        for (let i = processFromIndex; i < cards.length && totalYielded < maxResults; i++) {
          const card = cards[i];
          if (card === undefined) continue;

          // Apply inter-request delay
          if (i > 0) {
            const delay =
              this.policy.rateLimit.minDelayBetweenRequestsMs +
              Math.floor(Math.random() * this.policy.rateLimit.jitterMs);
            await humanDelay(delay, delay + this.policy.rateLimit.jitterMs);
          }

          // Extract raw payload — may navigate away from search results
          let payload: GoogleMapsRawPayload | undefined;
          try {
            payload = await this.adapter.extractFromCard(
              page,
              card,
              query.rawText,
              i + 1,
            );
          } catch {
            // Extraction failed — attempt restoration if URL changed, then skip card
          }

          // Restore search results page if extractFromCard navigated away.
          // Strategy: try goBack() first — preserves scroll depth and rendered cards.
          // Fall back to goto(searchUrl) only if goBack() fails or feed is missing.
          const currentUrl = page.url();
          if (currentUrl !== searchUrl) {
            let restored = false;
            try {
              await page.goBack({ waitUntil: "domcontentloaded" });
              const feed = await page.waitForSelector('div[role="feed"]', { timeout: 5000 }).catch(() => null);
              if (feed !== null) {
                restored = true;
                log.debug(`i=${i} restored via goBack()`);
              }
            } catch {
              // goBack failed — fall through to goto()
            }
            if (!restored) {
              try {
                await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
                await page.waitForSelector('div[role="feed"]', { timeout: 5000 });
                restored = true;
                log.debug(`i=${i} restored via goto(searchUrl)`);
              } catch {
                // Both failed — abort batch gracefully
                break;
              }
            }
            if (restored) {
              const _restoredCards = await this._restoreFeedDepth(page, lastCardCount);
              log.debug(`post-restore i=${i} available=${_restoredCards.length} card_exists=${_restoredCards[i] !== undefined}`);
              if (_restoredCards[i] === undefined) {
                // Feed shorter than current index after restoration.
                // Do NOT update lastCardCount — keep it at its pre-extraction value
                // so the outer scroll loop sees cardCount > lastCardCount after
                // loading more cards and correctly processes the next batch.
                log.debug(`i=${i} out of restored feed (${_restoredCards.length} cards) — deferring to outer scroll loop`);
                break;
              }
              // If goBack() restored more cards than the current batch had
              // AND we are at the last card of this batch, update lastCardCount
              // so the outer loop processes the extra cards in the next iteration.
              // For mid-batch cards, leave lastCardCount unchanged so the outer
              // loop scrolls for more after the batch completes normally.
              if (_restoredCards.length > lastCardCount) {
                log.debug(`post-restore feed grew: ${lastCardCount} -> ${_restoredCards.length} cards (lastCardCount unchanged — owned by outer loop)`);
              }
            }
          }

          // Skip if extraction failed
          if (payload === undefined) continue;

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
