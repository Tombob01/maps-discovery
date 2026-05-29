const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// Replace the diag block that calls getResultCards again (consuming mock entries)
// with a reuse of _restoredCards already returned by _restoreFeedDepth
c = c.replace(
  `              // If restored feed is shorter than current index, break inner loop.
              // Outer scroll loop will load remaining cards as a new batch.
              const _diagCards = await this.adapter.getResultCards(page);
              log.debug(\`post-restore i=\${i} available=\${_diagCards.length} card_exists=\${_diagCards[i] !== undefined}\`);
              if (_diagCards[i] === undefined) {
                log.debug(\`i=\${i} out of restored feed (\${_diagCards.length} cards) — deferring to outer scroll loop\`);
                break;
              }`,
  `              // If restored feed is shorter than current index, break inner loop.
              // Outer scroll loop will scroll and reload these cards as a new batch.
              // Reuse _restoredCards from _restoreFeedDepth — no extra getResultCards call.
              log.debug(\`post-restore i=\${i} available=\${_restoredCards.length} card_exists=\${_restoredCards[i] !== undefined}\`);
              if (_restoredCards[i] === undefined) {
                log.debug(\`i=\${i} out of restored feed (\${_restoredCards.length} cards) — deferring to outer scroll loop\`);
                break;
              }`
);

fs.writeFileSync(f, c);
console.log('done');
