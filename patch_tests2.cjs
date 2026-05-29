const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

// Fix 1: "calls extractFromCard exactly once per card" timeout
// cards: [[c0,c1],[]] causes _restoreFeedDepth to enter scroll loop ([] < target 2)
// Supply full post-restore batches so target is met immediately each time
c = c.replace(
  `        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      expect(mockAdapter.extractFromCard).toHaveBeenCalledTimes(2);`,
  `        cards: [
          [makeMockCard("c0"), makeMockCard("c1")],  // initial batch
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card0
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card1
          [], [], [], [], [],                         // outer empty scrolls
        ],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      expect(mockAdapter.extractFromCard).toHaveBeenCalledTimes(2);`
);

// Fix 2: "yields results in the order" test has same cards: [[c0,c1],[]] pattern
c = c.replace(
  `        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        payloads: [makePayload("ChIJ_001"), makePayload("ChIJ_002")],`,
  `        cards: [
          [makeMockCard("c0"), makeMockCard("c1")],
          [makeMockCard("c0"), makeMockCard("c1")],
          [makeMockCard("c0"), makeMockCard("c1")],
          [], [], [], [], [],
        ],
        payloads: [makePayload("ChIJ_001"), makePayload("ChIJ_002")],`
);

// Fix 3: re-queries count now 10 not 9
c = c.replace(
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(9);',
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(10);'
);

fs.writeFileSync(f, c);
console.log('done');
