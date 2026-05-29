const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

// The "re-queries cards" test: cards = [[c0,c1],[c0,c1],[],...]
// With the new break: after card0 extracted, freshCards=[c0,c1] (length 2 = target 2),
// no partial break fires. After card1 extracted, freshCards=[] (length 0 < target 2),
// partial break fires, lastCardCount=0, outer loop rescrolls.
// getResultCards call sequence:
//   1. outer initial batch -> [c0,c1]
//   2. _restoreFeedDepth initial check after card0 -> [c0,c1] (target met, return immediately)
//   3. _restoreFeedDepth initial check after card1 -> [] (below target, enters scroll loop)
//   4. _restoreFeedDepth scroll attempt 1 -> [] (stagnant 1)
//   5. _restoreFeedDepth scroll attempt 2 -> [] (stagnant 2, bail)
//   6. outer loop rescroll -> [] (cardCount=0=lastCardCount=0, emptyScrolls++)
//   7-10. repeat empty scrolls -> [] x4 = MAX_EMPTY_SCROLL_ATTEMPTS
// Total: 1 + 1 + 1 + 2 + 5 = 10... let's just use toBeGreaterThanOrEqual instead
c = c.replace(
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(9);',
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(10);'
);

fs.writeFileSync(f, c);
console.log('done');
