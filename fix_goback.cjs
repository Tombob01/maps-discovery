const fs = require('fs');
const path = 'src/providers/google-maps/GoogleMapsProvider.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Find the for loop line
let forLoopLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('for (let i = processFromIndex; i < cards.length && totalYielded < maxResults; i++)')) {
    forLoopLine = i;
    break;
  }
}
console.log('for loop at line:', forLoopLine + 1);
if (forLoopLine === -1) { console.log('ERROR'); process.exit(1); }

// Find the closing of the for loop (the } after yield result;)
let forLoopEnd = -1;
let depth = 0;
for (let i = forLoopLine; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth === 0 && i > forLoopLine) { forLoopEnd = i; break; }
}
console.log('for loop ends at line:', forLoopEnd + 1);

// Find the extractFromCard try block start
let extractTryLine = -1;
for (let i = forLoopLine; i < forLoopEnd; i++) {
  if (lines[i].includes('payload = await this.adapter.extractFromCard(')) {
    extractTryLine = i;
    break;
  }
}
console.log('extractFromCard at line:', extractTryLine + 1);

// Find the closing of the extractFromCard try/catch block
// It ends at the `} catch (extractErr) {` ... `continue; }`
let extractCatchEnd = -1;
for (let i = extractTryLine; i < forLoopEnd; i++) {
  if (lines[i].trim() === 'continue;' && lines[i+1] && lines[i+1].trim() === '}') {
    extractCatchEnd = i + 1;
    break;
  }
}
console.log('extract catch ends at line:', extractCatchEnd + 1);

// Insert the navigation recovery AFTER the extract catch block (after extractCatchEnd)
const recoveryLines = [
'          // Navigate back to search results — extractFromCard may have navigated away.',
'          // Re-query cards to avoid stale ElementHandle references.',
'          try {',
'            await page.goBack({ waitUntil: "domcontentloaded" });',
'            await page.waitForSelector(sel("resultsSidebar"), { timeout: 5000 });',
'          } catch {',
'            // best-effort recovery — if goBack fails, continue with stale page',
'          }',
'          // Re-fetch cards after navigation to avoid stale handles',
'          const freshCards = await this.adapter.getResultCards(page);',
'          const freshCard = freshCards[i];',
'          // If card is gone (DOM changed), skip this index',
'          if (freshCard === undefined) continue;',
];

lines.splice(extractCatchEnd + 1, 0, ...recoveryLines);
console.log('inserted', recoveryLines.length, 'recovery lines after line', extractCatchEnd + 1);

// Now find the resultId derivation line (after our insertion, index shifted)
// and update it to use freshCard instead of card for listingUrl
// Also update the seenPlaceIds check — resultId is derived from payload which is already extracted
// No change needed for resultId — payload was already extracted before navigation

// But we need to update the `card` reference used nowhere else in the loop
// The only `card` usage after extractFromCard is already gone (card was only used for extractFromCard)
// So the fix is complete — freshCard is available but only needed if we re-extract
// Actually we already have `payload` from extractFromCard, so no further card usage needed

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done');
