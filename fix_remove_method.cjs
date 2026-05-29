const fs = require('fs');
const path = 'src/providers/google-maps/GoogleMapsProvider.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Find _restoreSearchPage start (including doc comment)
let methodStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('private async _restoreSearchPage(')) {
    // Walk back to find the doc comment start
    let j = i - 1;
    while (j >= 0 && (lines[j].trim().startsWith('*') || lines[j].trim().startsWith('/*') || lines[j].trim().startsWith('//'))) j--;
    methodStart = j + 1;
    break;
  }
}

// Find method end (closing })
let methodEnd = -1;
let depth = 0;
let inMethod = false;
for (let i = methodStart; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { depth++; inMethod = true; }
    if (ch === '}') depth--;
  }
  if (inMethod && depth === 0) { methodEnd = i; break; }
}

console.log('_restoreSearchPage: lines', methodStart+1, 'to', methodEnd+1);
if (methodStart === -1 || methodEnd === -1) { console.log('ERROR'); process.exit(1); }

lines.splice(methodStart, methodEnd - methodStart + 1);
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
