const fs = require('fs');
const path = 'src/providers/google-maps/GoogleMapsProvider.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Find "await this._restoreFeedDepth(page, lastCardCount);"
let targetLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('await this._restoreFeedDepth(page, lastCardCount);')) {
    targetLine = i;
    break;
  }
}
console.log('_restoreFeedDepth call at line:', targetLine + 1);
if (targetLine === -1) { console.log('ERROR'); process.exit(1); }

// Replace with version that captures return value - but we dont use it in loop
// Actually the fix is: after restoreFeedDepth, update lastCardCount to the returned cards length
// so the outer loop doesnt re-query unnecessarily
lines[targetLine] = lines[targetLine].replace(
  'await this._restoreFeedDepth(page, lastCardCount);',
  'const restoredCards = await this._restoreFeedDepth(page, lastCardCount);\n              lastCardCount = restoredCards.length;'
);

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done');
