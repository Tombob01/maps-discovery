const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// Replace the partial-break condition: instead of breaking whenever
// freshCards.length < previousCardCount (too aggressive — fires even when
// the current card i is still within the restored feed), only break when
// the next card index would be out of bounds in the restored feed.
c = c.replace(
  `          // If Maps could not restore full feed depth (virtualization limit),
          // update lastCardCount to the restored depth and break the inner loop.
          // The outer loop will scroll to load the next batch of cards naturally.
          if (freshCards.length < previousCardCount) {
            log.debug(
              \`i=\${i} feed depth partial (\${freshCards.length}/\${previousCardCount}) — deferring remaining cards to outer scroll loop\`,
            );
            lastCardCount = freshCards.length;
            break;
          }`,
  `          // If Maps could not restore full feed depth (virtualization limit),
          // check whether remaining cards in this batch are still accessible.
          // If the next index (i+1) is beyond the restored feed, break now and
          // let the outer scroll loop discover the remaining cards naturally.
          if (freshCards.length < previousCardCount && i + 1 >= freshCards.length) {
            log.debug(
              \`i=\${i} feed depth partial (\${freshCards.length}/\${previousCardCount}) — next index \${i + 1} out of range, deferring to outer scroll loop\`,
            );
            lastCardCount = freshCards.length;
            break;
          }`
);

fs.writeFileSync(f, c);
console.log('done');
