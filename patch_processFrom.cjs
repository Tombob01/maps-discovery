const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// When breaking due to out-of-range card after restoration,
// reset lastCardCount to processFromIndex so the outer loop
// treats the next getResultCards result as a new batch.
c = c.replace(
  `              if (_restoredCards[i] === undefined) {
                log.debug(\`i=\${i} out of restored feed (\${_restoredCards.length} cards) — deferring to outer scroll loop\`);
                break;
              }`,
  `              if (_restoredCards[i] === undefined) {
                log.debug(\`i=\${i} out of restored feed (\${_restoredCards.length} cards) — deferring to outer scroll loop\`);
                lastCardCount = processFromIndex;
                break;
              }`
);

fs.writeFileSync(f, c);
console.log('done');
