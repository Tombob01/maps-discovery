const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// After the for-loop, the outer loop scrolls — but only AFTER re-querying cards
// and finding cardCount === lastCardCount (9===9), which wastes 4 empty scroll attempts.
// Fix: after the for-loop finishes a full batch, scroll immediately before looping back
// so the next getResultCards call sees fresh cards.
c = c.replace(
  `        // After processing the current batch, scroll for more
        if (await this.browser.isEndOfResults(page)) break;
        await this.browser.scrollResultsSidebar(page);
        await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);`,
  `        // After processing the current batch, scroll for more.
        // Also reset lastCardCount to 0 so the next outer iteration treats
        // any cards (including the same 9 after restoration) as a new batch
        // rather than stale — prevents premature empty-scroll termination.
        if (await this.browser.isEndOfResults(page)) break;
        await this.browser.scrollResultsSidebar(page);
        await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
        lastCardCount = 0;`
);

fs.writeFileSync(f, c);
console.log('done');
console.log('lastCardCount = 0 present:', c.includes('lastCardCount = 0'));
