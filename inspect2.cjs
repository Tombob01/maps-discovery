const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
const c = fs.readFileSync(f, 'utf8');
const idx = c.indexOf('this.adapter.getResultCards(page);\n');
if (idx === -1) { console.log('not found'); process.exit(1); }
console.log(JSON.stringify(c.slice(idx, idx + 120)));
