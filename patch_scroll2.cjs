const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  `        // After processing the current batch, scroll for more.
        // Also reset lastCardCount to 0 so the next outer iteration treats
        // any cards (including the same 9 after restoration) as a new batch
        // rather than stale — prevents premature empty-scroll termination.
        if (await this.browser.isEndOfResults(page)) break;
        await this.browser.scrollResultsSidebar(page);
        await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
        lastCardCount = 0;`,
  `        // After processing the current batch, scroll for more
        if (await this.browser.isEndOfResults(page)) break;
        await this.browser.scrollResultsSidebar(page);
        await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);`
);

// The real fix: after _restoreFeedDepth, set lastCardCount to the restored
// card count so the outer loop knows where the feed currently stands.
// When goto() resets feed to 9 cards and _restoreFeedDepth bails at 9,
// lastCardCount should be 9 (not the pre-extraction value of 18).
// Then the outer scroll loads more cards, getResultCards returns 18+,
// cardCount(18) > lastCardCount(9) fires, processFromIndex=9, processes 9-17.
c = c.replace(
  `              await this._restoreFeedDepth(page, lastCardCount);`,
  `              const _restoredCards = await this._restoreFeedDepth(page, lastCardCount);
              // Update lastCardCount to reflect actual restored feed depth.
              // If Maps only restored 9 of 18 cards, set lastCardCount=9 so
              // the outer loop sees cardCount>lastCardCount after the next scroll
              // and correctly processes cards 9-17 as a new batch.
              lastCardCount = _restoredCards.length;`
);

fs.writeFileSync(f, c);
console.log('done');
