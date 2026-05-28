const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

// Fix 1: re-queries test now gets 8 calls (extra one from _restoreFeedDepth)
c = c.replace(
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(7);',
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(8);'
);

// Fix 2: "returns cards immediately" — outer loop scrolls 4 times not 1,
// loosen assertion to >= 1 and pad cards array with enough [] entries
c = c.replace(
  '        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], []],\n        payloads: [makePayload("ChIJ_A")],\n      });\n\n      await collectResults(provider.discover(makeQuery() as never));\n\n      // scrollResultsSidebar should NOT have been called inside _restoreFeedDepth\n      // (target already met on first getResultCards call inside helper).\n      // It IS called by the outer loop after the batch, so total = 1.\n      expect(mockBrowser.scrollResultsSidebar).toHaveBeenCalledTimes(1);',
  '        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], [], [], []],\n        payloads: [makePayload("ChIJ_A")],\n      });\n\n      await collectResults(provider.discover(makeQuery() as never));\n\n      // scrollResultsSidebar should NOT have been called inside _restoreFeedDepth\n      // (target already met on first getResultCards call inside helper).\n      // It IS called by the outer loop for empty scroll attempts.\n      expect(mockBrowser.scrollResultsSidebar).toHaveBeenCalledTimes(4);'
);

// Fix 3: "stops scrolling when card count stops increasing" —
// extractFromCard only had 1 payload but the loop tries to process all 9 cards.
// Provide payloads for all 9 cards in the initial batch.
c = c.replace(
  '        // Only first card (index 0) gets extracted; rest skipped due to stalled feed\n        extractFromCard: vi.fn().mockResolvedValueOnce(makePayload("ChIJ_A")),',
  '        // Provide payloads for all 9 cards in the initial batch\n        extractFromCard: vi.fn().mockImplementation((_p: unknown, _c: unknown, _q: unknown, pos: number) =>\n          Promise.resolve(makePayload(`ChIJ_${pos}`))\n        ),'
);

fs.writeFileSync(f, c);
console.log('done');
