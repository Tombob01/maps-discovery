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

// ---------------------------------------------------------------------------
// Resume cursor — what's stored in ResumeToken.pageRequest.cursor
// ---------------------------------------------------------------------------

interface GoogleMapsCursor {
  /** IDs of results already yielded � used for identity-based resume. */
  readonly yieldedIds: readonly string[];
  /** The search query text � used to verify the token is still valid. */
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
        "Browser not initialised — call initializeBrowser() before discover()",
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

    // ── Open a new page ──────────────────────────────────────────────────────
    const pageResult = await this.browser.newPage();
    if (!pageResult.ok) throw pageResult.error;
    const page = pageResult.value;

    try {
      // ── Navigate to search ─────────────────────────────────────────────────
      const navResult = await withRetry(
        () => this.browser.navigateToSearch(page, query.rawText),
        this.policy.retry.maxAttempts,
        this.policy.retry.backoffBaseMs,
        this.policy.retry.backoffCapMs,
        `navigate:${query.rawText}`,
      );
      if (!navResult.ok) throw navResult.error;

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
        console.log(`[discover] cardCount=${cardCount} lastCardCount=${lastCardCount} totalYielded=${totalYielded} emptyScrolls=${emptyScrolls}`);

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

        console.log(`[discover] for-loop: starting i=${processFromIndex} cards.length=${cards.length}`);
        for (let i = processFromIndex; i < cards.length && totalYielded < maxResults; i++) {
          const card = cards[i];
          if (card === undefined) continue;

          // Skip cards already yielded in a previous session (identity-based � handled by seenPlaceIds pre-population)

          // Apply inter-request delay
          if (i > 0) {
            const delay =
              this.policy.rateLimit.minDelayBetweenRequestsMs +
              Math.floor(Math.random() * this.policy.rateLimit.jitterMs);
            await humanDelay(delay, delay + this.policy.rateLimit.jitterMs);
          }

          // Extract raw payload
          let payload: GoogleMapsRawPayload;
          try {
            payload = await this.adapter.extractFromCard(
              page,
              card,
              query.rawText,
              i + 1, // 1-based position
            );
          } catch (extractErr) {
            console.log(`[discover] extractFromCard failed at i=${i}:`, extractErr instanceof Error ? extractErr.message : String(extractErr));
            continue;
          }
          // Navigate back to search results — extractFromCard may have navigated away.
          // Re-query cards to avoid stale ElementHandle references.
          try {
            await page.goBack({ waitUntil: "domcontentloaded" });
            await page.waitForSelector('div[role="feed"]', { timeout: 5000 });
          } catch {
            // best-effort recovery — if goBack fails, continue with stale page
          }
          // Re-fetch cards after navigation to avoid stale handles
          const freshCards = await this.adapter.getResultCards(page);
          // If card is gone after navigation (DOM changed), skip this index
          if (freshCards[i] === undefined) continue;

          // Derive a stable result ID — prefer Place ID, fall back to URL hash
          const resultId =
            payload.placeId ??
            this._syntheticId(payload.listingUrl ?? `position:${i}`);

          console.log(`[discover] i=${i} resultId=${resultId} seen=${seenPlaceIds.has(resultId)}`);
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
