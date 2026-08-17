/**
 * @file tests/unit/providers/google-maps/GoogleMapsProvider.test.ts
 *
 * Unit tests for GoogleMapsProvider.discover() -- two-phase architecture.
 *
 * Phase 1: scroll feed, collect card hrefs via getCardListingUrl(), deduplicate.
 * Phase 2: visit each collected URL via page.goto(), extract via extractFromDetailUrl().
 */

import { describe, it, expect, vi } from "vitest";
import { GoogleMapsProvider } from "../../../../src/providers/google-maps/GoogleMapsProvider.js";
import { PlaceIdWebsiteCache } from "../../../../src/cache/PlaceIdWebsiteCache.js";

function makeMockPage(searchUrl = "https://www.google.com/maps/search/plumber") {
  return {
    url: vi.fn(() => searchUrl),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
  };
}

function makeMockCard(id = "card-0") {
  return { __mockCardId: id, evaluate: vi.fn().mockResolvedValue(null) };
}

function makePayload(placeId: string, website?: string) {
  return {
    placeId,
    name: `Business ${placeId}`,
    listingUrl: `https://www.google.com/maps/place/${placeId}/@1.0,2.0,17z/data=!1s${placeId}`,
    detailPanelScraped: true,
    ...(website !== undefined ? { website } : {}),
  };
}

function makePolicy() {
  return {
    retry: { maxAttempts: 1, backoffBaseMs: 0, backoffCapMs: 0 },
    rateLimit: { minDelayBetweenRequestsMs: 0, jitterMs: 0 },
  };
}

function makeQuery(overrides: Record<string, unknown> = {}) {
  return { id: null, runId: "run-1", rawText: "plumber", queryHash: "hash-abc", ...overrides };
}

function makeCardHref(placeId: string) {
  return `https://www.google.com/maps/place/Business/@1.0,2.0,17z/data=!19s${placeId}`;
}

function buildProvider(overrides: {
  searchUrl?: string;
  cards?: object[][];
  cardHrefs?: (string | undefined)[];
  detailPayloads?: object[];
  navigateOk?: boolean;
  captcha?: boolean;
  endOfResults?: boolean;
  phase2NavFails?: boolean;
  phase2ExtractFails?: boolean;
}) {
  const {
    searchUrl = "https://www.google.com/maps/search/plumber",
    cards = [[makeMockCard("c0")], []],
    cardHrefs = [makeCardHref("ChIJ_A")],
    detailPayloads = [makePayload("ChIJ_A")],
    navigateOk = true,
    captcha = false,
    endOfResults = false,
    phase2NavFails = false,
    phase2ExtractFails = false,
  } = overrides;

  const page = makeMockPage(searchUrl);
  page.goto.mockImplementation(() =>
    phase2NavFails ? Promise.reject(new Error("navigation failed")) : Promise.resolve(undefined),
  );

  const mockBrowser = {
    launch: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    newPage: vi.fn().mockResolvedValue({ ok: true, value: page }),
    navigateToSearch: vi.fn().mockResolvedValue(
      navigateOk ? { ok: true, value: undefined } : { ok: false, error: new Error("nav failed") },
    ),
    isCaptchaPresent: vi.fn().mockResolvedValue(captcha),
    isEndOfResults: vi.fn().mockResolvedValue(endOfResults),
    scrollResultsSidebar: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isReady: true,
  };

  let getCardsCallCount = 0;
  let hrefCallCount = 0;
  const detailPayloadQueue = [...detailPayloads];

  const mockAdapter = {
    getResultCards: vi.fn().mockImplementation(() => {
      const batch = cards[getCardsCallCount] ?? [];
      getCardsCallCount++;
      return Promise.resolve(batch);
    }),
    getCardListingUrl: vi.fn().mockImplementation(() => {
      const href = cardHrefs[hrefCallCount] ?? undefined;
      hrefCallCount++;
      return Promise.resolve(href);
    }),
    extractFromDetailUrl: vi.fn().mockImplementation(() => {
      if (phase2ExtractFails) return Promise.reject(new Error("extraction failed"));
      const payload = detailPayloadQueue.shift();
      if (payload === undefined) return Promise.reject(new Error("no payload"));
      return Promise.resolve(payload);
    }),
    extractFromCard: vi.fn().mockResolvedValue({}),
  };

  const provider = new GoogleMapsProvider(makePolicy() as never, mockBrowser as never, mockAdapter as never);
  (provider as unknown as { _browserReady: boolean })._browserReady = true;
  return { provider, page, mockBrowser, mockAdapter };
}

async function collectResults(gen: AsyncGenerator<unknown, void, undefined>): Promise<unknown[]> {
  const results: unknown[] = [];
  for await (const r of gen) results.push(r);
  return results;
}

describe("GoogleMapsProvider.discover() -- two-phase architecture", () => {

  describe("Phase 1 -- URL collection", () => {
    it("calls getCardListingUrl() for each card without calling extractFromCard()", async () => {
      const { provider, mockAdapter } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(mockAdapter.getCardListingUrl).toHaveBeenCalledTimes(2);
      expect(mockAdapter.extractFromCard).not.toHaveBeenCalled();
    });

    it("skips cards where getCardListingUrl returns undefined", async () => {
      const { provider, mockAdapter } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1"), makeMockCard("c2")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), undefined, makeCardHref("ChIJ_C")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_C")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(mockAdapter.extractFromDetailUrl).toHaveBeenCalledTimes(2);
    });

    it("deduplicates cards with the same placeId in Phase 1", async () => {
      const { provider, mockAdapter } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_SAME"), makeCardHref("ChIJ_SAME")],
        detailPayloads: [makePayload("ChIJ_SAME")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(mockAdapter.extractFromDetailUrl).toHaveBeenCalledTimes(1);
    });

    it("does not call page.goto() during Phase 1 card collection", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      // goto called exactly once per collected URL -- no extra calls during Phase 1
      expect(page.goto).toHaveBeenCalledTimes(2);
    });

    it("never calls page.goBack() during Phase 1", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.goBack).not.toHaveBeenCalled();
    });

    it("stops collecting when maxResults URLs have been gathered", async () => {
      const { provider, mockAdapter } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1"), makeMockCard("c2")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B"), makeCardHref("ChIJ_C")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      const results = await collectResults(provider.discover(makeQuery() as never, { maxResults: 2 }));
      expect(results).toHaveLength(2);
      expect(mockAdapter.extractFromDetailUrl).toHaveBeenCalledTimes(2);
    });
  });

  describe("Phase 2 -- detail extraction", () => {
    it("calls page.goto() once per collected URL", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.goto).toHaveBeenCalledTimes(2);
    });

    it("calls page.goto() with the collected URL", async () => {
      const href = makeCardHref("ChIJ_A");
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [href],
        detailPayloads: [makePayload("ChIJ_A")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.goto).toHaveBeenCalledWith(href, expect.objectContaining({ waitUntil: "domcontentloaded" }));
    });

    it("calls extractFromDetailUrl() once per collected URL", async () => {
      const { provider, mockAdapter } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(mockAdapter.extractFromDetailUrl).toHaveBeenCalledTimes(2);
    });

    it("yields one result per successfully extracted URL", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      const results = await collectResults(provider.discover(makeQuery() as never));
      expect(results).toHaveLength(2);
    });

    it("result carries providerResultId from extracted placeId", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_001")],
        detailPayloads: [makePayload("ChIJ_001")],
      });
      const results = await collectResults(provider.discover(makeQuery() as never));
      expect((results[0] as { providerResultId: string }).providerResultId).toBe("ChIJ_001");
    });

    it("skips a URL when page.goto() throws and continues to next", async () => {
      const page = makeMockPage();
      let gotoCount = 0;
      page.goto.mockImplementation(() => {
        gotoCount++;
        if (gotoCount === 1) return Promise.reject(new Error("nav failed"));
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
          const batches = [[makeMockCard("c0"), makeMockCard("c1")], []];
          return Promise.resolve(batches[cardsCount++] ?? []);
        }),
        getCardListingUrl: vi.fn()
          .mockResolvedValueOnce(makeCardHref("ChIJ_A"))
          .mockResolvedValueOnce(makeCardHref("ChIJ_B")),
        extractFromDetailUrl: vi.fn().mockResolvedValue(makePayload("ChIJ_B")),
        extractFromCard: vi.fn().mockResolvedValue({}),
      };
      const provider = new GoogleMapsProvider(makePolicy() as never, mockBrowser as never, mockAdapter as never);
      (provider as unknown as { _browserReady: boolean })._browserReady = true;
      const results = await collectResults(provider.discover(makeQuery() as never));
      expect(results).toHaveLength(1);
      expect((results[0] as { providerResultId: string }).providerResultId).toBe("ChIJ_B");
    });

    it("skips a URL when extractFromDetailUrl() throws and continues to next", async () => {
      const page = makeMockPage();
      page.goto.mockResolvedValue(undefined);
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
          const batches = [[makeMockCard("c0"), makeMockCard("c1")], []];
          return Promise.resolve(batches[cardsCount++] ?? []);
        }),
        getCardListingUrl: vi.fn()
          .mockResolvedValueOnce(makeCardHref("ChIJ_A"))
          .mockResolvedValueOnce(makeCardHref("ChIJ_B")),
        extractFromDetailUrl: vi.fn()
          .mockRejectedValueOnce(new Error("extraction failed"))
          .mockResolvedValueOnce(makePayload("ChIJ_B")),
        extractFromCard: vi.fn().mockResolvedValue({}),
      };
      const provider = new GoogleMapsProvider(makePolicy() as never, mockBrowser as never, mockAdapter as never);
      (provider as unknown as { _browserReady: boolean })._browserReady = true;
      const results = await collectResults(provider.discover(makeQuery() as never));
      expect(results).toHaveLength(1);
      expect((results[0] as { providerResultId: string }).providerResultId).toBe("ChIJ_B");
    });

    it("never calls page.goBack() during Phase 2", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.goBack).not.toHaveBeenCalled();
    });

    it("respects maxResults -- stops yielding after limit", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1"), makeMockCard("c2")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B"), makeCardHref("ChIJ_C")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B"), makePayload("ChIJ_C")],
      });
      const results = await collectResults(provider.discover(makeQuery() as never, { maxResults: 2 }));
      expect(results).toHaveLength(2);
    });

    it("yields results in Phase 1 collection order", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_001"), makeCardHref("ChIJ_002")],
        detailPayloads: [makePayload("ChIJ_001"), makePayload("ChIJ_002")],
      });
      const results = await collectResults(provider.discover(makeQuery() as never));
      const ids = results.map((r) => (r as { providerResultId: string }).providerResultId);
      expect(ids).toEqual(["ChIJ_001", "ChIJ_002"]);
    });
  });

  describe("goBack is never called", () => {
    it("never calls page.goBack() across a full discovery run", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1"), makeMockCard("c2")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B"), makeCardHref("ChIJ_C")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B"), makePayload("ChIJ_C")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.goBack).not.toHaveBeenCalled();
    });

    it("never calls page.goBack() even when Phase 2 navigation fails", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [],
        phase2NavFails: true,
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.goBack).not.toHaveBeenCalled();
    });

    it("never calls page.goBack() even when Phase 2 extraction fails", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [],
        phase2ExtractFails: true,
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.goBack).not.toHaveBeenCalled();
    });
  });

  describe("deduplication", () => {
    it("does not yield the same placeId twice when same href appears in two scroll batches", async () => {
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
        getResultCards: vi.fn().mockImplementation(() => {
          const batches = [[card], [card], []];
          return Promise.resolve(batches[cardsCount++] ?? []);
        }),
        getCardListingUrl: vi.fn().mockResolvedValue(makeCardHref("ChIJ_SAME")),
        extractFromDetailUrl: vi.fn().mockResolvedValue(makePayload("ChIJ_SAME")),
        extractFromCard: vi.fn().mockResolvedValue({}),
      };
      const provider = new GoogleMapsProvider(makePolicy() as never, mockBrowser as never, mockAdapter as never);
      (provider as unknown as { _browserReady: boolean })._browserReady = true;
      const results = await collectResults(provider.discover(makeQuery() as never));
      const ids = results.map((r) => (r as { providerResultId: string }).providerResultId);
      expect(ids.filter((id) => id === "ChIJ_SAME")).toHaveLength(1);
    });
  });

  describe("page lifecycle", () => {
    it("always closes the page in the finally block on normal completion", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [makePayload("ChIJ_A")],
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.close).toHaveBeenCalledTimes(1);
    });

    it("closes the page even when navigateToSearch fails", async () => {
      const { provider, page } = buildProvider({ navigateOk: false });
      await expect(collectResults(provider.discover(makeQuery() as never))).rejects.toThrow();
      expect(page.close).toHaveBeenCalledTimes(1);
    });

    it("closes the page even when CAPTCHA is detected", async () => {
      const { provider, page } = buildProvider({ captcha: true, cards: [[]], cardHrefs: [], detailPayloads: [] });
      await expect(collectResults(provider.discover(makeQuery() as never))).rejects.toThrow("CAPTCHA");
      expect(page.close).toHaveBeenCalledTimes(1);
    });

    it("closes the page even when all Phase 2 navigations fail", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [],
        phase2NavFails: true,
      });
      await collectResults(provider.discover(makeQuery() as never));
      expect(page.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("browser not ready guard", () => {
    it("throws BROWSER_LAUNCH_FAILED if browserReady is false", async () => {
      const { provider } = buildProvider({});
      (provider as unknown as { _browserReady: boolean })._browserReady = false;
      await expect(collectResults(provider.discover(makeQuery() as never))).rejects.toThrow("BROWSER_LAUNCH_FAILED");
    });
  });

  describe("CAPTCHA detection", () => {
    it("throws CAPTCHA_DETECTED when CAPTCHA present during Phase 1", async () => {
      const { provider } = buildProvider({ captcha: true, cards: [[]], cardHrefs: [], detailPayloads: [] });
      await expect(collectResults(provider.discover(makeQuery() as never))).rejects.toThrow("CAPTCHA");
    });
  });

  describe("resume token", () => {
    it("throws RESUME_TOKEN_STALE when token queryHash does not match", async () => {
      const { provider } = buildProvider({});
      const staleToken = {
        strategy: "cursor" as const,
        pageRequest: {
          kind: "cursor" as const,
          cursor: Buffer.from(JSON.stringify({ yieldedIds: [], queryHash: "different-hash" })).toString("base64url"),
        },
        providerContext: {},
        createdAt: Date.now(),
      };
      await expect(
        collectResults(provider.discover(makeQuery() as never, { resumeToken: staleToken })),
      ).rejects.toThrow("Resume token is stale or belongs to a different query");
    });

    it("skips already-yielded IDs when valid resume token provided", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_B")],
      });
      const resumeToken = {
        strategy: "cursor" as const,
        pageRequest: {
          kind: "cursor" as const,
          cursor: Buffer.from(JSON.stringify({ yieldedIds: ["ChIJ_A"], queryHash: "hash-abc" })).toString("base64url"),
        },
        providerContext: {},
        createdAt: Date.now(),
      };
      const results = await collectResults(provider.discover(makeQuery() as never, { resumeToken }));
      expect(results).toHaveLength(1);
      expect((results[0] as { providerResultId: string }).providerResultId).toBe("ChIJ_B");
    });

    it("result carries a resumeToken", async () => {
      const { provider } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [makePayload("ChIJ_A")],
      });
      const results = await collectResults(provider.discover(makeQuery() as never));
      expect((results[0] as { resumeToken: unknown }).resumeToken).toBeDefined();
    });
  });

  describe("Phase 2 -- website-driven cache gate", () => {
    it("skips page.goto() for an entry the cache reports as seen-with-website", async () => {
      const cache = new PlaceIdWebsiteCache();
      cache.record("ChIJ_A", true);

      const { provider, page, mockAdapter } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_B")],
      });

      const results = await collectResults(
        provider.discover(makeQuery() as never, { placeIdWebsiteCache: cache } as never),
      );

      expect(page.goto).toHaveBeenCalledTimes(1);
      expect(page.goto).toHaveBeenCalledWith(
        expect.stringContaining("ChIJ_B"),
        expect.anything(),
      );
      expect(mockAdapter.extractFromDetailUrl).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect((results[0] as { providerResultId: string }).providerResultId).toBe("ChIJ_B");
    });

    it("does NOT skip an entry the cache reports as seen-no-website", async () => {
      const cache = new PlaceIdWebsiteCache();
      cache.record("ChIJ_A", false);

      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [makePayload("ChIJ_A")],
      });

      await collectResults(
        provider.discover(makeQuery() as never, { placeIdWebsiteCache: cache } as never),
      );

      expect(page.goto).toHaveBeenCalledTimes(1);
    });

    it("does NOT skip an unseen identity", async () => {
      const cache = new PlaceIdWebsiteCache();

      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [makePayload("ChIJ_A")],
      });

      await collectResults(
        provider.discover(makeQuery() as never, { placeIdWebsiteCache: cache } as never),
      );

      expect(page.goto).toHaveBeenCalledTimes(1);
    });

    it("records seen-with-website in the cache after a successful extraction whose payload has a website", async () => {
      const cache = new PlaceIdWebsiteCache();

      const { provider } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [makePayload("ChIJ_A", "https://example.com")],
      });

      await collectResults(
        provider.discover(makeQuery() as never, { placeIdWebsiteCache: cache } as never),
      );

      expect(cache.status("ChIJ_A")).toBe("seen-with-website");
    });

    it("records seen-no-website in the cache after a successful extraction whose payload has no website", async () => {
      const cache = new PlaceIdWebsiteCache();

      const { provider } = buildProvider({
        cards: [[makeMockCard("c0")], []],
        cardHrefs: [makeCardHref("ChIJ_A")],
        detailPayloads: [makePayload("ChIJ_A")],
      });

      await collectResults(
        provider.discover(makeQuery() as never, { placeIdWebsiteCache: cache } as never),
      );

      expect(cache.status("ChIJ_A")).toBe("seen-no-website");
    });

    it("does not skip anything when no cache is supplied (backward compatible)", async () => {
      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      expect(page.goto).toHaveBeenCalledTimes(2);
    });

    it("Phase 1 card collection is unaffected by the cache -- both cards are still collected even though one will be skipped in Phase 2", async () => {
      const cache = new PlaceIdWebsiteCache();
      cache.record("ChIJ_A", true);

      const { provider, mockAdapter } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        cardHrefs: [makeCardHref("ChIJ_A"), makeCardHref("ChIJ_B")],
        detailPayloads: [makePayload("ChIJ_B")],
      });

      await collectResults(
        provider.discover(makeQuery() as never, { placeIdWebsiteCache: cache } as never),
      );

      // Phase 1's getCardListingUrl() is called once per card regardless of
      // the cache -- the skip decision only affects Phase 2's page.goto().
      expect(mockAdapter.getCardListingUrl).toHaveBeenCalledTimes(2);
    });
  });

});
