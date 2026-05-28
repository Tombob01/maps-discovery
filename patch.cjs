const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// 1. Add MAX_FEED_DEPTH_RESTORE_ATTEMPTS constant
c = c.replace(
  '/** How many scroll attempts before declaring end-of-results. */\nconst MAX_EMPTY_SCROLL_ATTEMPTS = 4;',
  '/** How many scroll attempts before declaring end-of-results. */\nconst MAX_EMPTY_SCROLL_ATTEMPTS = 4;\n\n/**\n * Maximum scroll attempts when re-hydrating feed depth after search page restoration.\n * Each scroll typically loads ~9 additional cards; 10 attempts covers ~90 extra cards\n * on top of the initial ~9 rendered on fresh load, sufficient for the 120-result cap.\n */\nconst MAX_FEED_DEPTH_RESTORE_ATTEMPTS = 10;'
);

// 2. Capture previousCardCount before extraction
c = c.replace(
  '          // Extract raw payload',
  '          // Capture how many cards were loaded before we navigate away.\n          // After restoration, goto() resets the feed scroll to the top and\n          // Maps only renders the first ~9 cards again. We need to re-scroll\n          // to at least this depth before re-querying cards.\n          const previousCardCount = cards.length;\n\n          // Extract raw payload'
);

// 3. Replace freshCards assignment to use _restoreFeedDepth
c = c.replace(
  '          // Re-query cards from the freshly-loaded search page.\n          // All ElementHandles from before navigation are stale and must not\n          // be reused \u2014 Playwright will throw "Element is not attached" if they are.\n          const freshCards = await this.adapter.getResultCards(page);\n          log.debug(\n            `i=${i} post-restore cards: ${freshCards.length} (pre-extraction: ${cards.length})`,\n          );',
  '          // Re-query cards after restoring feed depth.\n          // goto() resets scroll to top; _restoreFeedDepth scrolls until\n          // at least previousCardCount cards are rendered again (or bails out).\n          const freshCards = await this._restoreFeedDepth(page, previousCardCount);\n          log.debug(\n            `i=${i} post-restore cards: ${freshCards.length} (target: ${previousCardCount})`,\n          );'
);

// 4. Insert _restoreFeedDepth before _syntheticId
const anchor = '  /**\n   * Creates a synthetic result ID when no Place ID is available.';
const newMethod = `  /**
   * After restoring the search page via goto(), Maps resets the feed scroll
   * position to the top and only renders the first batch of cards (~9).
   * This helper re-scrolls the feed until at least \`targetCount\` cards are
   * visible, mirroring the depth that was loaded before the detail panel visit.
   *
   * Returns the card array at the point we stop (either target reached,
   * scroll stalled, or max attempts exhausted). The caller uses this as
   * \`freshCards\` to avoid a redundant extra getResultCards() call.
   *
   * Bounded by MAX_FEED_DEPTH_RESTORE_ATTEMPTS to prevent infinite loops.
   */
  private async _restoreFeedDepth(
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
  }

  /**
   * Creates a synthetic result ID when no Place ID is available.`;

c = c.replace(anchor, newMethod);

fs.writeFileSync(f, c);

// Verify
const out = fs.readFileSync(f, 'utf8');
console.log('MAX_FEED_DEPTH_RESTORE_ATTEMPTS present:', out.includes('MAX_FEED_DEPTH_RESTORE_ATTEMPTS'));
console.log('previousCardCount present:', out.includes('previousCardCount'));
console.log('_restoreFeedDepth present:', out.includes('_restoreFeedDepth'));
