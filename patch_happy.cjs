const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

// Fix "yields one result for one card" — supply post-restore batch
c = c.replace(
  `        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_A")],
      });

      const results = await collectResults(provider.discover(makeQuery() as never));

      expect(results).toHaveLength(1);`,
  `        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], []],
        payloads: [makePayload("ChIJ_A")],
      });

      const results = await collectResults(provider.discover(makeQuery() as never));

      expect(results).toHaveLength(1);`
);

// Fix "result carries the providerResultId"
c = c.replace(
  `        cards: [[makeMockCard("c0")], []],
        payloads: [makePayload("ChIJ_001")],`,
  `        cards: [[makeMockCard("c0")], [makeMockCard("c0")], [], [], [], []],
        payloads: [makePayload("ChIJ_001")],`
);

// Fix re-queries count: now 9 instead of 11
c = c.replace(
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(11);',
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(9);'
);

fs.writeFileSync(f, c);
console.log('done');
