const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// Replace the post-restoration section: if freshCards.length < previousCardCount
// (Maps couldn't restore full depth), break the inner loop early so the outer
// loop rescrolls and discovers the remaining cards naturally.
c = c.replace(
  `          // Re-query cards after restoring feed depth.
          // goto() resets scroll to top; _restoreFeedDepth scrolls until
          // at least previousCardCount cards are rendered again (or bails out).
          const freshCards = await this._restoreFeedDepth(page, previousCardCount);
          log.debug(
            \`i=\${i} post-restore cards: \${freshCards.length} (target: \${previousCardCount})\`,
          );`,
  `          // Re-query cards after restoring feed depth.
          // goto() resets scroll to top; _restoreFeedDepth scrolls until
          // at least previousCardCount cards are rendered again (or bails out).
          const freshCards = await this._restoreFeedDepth(page, previousCardCount);
          log.debug(
            \`i=\${i} post-restore cards: \${freshCards.length} (target: \${previousCardCount})\`,
          );

          // If Maps could not restore full feed depth (virtualization limit),
          // update lastCardCount to the restored depth and break the inner loop.
          // The outer loop will scroll to load the next batch of cards naturally.
          if (freshCards.length < previousCardCount) {
            log.debug(
              \`i=\${i} feed depth partial (\${freshCards.length}/\${previousCardCount}) — deferring remaining cards to outer scroll loop\`,
            );
            lastCardCount = freshCards.length;
            break;
          }`
);

fs.writeFileSync(f, c);
console.log('done');
console.log('feed depth partial present:', c.includes('feed depth partial'));
