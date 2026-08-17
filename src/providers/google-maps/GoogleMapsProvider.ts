/**
 * @module providers/google-maps/GoogleMapsProvider
 *
 * Google Maps business discovery provider.
 *
 * Implements IBrowserProvider (extends IProvider).
 *
 * Discovery algorithm -- two-phase:
 *   Phase 1 (collection):
 *     1. Navigate to Google Maps search for the resolved query text
 *     2. Scroll the sidebar to load results progressively
 *     3. For each new result card: read href via getCardListingUrl(), extract
 *        placeId, deduplicate, push { url, placeId, position } to collectedUrls
 *     4. Never click cards or navigate away from the search feed during Phase 1
 *     5. Continue scrolling until end-of-results or maxResults URLs collected
 *   Phase 2 (extraction):
 *     6. For each collected URL: page.goto(url) -> waitForSelector(div[role="main"])
 *     7. Call adapter.extractFromDetailUrl() to extract all fields
 *     8. Yield a ProviderResult containing the GoogleMapsRawPayload
 *     9. On each yield, attach a ResumeToken encoding progress
 *
 * Resumability:
 *   - ResumeToken carries { strategy: "cursor", pageRequest: { cursor } }
 *     where cursor encodes the set of already-yielded result IDs
 *   - On restart, the provider skips any result whose ID was already yielded
 *
 * Error handling:
 *   - CAPTCHA detected -> throw ProviderError.fatal (session is compromised)
 *   - Page load timeout -> retry up to policy.retry.maxAttempts
 *   - Browser crash -> throw ProviderError.retryable (job will be requeued)
 *   - Individual URL navigation failure -> log and skip (non-fatal)
 *   - Individual URL extraction failure -> log and skip (non-fatal)
 */

import { type GoogleMapsAdapter, extractPlaceId } from "./GoogleMapsAdapter.js";
import {
  type GoogleMapsBrowser,
  humanDelay,
  withRetryResult,
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
// ---------------------------------------------------------------------------

const log = {
  debug: (...args: unknown[]): void => {
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

/** How many scroll attempts producing no new cards before declaring end-of-results. */
const MAX_EMPTY_SCROLL_ATTEMPTS = 4;

/** Delay between Phase 2 page.goto() calls to avoid triggering rate limits (ms). */
const PHASE2_NAV_DELAY_MIN_MS = 800;
const PHASE2_NAV_DELAY_MAX_MS = 1800;

// ---------------------------------------------------------------------------
// Collected URL entry -- Phase 1 output, Phase 2 input
// ---------------------------------------------------------------------------

interface CollectedUrl {
  readonly url: string;
  readonly placeId: string | undefined;
  readonly position: number;
}

// ---------------------------------------------------------------------------
// Resume cursor -- what's stored in ResumeToken.pageRequest.cursor
// ---------------------------------------------------------------------------

interface GoogleMapsCursor {
  readonly yieldedIds: readonly string[];
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
    supportsResultCount: false,
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

  async checkHealth(): Promise<ProviderHealth> {
    if (!this._browserReady) {
      return {
        status: "unavailable",
        reason: "BROWSER_LAUNCH_FAILED: Browser not initialised - call initializeBrowser() first",
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

  async shutdown(): Promise<void> {
    await this.closeBrowser();
  }

  async *discover(
    query: ResolvedQuery,
    options?: DiscoveryOptions,
  ): AsyncGenerator<ProviderResult, void, undefined> {
    if (!this._browserReady) {
      throw ProviderError.fatal(
        "BROWSER_LAUNCH_FAILED",
        PROVIDER_ID,
        "BROWSER_LAUNCH_FAILED: Browser not initialised - call initializeBrowser() before discover()",
      );
    }

    const maxResults = options?.maxResults ?? GOOGLE_MAPS_MAX_RESULTS;
    const placeIdCache = options?.placeIdWebsiteCache;

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

    const pageResult = await this.browser.newPage();
    if (!pageResult.ok) throw pageResult.error;
    const page = pageResult.value;

    try {
      const navResult = await withRetryResult(
        () => this.browser.navigateToSearch(page, query.rawText),
        this.policy.retry.maxAttempts,
        this.policy.retry.backoffBaseMs,
        this.policy.retry.backoffCapMs,
        `navigate:${query.rawText}`,
      );
      if (!navResult.ok) throw navResult.error;

      // -------------------------------------------------------------------
      // Phase 1: scroll the feed and collect card hrefs
      // No clicks. No navigation away from the search results page.
      // -------------------------------------------------------------------

      const seenPlaceIds = new Set<string>(resumedIds);
      const collectedUrls: CollectedUrl[] = [];
      let emptyScrolls = 0;
      let lastCardCount = 0;

      while (collectedUrls.length < maxResults) {
        if (await this.browser.isCaptchaPresent(page)) {
          throw ProviderError.fatal(
            "CAPTCHA_DETECTED",
            PROVIDER_ID,
            `CAPTCHA detected during discovery of query: "${query.rawText}"`,
          );
        }

        const cards = await this.adapter.getResultCards(page);
        const cardCount = cards.length;

        if (cardCount === lastCardCount) {
          if (await this.browser.isEndOfResults(page)) break;
          emptyScrolls++;
          if (emptyScrolls >= MAX_EMPTY_SCROLL_ATTEMPTS) break;
          await this.browser.scrollResultsSidebar(page);
          await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
          continue;
        }

        emptyScrolls = 0;
        const processFromIndex = Math.min(lastCardCount, cardCount);
        lastCardCount = cardCount;

        for (
          let i = processFromIndex;
          i < cards.length && collectedUrls.length < maxResults;
          i++
        ) {
          const card = cards[i];
          if (card === undefined) continue;

          const href = await this.adapter.getCardListingUrl(card);
          if (href === undefined) {
            log.debug(`phase1: card i=${i} has no href -- skipping`);
            continue;
          }

          const absoluteUrl = href.startsWith("http")
            ? href
            : new URL(href, page.url()).href;

          const placeId = extractPlaceId(absoluteUrl);
          const resultId = placeId ?? this._syntheticId(absoluteUrl);

          if (seenPlaceIds.has(resultId)) continue;
          seenPlaceIds.add(resultId);

          collectedUrls.push({ url: absoluteUrl, placeId, position: i + 1 });
          log.debug(`phase1: collected i=${i} placeId=${placeId ?? "none"} total=${collectedUrls.length}`);
        }

        if (await this.browser.isEndOfResults(page)) break;
        await this.browser.scrollResultsSidebar(page);
        await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
      }

      log.debug(`phase1 complete: collected ${collectedUrls.length} URLs`);

      // -------------------------------------------------------------------
      // Phase 2: visit each collected URL and extract business data
      // -------------------------------------------------------------------

      let totalYielded = 0;
      let urlsVisited = 0;
      let successfulExtractions = 0;
      let failedNavigations = 0;
      let failedExtractions = 0;
      let skippedViaWebsiteCache = 0;

      for (const entry of collectedUrls) {
        if (totalYielded >= maxResults) break;

        // Website-driven Phase 2 skip (per-run, optional): if this Place
        // ID was already observed earlier in this run WITH a website,
        // the expensive detail-page navigation is redundant -- skip it.
        // A Place ID observed without a website remains eligible for a
        // retry, since a later occurrence may successfully surface one.
        // Phase 1 collection above is entirely unaffected by this check.
        const identityKey = entry.placeId ?? this._syntheticId(entry.url);
        if (
          placeIdCache !== undefined &&
          placeIdCache.status(identityKey) === "seen-with-website"
        ) {
          skippedViaWebsiteCache++;
          log.debug(`phase2: skipping ${entry.url} -- known with website in this run (id=${identityKey})`);
          continue;
        }

        urlsVisited++;
        try {
          await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForSelector('div[role="main"]', { timeout: 10000 });
        } catch (err) {
          failedNavigations++;
          log.error(`phase2: navigation failed for ${entry.url} -- skipping`, err);
          continue;
        }

        let payload: GoogleMapsRawPayload | undefined;
        try {
          payload = await this.adapter.extractFromDetailUrl(
            page,
            entry.url,
            query.rawText,
            entry.position,
          );
        } catch (err) {
          failedExtractions++;
          log.error(`phase2: extraction failed for ${entry.url} -- skipping`, err);
          continue;
        }

        successfulExtractions++;

        if (placeIdCache !== undefined) {
          const hasWebsite =
            typeof payload.website === "string" && payload.website.trim().length > 0;
          placeIdCache.record(identityKey, hasWebsite);
        }

        const resultId =
          payload.placeId ??
          entry.placeId ??
          this._syntheticId(payload.listingUrl ?? `position:${entry.position}`);

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
        totalYielded++;

        if (totalYielded < collectedUrls.length) {
          await humanDelay(PHASE2_NAV_DELAY_MIN_MS, PHASE2_NAV_DELAY_MAX_MS);
        }
      }

      const successRate = urlsVisited > 0 ? Math.round((successfulExtractions / urlsVisited) * 100) : 0;
      log.debug(`[phase2-stats] visited=${urlsVisited} extracted=${successfulExtractions} failed_navigation=${failedNavigations} failed_extraction=${failedExtractions} skipped_via_website_cache=${skippedViaWebsiteCache} success_rate=${successRate}%`);
      log.debug(`phase2 complete: yielded ${totalYielded} results`);

    } finally {
      await page.close().catch(() => {
        /* ignore */
      });
    }
  }

  private _syntheticId(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    }
    return `synthetic:${(hash >>> 0).toString(16)}`;
  }
}
