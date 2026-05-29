const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');
c = c.replace(
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(10);',
  'expect(mockAdapter.getResultCards).toHaveBeenCalledTimes(11);'
);
fs.writeFileSync(f, c);
console.log('done');
