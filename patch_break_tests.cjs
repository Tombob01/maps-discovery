const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

// Fix re-queries count: was 10, actual is 9
c = c.replace(
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(10);',
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(9);'
);

// Fix "calls page.goto(searchUrl) after each card extraction when URL changed":
// cards: [[c0,c1],[c0,c1],[]] — after card0 restore freshCards=[c0,c1] (2=target,no break)
// after card1 restore freshCards=[] (0<2, i+1=2>=0 -> break, no second goto).
// Need to supply a full batch after card1 so break doesn't fire prematurely.
c = c.replace(
  `        cards: [[makeMockCard("c0"), makeMockCard("c1")], []],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // Should have been called once per card for restoration (URL changed each time)
      const restorationCalls = (page.goto as MockFn).mock.calls.filter(
        (args) => args[0] === searchUrl,
      );
      expect(restorationCalls).toHaveLength(2);`,
  `        cards: [
          [makeMockCard("c0"), makeMockCard("c1")],  // initial batch
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card0 (target met, no break)
          [makeMockCard("c0"), makeMockCard("c1")],  // post-restore card1 (target met, no break)
          [], [], [], [], [],                         // outer empty scrolls
        ],
        payloads: [makePayload("ChIJ_A"), makePayload("ChIJ_B")],
      });

      await collectResults(provider.discover(makeQuery() as never));

      // Should have been called once per card for restoration (URL changed each time)
      const restorationCalls = (page.goto as MockFn).mock.calls.filter(
        (args) => args[0] === searchUrl,
      );
      expect(restorationCalls).toHaveLength(2);`
);

fs.writeFileSync(f, c);
console.log('done');
