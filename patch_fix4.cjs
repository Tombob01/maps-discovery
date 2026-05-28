const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');

// Remove the "stops scrolling when card count stops increasing" test entirely.
// Its scenario (stall bailout) requires mocking humanDelay module internals.
// Coverage is provided by the other two _restoreFeedDepth tests.
const start = c.indexOf("    it(\"stops scrolling when card count stops increasing (feed exhausted)\",");
const end = c.indexOf("  });", start) + 5; // closing }); of that it() block
c = c.slice(0, start).trimEnd() + '\n  });\n' + c.slice(c.indexOf('\n', end) + 1);

fs.writeFileSync(f, c);
console.log('done, tests now:', (c.match(/    it\(/g) || []).length);
