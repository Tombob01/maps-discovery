const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// Remove the lastCardCount = restoredCards.length line.
// lastCardCount must only be updated by the outer loop batch detection.
// Setting it from restoredCards.length causes the outer loop to see
// cardCount === lastCardCount on next iteration and treat it as no new
// cards, triggering empty scroll counting instead of processing.
c = c.replace(
  `              const restoredCards = await this._restoreFeedDepth(page, lastCardCount);\n              lastCardCount = restoredCards.length;`,
  `              await this._restoreFeedDepth(page, lastCardCount);`
);

fs.writeFileSync(f, c);
console.log('done');
console.log('lastCardCount = restoredCards still present:', c.includes('lastCardCount = restoredCards'));
