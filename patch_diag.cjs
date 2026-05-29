const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// Add diagnostic after _restoreFeedDepth call showing available vs needed index
c = c.replace(
  `              await this._restoreFeedDepth(page, lastCardCount);`,
  `              await this._restoreFeedDepth(page, lastCardCount);
              // DIAG: log available cards vs current index after restoration
              const _diagCards = await this.adapter.getResultCards(page);
              log.debug(\`post-restore i=\${i} available=\${_diagCards.length} needed_index=\${i} card_exists=\${_diagCards[i] !== undefined}\`);`
);

fs.writeFileSync(f, c);
console.log('done');
