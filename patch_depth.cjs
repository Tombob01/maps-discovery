const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// 1. Replace MAX_FEED_DEPTH_RESTORE_ATTEMPTS constant with two new constants
c = c.replace(
  `/**
 * Maximum scroll attempts when re-hydrating feed depth after search page restoration.
 * Each scroll typically loads ~9 additional cards; 10 attempts covers ~90 extra cards
 * on top of the initial ~9 rendered on fresh load, sufficient for the 120-result cap.
 */
const MAX_FEED_DEPTH_RESTORE_ATTEMPTS = 10;`,
  `/**
 * Maximum total scroll attempts when re-hydrating feed depth after search page restoration.
 * Each scroll typically loads ~9 additional cards; 5 attempts × ~9 cards = ~45 additional
 * cards on top of the initial ~9, covering most real-world result sets.
 */
const MAX_FEED_DEPTH_RESTORE_ATTEMPTS = 5;

/**
 * How many consecutive scroll attempts that produce no new cards before giving up.
 * Google Maps lazy rendering is asynchronous — a single non-increasing scroll does NOT
 * mean the feed is exhausted. Require this many stagnant scrolls before bailing out.
 */
const MAX_FEED_DEPTH_STAGNANT_ATTEMPTS = 2;`
);

// 2. Replace the entire _restoreFeedDepth method body
c = c.replace(
  `  private async _restoreFeedDepth(
    page: import('playwright').Page,
    targetCount: number,
  ): Promise<object[]> {
    let currentCards = await this.adapter.getResultCards(page);
    if (currentCards.length >= targetCount) return currentCards;

    for (let attempt = 0; attempt < MAX_FEED_DEPTH_RESTORE_ATTEMPTS; attempt++) {
      const before = currentCards.length;
      await this.browser.scrollResultsSidebar(page);
      await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);
      currentCards = await this.adapter.getResultCards(page);

      log.debug(
        \`_restoreFeedDepth attempt \${attempt + 1}: \${currentCards.length}/\${targetCount} cards\`,
      );

      if (currentCards.length >= targetCount) break;
      if (currentCards.length === before) break;
    }

    return currentCards;
  }`,
  `  private async _restoreFeedDepth(
    page: import('playwright').Page,
    targetCount: number,
  ): Promise<object[]> {
    let currentCards = await this.adapter.getResultCards(page);
    if (currentCards.length >= targetCount) {
      log.debug(
        \`_restoreFeedDepth: target \${targetCount} met immediately (\${currentCards.length} cards)\`,
      );
      return currentCards;
    }

    // Google Maps lazy rendering is asynchronous after a full page restoration.
    // A single scroll often produces no immediate DOM change even though more
    // cards will appear after a short settle delay. Track consecutive stagnant
    // attempts separately from total attempts so one empty scroll doesn't abort.
    let stagnantAttempts = 0;
    let previousRenderedCount = currentCards.length;

    for (let attempt = 0; attempt < MAX_FEED_DEPTH_RESTORE_ATTEMPTS; attempt++) {
      await this.browser.scrollResultsSidebar(page);
      // Use a slightly longer settle window after restoration — Maps lazy rendering
      // is slower after a full goto() than during normal incremental scrolling.
      await humanDelay(SCROLL_SETTLE_MAX_MS, SCROLL_SETTLE_MAX_MS + 500);
      currentCards = await this.adapter.getResultCards(page);

      const grew = currentCards.length > previousRenderedCount;
      if (grew) {
        stagnantAttempts = 0;
        log.debug(
          \`_restoreFeedDepth attempt \${attempt + 1}: \${previousRenderedCount} -> \${currentCards.length}/\${targetCount} cards (growing)\`,
        );
        previousRenderedCount = currentCards.length;
      } else {
        stagnantAttempts++;
        log.debug(
          \`_restoreFeedDepth attempt \${attempt + 1}: \${currentCards.length}/\${targetCount} cards (stagnant \${stagnantAttempts}/\${MAX_FEED_DEPTH_STAGNANT_ATTEMPTS})\`,
        );
      }

      if (currentCards.length >= targetCount) {
        log.debug(\`_restoreFeedDepth: target \${targetCount} reached after \${attempt + 1} scrolls\`);
        break;
      }
      if (stagnantAttempts >= MAX_FEED_DEPTH_STAGNANT_ATTEMPTS) {
        log.debug(
          \`_restoreFeedDepth: bailing after \${stagnantAttempts} stagnant scrolls (best: \${currentCards.length}/\${targetCount})\`,
        );
        break;
      }
    }

    return currentCards;
  }`
);

fs.writeFileSync(f, c);
console.log('done');
console.log('MAX_FEED_DEPTH_STAGNANT_ATTEMPTS present:', c.includes('MAX_FEED_DEPTH_STAGNANT_ATTEMPTS'));
console.log('stagnantAttempts present:', c.includes('stagnantAttempts'));
