const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

const newTests = `
  // ── Feed depth restoration ──────────────────────────────────────────────────

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
        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], []],
        payloads: [makePayload("ChIJ_A")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // scrollResultsSidebar should NOT have been called inside _restoreFeedDepth
      // (target already met on first getResultCards call inside helper).
      // It IS called by the outer loop after the batch, so total = 1.
      expect(mockBrowser.scrollResultsSidebar).toHaveBeenCalledTimes(1);
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

    it("stops scrolling when card count stops increasing (feed exhausted)", async () => {
      const searchUrl = "https://www.google.com/maps/search/plumber";
      const detailUrl = "https://www.google.com/maps/place/AcmePlumbing/@1,2,17z";

      // Simulate: initial batch has 9 cards; after restoration feed stalls at 3
      // regardless of scrolling. _restoreFeedDepth should stop after the first
      // scroll that produces no increase, not spin up to MAX attempts.
      const cards9 = Array.from({ length: 9 }, (_, i) => makeMockCard(\`c\${i}\`));
      const cards3 = cards9.slice(0, 3);

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
      // After restoration, feed is stuck at 3 cards no matter how many scrolls
      const cardSequence: object[][] = [
        cards9,   // 1: outer initial batch (9 cards)
        cards3,   // 2: _restoreFeedDepth first check (3, below target=9)
        cards3,   // 3: _restoreFeedDepth after scroll 1 (still 3, stalled -> bail)
        // remaining calls: outer empty scrolls
        ...Array(6).fill([]),
      ];
      const mockAdapter = {
        getResultCards: vi.fn().mockImplementation(() =>
          Promise.resolve(cardSequence[callCount++] ?? [])
        ),
        // Only first card (index 0) gets extracted; rest skipped due to stalled feed
        extractFromCard: vi.fn().mockResolvedValueOnce(makePayload("ChIJ_A")),
      };

      const provider = new GoogleMapsProvider(
        makePolicy() as never,
        mockBrowser as never,
        mockAdapter as never,
      );
      (provider as unknown as { _browserReady: boolean })._browserReady = true;

      await collectResults(provider.discover(makeQuery() as never));

      // _restoreFeedDepth should have called scrollResultsSidebar exactly once
      // (first scroll produced no increase -> bail immediately, not 10 times)
      // Plus any outer loop scrolls. Total scrolls from _restoreFeedDepth = 1.
      const scrollCalls = mockBrowser.scrollResultsSidebar.mock.calls.length;
      // At least 1 (from _restoreFeedDepth) but well below MAX_FEED_DEPTH_RESTORE_ATTEMPTS=10
      expect(scrollCalls).toBeGreaterThanOrEqual(1);
      expect(scrollCalls).toBeLessThan(10);
    });
  });
`;

// Insert before the closing });  of the outer describe block
const closing = '\n});';
const lastIdx = c.lastIndexOf(closing);
c = c.slice(0, lastIdx) + newTests + closing;

fs.writeFileSync(f, c);
console.log('done — lines now:', c.split('\n').length);
