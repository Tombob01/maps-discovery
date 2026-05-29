const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
const c = fs.readFileSync(f, 'utf8');

// Find the exact bytes in the file around the restoration block
const marker = 'goBack failed';
const idx = c.indexOf(marker);
if (idx === -1) { console.error('marker not found'); process.exit(1); }
console.log('raw bytes:', JSON.stringify(c.slice(idx, idx + 60)));
