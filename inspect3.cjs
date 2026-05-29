const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
const c = fs.readFileSync(f, 'utf8');
let idx = 0;
let count = 0;
while ((idx = c.indexOf('this.adapter.getResultCards(page)', idx)) !== -1) {
  count++;
  console.log(`occurrence ${count} at char ${idx}:`);
  console.log(JSON.stringify(c.slice(idx, idx + 80)));
  idx++;
}
