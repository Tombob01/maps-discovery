const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// After restoration, if the current card index is beyond the restored feed,
// break the inner loop. The outer scroll loop will reload these cards.
c = c.replace(
  `              // DIAG: log available cards vs current index after restoration
              const _diagCards = await this.adapter.getResultCards(page);
              log.debug(\`post-restore i=\${i} available=\${_diagCards.length} needed_index=\${i} card_exists=\${_diagCards[i] !== undefined}\`);`,
  `              // If restored feed is shorter than current index, break inner loop.
              // Outer scroll loop will load remaining cards as a new batch.
              const _diagCards = await this.adapter.getResultCards(page);
              log.debug(\`post-restore i=\${i} available=\${_diagCards.length} card_exists=\${_diagCards[i] !== undefined}\`);
              if (_diagCards[i] === undefined) {
                log.debug(\`i=\${i} out of restored feed (\${_diagCards.length} cards) — deferring to outer scroll loop\`);
                break;
              }`
);

fs.writeFileSync(f, c);
console.log('done');
