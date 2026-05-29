const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

// Fix 1: re-queries test now gets 9 calls (extra initial check in _restoreFeedDepth)
c = c.replace(
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(8);',
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(9);'
);

// Fix 2: goBack test times out because _restoreFeedDepth uses real humanDelay.
// The test has 3 cards; after each extraction _restoreFeedDepth does an initial
// getResultCards check. If target is met immediately it returns — no scroll/delay.
// We need the post-restore getResultCards to return >= previousCardCount (3) cards
// so the helper exits on the immediate check every time.
// Current cards array: [[c0,c1,c2], []] — only 2 entries, so post-restore
// getResultCards calls return [] (below target=3) and enter the scroll loop.
// Fix: supply post-restore batches with 3 cards each, plus outer scroll empties.
c = c.replace(
  `      const { provider, page } = buildProvider({
        cards: [[makeMockCard("c0"), makeMockCard("c1"), makeMockCard("c2")], []],
        payloads: [
          makePayload("ChIJ_A"),
          makePayload("ChIJ_B"),
          makePayload("ChIJ_C"),
        ],
      });`,
  `      const c0 = makeMockCard("c0");
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
      });`
);

fs.writeFileSync(f, c);
console.log('done');
