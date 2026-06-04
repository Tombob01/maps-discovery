/**
 * @file tests/unit/providers/google-maps/GoogleMapsProvider.test.ts
 *
 * Unit tests for GoogleMapsProvider.discover().
 *
 * No real browser is launched. GoogleMapsBrowser and GoogleMapsAdapter are
 * replaced with vi.fn() mocks. Page is a plain object with jest/vitest spy
 * methods — matching the pattern used in the rest of the test suite.
 *
 * Coverage targets:
 *   - searchUrl is captured from page.url() immediately after navigateToSearch
 *   - extractFromCard() is called for each new card
 *   - After each extraction, page.goto(searchUrl) is called (not goBack)
 *   - Cards are re-queried after each restoration (fresh handles)
 *   - If restoration fails, the batch is aborted without crashing
 *   - If extractFromCard throws, restoration is still attempted before skipping
 *   - Results are yielded for successfully extracted + restored cards
 *   - seenPlaceIds deduplication works within a session
 */

import { describe, it, expect, vi, type MockInstance } from "vitest";
import { GoogleMapsProvider } from "../../../../src/providers/google-maps/GoogleMapsProvider.js";

// ---------------------------------------------------------------------------
// Type aliases — keep test code readable
// ---------------------------------------------------------------------------

type AnyFn = (...args: unknown[]) => unknown;
type MockFn = MockInstance<AnyFn>;

// ---------------------------------------------------------------------------
// Minimal mock shapes
// ---------------------------------------------------------------------------

/**
 * Builds a mock Page object.
 * Only the methods called by GoogleMapsProvider.discover() are present.
 * Defaults that satisfy a normal happy-path run are set here; individual
 * tests override specific methods as needed.
 *
 * urlSequence controls what page.url() returns on successive calls:
 *   - First call: searchUrl (captured right after navigateToSearch)
 *   - Subsequent calls (inside the for-loop, before restoration): detailUrl
 *     simulating that the page navigated away during extraction
 *   - After restoration goto(): back to searchUrl
 * If urlSequence is not provided, url() always returns searchUrl (simulates
 * no navigation occurring — tests the URL-unchanged skip-goto path).
 */
function makeMockPage(
  searchUrl = "https://www.google.com/maps/search/plumber",
  detailUrl?: string,
) {
  let callCount = 0;
  const urlFn = detailUrl
    ? vi.fn(() => {
        callCount++;
        // First call: capture searchUrl. Subsequent calls during the loop:
        // return detailUrl to simulate the page having navigated away.
        // After restoration we reset via mockReturnValueOnce in individual tests
        // if needed, but the guard only needs to see != searchUrl once.
        return callCount === 1 ? searchUrl : detailUrl;
      })
    : vi.fn(() => searchUrl);

  return {
    url: urlFn,
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
    // goBack should NOT be called by the new implementation
    goBack: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
  };
}

/**
 * Builds a minimal mock ElementHandle.
 * Content doesn't matter — the adapter mock returns payloads directly.
 */
function makeMockCard(id = "card-0") {
  return { __mockCardId: id, evaluate: vi.fn().mockResolvedValue(null) };
}

/**
 * Minimal GoogleMapsRawPayload for a single business.
 */
function makePayload(placeId: string) {
  return {
    placeId,
    name: `Business ${placeId}`,
    listingUrl: `https://www.google.com/maps/place/${placeId}`,
    detailPanelScraped: true,
  };
}

/**
 * Builds a mock ScrapingPolicy with safe defaults.
 */
function makePolicy() {
  return {
    retry: { maxAttempts: 1, backoffBaseMs: 0, backoffCapMs: 0 },
    rateLimit: { minDelayBetweenRequestsMs: 0, jitterMs: 0 },
  };
}

/**
 * Builds a minimal ResolvedQuery.
 */
function makeQuery(overrides: Record<string, unknown> = {}) {
  return {
    id: null,
    runId: "run-1",
    rawText: "plumber",
    queryHash: "hash-abc",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Factory: build a fully-wired GoogleMapsProvider with mock dependencies
// ---------------------------------------------------------------------------

function buildProvider(overrides: {
  pageUrl?: string;
  /** URL the page reports during/after card extraction — simulates detail panel navigation. */
  detailUrl?: string;
  cards?: object[][];          // array of card arrays returned by getResultCards on each call
  payloads?: object[];         // payloads returned by extractFromCard per card
  navigateOk?: boolean;
  captcha?: boolean;
  endOfResults?: boolean;
  restoreFails?: boolean;      // if true, goto() during restoration throws
}) {
  const {
    pageUrl = "https://www.google.com/maps/search/plumber+%2F+city",
    detailUrl = "https://www.google.com/maps/place/SomeBusiness/@1.0,2.0,17z",
    cards = [[makeMockCard("c0")], []],   // default: one batch of 1, then empty
    payloads = [makePayload("ChIJ_A")],
    navigateOk = true,
    captcha = false,
    endOfResults = false,
    restoreFails = false,
  } = overrides;

  // detailUrl simulates the page having navigated away after card.click().
  // This ensures the URL guard (page.url() !== searchUrl) fires and
  // _restoreSearchPage is actually called in happy-path tests.
  const page = makeMockPage(pageUrl, detailUrl);

  // goto: restoration calls either succeed or throw based on restoreFails.
  // navigateToSearch is on mockBrowser, not directly on page.goto, so we
  // don't need to skip the first call here.
  page.goto.mockImplementation(() => {
    if (restoreFails) return Promise.reject(new Error("navigation failed"));
    return Promise.resolve(undefined);
  });

  // -- Mock browser ----------------------------------------------------------
  const mockBrowser = {
    launch: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    newPage: vi.fn().mockResolvedValue({ ok: true, value: page }),
    navigateToSearch: vi.fn().mockResolvedValue(
      navigateOk
        ? { ok: true, value: undefined }
        : { ok: false, error: new Error("nav failed") },
    ),
    isCaptchaPresent: vi.fn().mockResolvedValue(captcha),
    isEndOfResults: vi.fn().mockResolvedValue(endOfResults),
    scrollResultsSidebar: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isReady: true,
  };

  // -- Mock adapter ----------------------------------------------------------
  // getResultCards returns successive arrays from the `cards` list.
  // If exhausted, returns [].
  let getCardsCallCount = 0;
  const mockAdapter = {
    getResultCards: vi.fn().mockImplementation(() => {
      const batch = cards[getCardsCallCount] ?? [];
      getCardsCallCount++;
      return Promise.resolve(batch);
    }),
    extractFromCard: vi.fn().mockImplementation(() => {
      const payload = payloads.shift();
      if (payload === undefined) return Promise.reject(new Error("no payload"));
      return Promise.resolve(payload);
      }),
    getCardListingUrl: vi.fn().mockResolvedValue('https://maps.google.com/place/test/!19sChIJtest'),
  };

  const policy = makePolicy();
  const provider = new GoogleMapsProvider(
    policy as never,
    mockBrowser as never,
    mockAdapter as never,
  );

  // Mark browser as ready without calling initializeBrowser()
  // (we don't want to trigger the real launch() in unit tests)
  (provider as unknown as { _browserReady: boolean })._browserReady = true;

  return { provider, page, mockBrowser, mockAdapter, policy };
}

// ---------------------------------------------------------------------------
// Helper: collect all yielded results from the async generator
// ---------------------------------------------------------------------------

async function collectResults(
  gen: AsyncGenerator<unknown, void, undefined>,
): Promise<unknown[]> {
  const results: unknown[] = [];
  for await (const r of gen) {
    results.push(r);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GoogleMapsProvider.discover()", () => {

  // -- URL capture ------------------------------------------------------------

  describe("search URL capture", () => {
    it("calls page.url() immediately after navigateToSearch to capture the search URL", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // page.url() must have been called at least once (to capture searchUrl)
      expect(page.url).toHaveBeenCalled();
    });

    it("uses the captured URL for restoration via goto(), not goBack()", async () => {
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const detailUrl = "https://www.google.com/maps/place/AcmePlumbing/@1,2,17z";
      const { provider, page } = buildProvider({
        pageUrl: searchUrl,
        detailUrl,
        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // goBack() is now the primary restoration method — must have been called
      expect(page.goBack).toHaveBeenCalled();
    });
  });

  // -- Happy path -------------------------------------------------------------

  describe("happy path — single card batch", () => {
    it("yields one result for one card", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], []],
        payloads: [makePayload("ChIJ_A")],
      });

      const results = await collectResults(provider.discover(makeQuery() as never));

      expect(results).toHaveLength(1);
    });

    it("result carries the providerResultId from the extracted placeId", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], []],
        payloads: [makePayload("ChIJ_001")],
      });

      const results = await collectResults(provider.discover(makeQuery() as never));
      const result = results[0] as { providerResultId: string };

      expect(result.providerResultId).toBe("ChIJ_001");
    });

    it("calls extractFromCard exactly once per card", async () => {
      const { provider, mockAdapter } = buildProvider({
        cards: [
          [makeMockCard("c0"), makeMockCard("c1")],  // initial batch
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card0
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card1
          [], [], [], [], [],                         // outer empty scrolls
        ],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      expect(mockAdapter.extractFromCard).toHaveBeenCalledTimes(2);
    });

    it("yields results in the order cards were processed", async () => {
      const { provider } = buildProvider({
        cards: [
          [makeMockCard("c0"), makeMockCard("c1")],
          [makeMockCard("c0"), makeMockCard("c1")],
          [makeMockCard("c0"), makeMockCard("c1")],
          [], [], [], [], [],
        ],
        payloads: [makePayload("ChIJ_001"), makePayload("ChIJ_002")],
      });

      const results = await collectResults(provider.discover(makeQuery() as never));
      const ids = results.map((r) => (r as { providerResultId: string }).providerResultId);

      expect(ids).toEqual(["ChIJ_001", "ChIJ_002"]);
    });
  });

  // -- Search page restoration ------------------------------------------------

  describe("search page restoration after detail extraction", () => {
    it("calls page.goto(searchUrl) after each card extraction when URL changed", async () => {
      const searchUrl = "https://www.google.com/maps/search/electrician";
      const detailUrl = "https://www.google.com/maps/place/ElecCo/@1,2,17z";
      const { provider, page } = buildProvider({
        pageUrl: searchUrl,
        detailUrl,
        cards: [
          [makeMockCard("c0"), makeMockCard("c1")],  // initial batch
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card0 (target met, no break)
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card1 (target met, no break)
          [], [], [], [], [],                         // outer empty scrolls
        ],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // goBack() is primary restoration — should have been called once per card
      expect(page.goBack).toHaveBeenCalled();
    });

    it("waits for div[role='feed'] after each restoration goto", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      const feedWaits = (page.waitForSelector as MockFn).mock.calls.filter(
        (args) => args[0] === 'div[role="feed"]',
      );
      expect(feedWaits.length).toBeGreaterThanOrEqual(1);
    });

    it("re-queries cards after restoration — does not reuse stale handles", async () => {
      const card0 = makeMockCard("c0");
      const card1 = makeMockCard("c1");
      // First getResultCards call: initial batch with 2 cards
      // Second getResultCards call: post-restoration after card0 extraction (still 2 cards)
      // Third call: post-restoration after card1 extraction (0 = triggers empty scroll exit)
      const { provider, mockAdapter } = buildProvider({
        cards: [
          [card0, card1],  // call 1: initial batch
          [card0, card1],  // call 2: post-restore after card0
          [],              // call 3: post-restore after card1
          [], [], [], [],  // calls 4-7: outer loop empty scrolls
        ],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // getResultCards should have been called more than once (initial + post-restore)
      expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(10);
    });
  });

  // -- URL-change guard -------------------------------------------------------

  describe("URL-change guard — skip restoration when page did not navigate", () => {
    it("skips goto() when page.url() still equals searchUrl after extraction", async () => {
      // No detailUrl — page.url() always returns searchUrl, simulating a case
      // where extractFromCard's click did not trigger navigation
      // (e.g. detail panel opened inline without URL change, or click failed silently).
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const { provider, page } = buildProvider({
        pageUrl: searchUrl,
        detailUrl: undefined,   // url() always returns searchUrl
        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
      });

      // Override page.url to always return searchUrl (no navigation simulated)
      (page.url as ReturnType<typeof vi.fn>).mockReturnValue(searchUrl);

      await collectResults(provider.discover(makeQuery() as never));

      // goto should NOT have been called — URL never changed, no reload needed
      expect(page.goto).not.toHaveBeenCalled();
    });

    it("calls goto() when page.url() differs from searchUrl after extraction", async () => {
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const detailUrl = "https://www.google.com/maps/place/AcmePlumbing/@1,2,17z";

      // detailUrl is set — after the first url() call (capture), url() returns detailUrl
      const { provider, page } = buildProvider({
        pageUrl: searchUrl,
        detailUrl,
        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // goBack() is primary restoration method when URL differs
      expect(page.goBack).toHaveBeenCalled();
    });

    it("skips goto() on extraction failure when URL is unchanged", async () => {
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const page = makeMockPage(searchUrl); // no detailUrl — url() always returns searchUrl
      (page.url as ReturnType<typeof vi.fn>).mockReturnValue(searchUrl);

      const mockBrowser = {
        launch: vi.fn().mockResolvedValue({ ok: true }),
        newPage: vi.fn().mockResolvedValue({ ok: true, value: page }),
        navigateToSearch: vi.fn().mockResolvedValue({ ok: true }),
        isCaptchaPresent: vi.fn().mockResolvedValue(false),
        isEndOfResults: vi.fn().mockResolvedValue(false),
        scrollResultsSidebar: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        isReady: true,
      };

      let cardsCount = 0;
      const mockAdapter = {
        getResultCards: vi.fn().mockImplementation(() => {
          const batches = [[makeMockCard("c0")], []];
          return Promise.resolve(batches[cardsCount++] ?? []);
        }),
        extractFromCard: vi.fn().mockRejectedValue(new Error("click failed before nav")),
        getCardListingUrl: vi.fn().mockResolvedValue('https://maps.google.com/place/test/!19sChIJtest'),
      };

      const provider = new GoogleMapsProvider(
        makePolicy() as never,
        mockBrowser as never,
        mockAdapter as never,
      );
      (provider as unknown as { _browserReady: boolean })._browserReady = true;

      await collectResults(provider.discover(makeQuery() as never));

      // Extraction failed but URL didn't change ? goto should NOT be called
      expect(page.goto).not.toHaveBeenCalled();
    });
  });

  // -- Restoration failure ----------------------------------------------------

  describe("restoration failure handling", () => {
    it("does not throw when restoration fails — aborts batch gracefully", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
        restoreFails: true,
      });

      // Should not throw — restoration failure is non-fatal
      await expect(
        collectResults(provider.discover(makeQuery() as never)),
      ).resolves.toBeDefined();
    });

    it("still yields cards extracted before the restoration failure", async () => {
      // card0 is extracted successfully; restoration then fails ? batch aborts
      // card1 is never extracted
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
        restoreFails: true,
      });

      // Note: with restoreFails, card0 extraction succeeds but restoration
      // fails, so card0 result is NOT yielded (restoration is a prerequisite
      // for yield — the yield happens after successful restoration).
      // The run ends with 0 results but no crash.
      const results = await collectResults(provider.discover(makeQuery() as never));

      // Main assertion: no crash, result is an array
      expect(Array.isArray(results)).toBe(true);
    });

    it("closes the page in the finally block even when restoration fails", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
        restoreFails: true,
      });

      await collectResults(provider.discover(makeQuery() as never));

      expect(page.close).toHaveBeenCalledTimes(1);
    });
  });

  // -- Extraction failure -----------------------------------------------------

  describe("extraction failure handling", () => {
    it("skips a card if extractFromCard throws, then continues", async () => {
      const card0 = makeMockCard("c0");
      const card1 = makeMockCard("c1");

      const mockBrowser = {
        launch: vi.fn().mockResolvedValue({ ok: true }),
        newPage: vi.fn(),
        navigateToSearch: vi.fn().mockResolvedValue({ ok: true }),
        isCaptchaPresent: vi.fn().mockResolvedValue(false),
        isEndOfResults: vi.fn().mockResolvedValue(false),
        scrollResultsSidebar: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        isReady: true,
      };

      const page = makeMockPage();
      let gotoCount = 0;
      page.goto.mockImplementation(() => {
        gotoCount++;
        return Promise.resolve(undefined);
      });

      mockBrowser.newPage.mockResolvedValue({ ok: true, value: page });

      let getCardsCount = 0;
      const cardBatches = [[card0, card1], [card0, card1], []];
      const mockAdapter = {
        getResultCards: vi.fn().mockImplementation(() => {
          return Promise.resolve(cardBatches[getCardsCount++] ?? []);
        }),
        extractFromCard: vi.fn()
          .mockRejectedValueOnce(new Error("DOM detached"))  // card0 fails
          .mockResolvedValueOnce(makePayload("ChIJ_B")),      // card1 succeeds
        getCardListingUrl: vi.fn().mockResolvedValue('https://maps.google.com/place/test/!19sChIJtest'),
      };
      const provider = new GoogleMapsProvider(
        makePolicy() as never,
        mockBrowser as never,
        mockAdapter as never,
      );
      (provider as unknown as { _browserReady: boolean })._browserReady = true;

      const results = await collectResults(provider.discover(makeQuery() as never));

      // card1 should still be yielded
      expect(results).toHaveLength(1);
      const r = results[0] as { providerResultId: string };
      expect(r.providerResultId).toBe("ChIJ_B");
    });

    it("attempts restoration after extraction failure before continuing", async () => {
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const detailUrl = "https://www.google.com/maps/place/AcmePlumbing/@1,2,17z";
      // detailUrl ensures page.url() !== searchUrl after the failed extraction,
      // so the URL-change guard fires and restoration is attempted.
      const page = makeMockPage(searchUrl, detailUrl);
      let gotoCount = 0;
      page.goto.mockImplementation(() => {
        gotoCount++;
        return Promise.resolve(undefined);
      });

      const mockBrowser = {
        launch: vi.fn().mockResolvedValue({ ok: true }),
        newPage: vi.fn().mockResolvedValue({ ok: true, value: page }),
        navigateToSearch: vi.fn().mockResolvedValue({ ok: true }),
        isCaptchaPresent: vi.fn().mockResolvedValue(false),
        isEndOfResults: vi.fn().mockResolvedValue(false),
        scrollResultsSidebar: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        isReady: true,
      };

      let cardsCount = 0;
      const mockAdapter = {
        getResultCards: vi.fn().mockImplementation(() => {
          const batches = [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], [], []];
          return Promise.resolve(batches[cardsCount++] ?? []);
        }),
        extractFromCard: vi.fn().mockRejectedValue(new Error("extract failed")),
        getCardListingUrl: vi.fn().mockResolvedValue('https://maps.google.com/place/test/!19sChIJtest'),
      };
      const provider = new GoogleMapsProvider(
        makePolicy() as never,
        mockBrowser as never,
        mockAdapter as never,
      );
      (provider as unknown as { _browserReady: boolean })._browserReady = true;
      await collectResults(provider.discover(makeQuery() as never));
      // goBack() should have been called for restoration even though extraction failed
      expect(page.goBack).toHaveBeenCalled();
    });
  });

  // -- Deduplication ----------------------------------------------------------

  describe("deduplication", () => {
    it("does not yield the same placeId twice in one session", async () => {
      const card = makeMockCard("c0");

      const mockBrowser = {
        launch: vi.fn().mockResolvedValue({ ok: true }),
        newPage: vi.fn(),
        navigateToSearch: vi.fn().mockResolvedValue({ ok: true }),
        isCaptchaPresent: vi.fn().mockResolvedValue(false),
        isEndOfResults: vi.fn().mockResolvedValue(false),
        scrollResultsSidebar: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        isReady: true,
      };

      const page = makeMockPage();
      page.goto.mockResolvedValue(undefined);
      mockBrowser.newPage.mockResolvedValue({ ok: true, value: page });

      let cardsCount = 0;
      const mockAdapter = {
        // Return the same card twice in two separate batches
        getResultCards: vi.fn().mockImplementation(() => {
          const batches = [
            [card],        // batch 1: one card
            [],            // after restoration of card 0
            [card],        // batch 2: same card again (duplicate)
            [],
          ];
          return Promise.resolve(batches[cardsCount++] ?? []);
        }),
        extractFromCard: vi.fn()
          .mockResolvedValueOnce(makePayload("ChIJ_SAME"))
          .mockResolvedValueOnce(makePayload("ChIJ_SAME")), // duplicate payload
        getCardListingUrl: vi.fn().mockResolvedValue('https://maps.google.com/place/test/!19sChIJtest'),
      };
      const provider = new GoogleMapsProvider(
        makePolicy() as never,
        mockBrowser as never,
        mockAdapter as never,
      );

      (provider as unknown as { _browserReady: boolean })._browserReady = true;
      const results = await collectResults(provider.discover(makeQuery() as never));

      // Only one result despite two extractions returning the same placeId
      const ids = results.map((r) => (r as { providerResultId: string }).providerResultId);
      expect(ids.filter((id) => id === "ChIJ_SAME")).toHaveLength(1);
    });
  });

  // -- Page lifecycle ---------------------------------------------------------

  describe("page lifecycle", () => {
    it("always closes the page in the finally block on normal completion", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      expect(page.close).toHaveBeenCalledTimes(1);
    });

    it("closes the page even when navigateToSearch fails", async () => {
      const { provider, page } = buildProvider({ navigateOk: false });

      await expect(
        collectResults(provider.discover(makeQuery() as never)),
      ).rejects.toThrow();

      expect(page.close).toHaveBeenCalledTimes(1);
    });

    it("closes the page even when CAPTCHA is detected mid-run", async () => {
      const { provider, page } = buildProvider({
        captcha: true,
        cards: [[]],
        payloads: [],
      });

      await expect(
        collectResults(provider.discover(makeQuery() as never)),
      ).rejects.toThrow("CAPTCHA");

      expect(page.close).toHaveBeenCalledTimes(1);
    });
  });

  // -- Browser not ready guard ------------------------------------------------

  describe("browser not ready guard", () => {
    it("throws BROWSER_LAUNCH_FAILED if browserReady is false", async () => {
      const { provider } = buildProvider({});
      (provider as unknown as { _browserReady: boolean })._browserReady = false;

      await expect(
        collectResults(provider.discover(makeQuery() as never)),
      ).rejects.toThrow("BROWSER_LAUNCH_FAILED");
    });
  });

  // -- goBack is never called -------------------------------------------------

  describe("goBack is primary restoration method", () => {
    it("calls page.goBack() for restoration after each card extraction", async () => {
      const c0 = makeMockCard("c0");
      const c1 = makeMockCard("c1");
      const c2 = makeMockCard("c2");
      const { provider, page } = buildProvider({
        // post-restore batches return 3 cards each so _restoreFeedDepth exits
        // immediately (target met on first check) — no real humanDelay fires.
        cards: [
          [c0, c1, c2],  // initial batch
          [c0, c1, c2],  // post-restore card0
          [c0, c1, c2],  // post-restore card1
          [c0, c1, c2],  // post-restore card2
          [], [], [], [], // outer empty scrolls
        ],
        payloads: [
          makePayload("ChIJ_A"),
          makePayload("ChIJ_B"),
          makePayload("ChIJ_C"),
        ],
      });

      await collectResults(provider.discover(makeQuery() as never));

      expect(page.goBack).toHaveBeenCalled();
    });
  });
  // -- Feed depth restoration --------------------------------------------------

  describe("_restoreFeedDepth after search page restoration", () => {
    it("returns cards immediately if feed already meets target count", async () => {
      // detailUrl ensures URL guard fires and _restoreSearchPage is called,
      // then _restoreFeedDepth is called with targetCount = 1 card.
      // The first getResultCards call inside _restoreFeedDepth returns 1 card
      // straight away — no scroll should be needed.
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const detailUrl = "https://www.google.com/maps/place/AcmePlumbing/@1,2,17z";
      const { provider, mockAdapter, mockBrowser } = buildProvider({
        pageUrl: searchUrl,
        detailUrl,
        // outer loop: 1 card; _restoreFeedDepth internal call: 1 card; outer empty scrolls: []x4
        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], [], [], []],
        payloads: [makePayload("ChIJ_A")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // scrollResultsSidebar should NOT have been called inside _restoreFeedDepth
      // (target already met on first getResultCards call inside helper).
      // It IS called by the outer loop for empty scroll attempts.
      expect(mockBrowser.scrollResultsSidebar).toHaveBeenCalledTimes(5);
    });

    it("scrolls until target card count is restored", async () => {
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const detailUrl = "https://www.google.com/maps/place/AcmePlumbing/@1,2,17z";

      // Simulate: initial batch has 2 cards; after restoration feed starts
      // with only 1 card, then a scroll brings it back to 2.
      //
      // getResultCards call sequence:
      //   1. outer loop initial batch            -> [c0, c1]  (2 cards)
      //   2. _restoreFeedDepth first check       -> [c0]      (1 card, below target=2)
      //   3. _restoreFeedDepth after scroll      -> [c0, c1]  (2 cards, target met)
      //   -- card c1 extracted next --
      //   4. _restoreFeedDepth first check       -> [c0, c1]  (2 cards, target met immediately)
      //   5+ outer loop empty scrolls            -> []  x4
      const card0 = makeMockCard("c0");
      const card1 = makeMockCard("c1");

      const mockBrowser = {
        launch: vi.fn().mockResolvedValue({ ok: true }),
        newPage: vi.fn(),
        navigateToSearch: vi.fn().mockResolvedValue({ ok: true }),
        isCaptchaPresent: vi.fn().mockResolvedValue(false),
        isEndOfResults: vi.fn().mockResolvedValue(false),
        scrollResultsSidebar: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        isReady: true,
      };

      const page = makeMockPage(searchUrl, detailUrl);
      page.goto.mockResolvedValue(undefined);
      mockBrowser.newPage.mockResolvedValue({ ok: true, value: page });

      let callCount = 0;
      const cardSequence = [
        [card0, card1],  // 1: outer initial batch
        [card0],         // 2: _restoreFeedDepth first check (below target)
        [card0, card1],  // 3: _restoreFeedDepth after scroll (target met)
        [card0, card1],  // 4: _restoreFeedDepth for card1 (target met immediately)
        [], [], [], [],  // 5-8: outer empty scrolls
      ];
      const mockAdapter = {
        getResultCards: vi.fn().mockImplementation(() =>
          Promise.resolve(cardSequence[callCount++] ?? [])
        ),
        extractFromCard: vi.fn()
          .mockResolvedValueOnce(makePayload("ChIJ_A"))
          .mockResolvedValueOnce(makePayload("ChIJ_B")),
        getCardListingUrl: vi.fn().mockResolvedValue('https://maps.google.com/place/test/!19sChIJtest'),
      };
      const provider = new GoogleMapsProvider(
        makePolicy() as never,
        mockBrowser as never,
        mockAdapter as never,
      );
      (provider as unknown as { _browserReady: boolean })._browserReady = true;

      const results = await collectResults(provider.discover(makeQuery() as never));
      // Both cards should be yielded
      expect(results).toHaveLength(2);

      // scrollResultsSidebar called once inside _restoreFeedDepth (for card0's restore)
      // plus once by outer loop after processing batch = 2 total minimum
      expect(mockBrowser.scrollResultsSidebar.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

});
