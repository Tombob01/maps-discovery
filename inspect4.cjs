const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

const idx = c.indexOf('let previousRenderedCount = currentCards.length;');
if (idx === -1) { console.error('not found'); process.exit(1); }
console.log('context:', JSON.stringify(c.slice(idx, idx + 100)));
