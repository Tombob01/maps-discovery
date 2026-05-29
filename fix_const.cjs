const fs = require('fs');
const path = 'src/providers/google-maps/GoogleMapsProvider.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

let found = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('SEARCH_RESTORE_TIMEOUT_MS')) {
    // Remove the const line and any comment line above it
    let start = i;
    if (lines[i-1] && (lines[i-1].trim().startsWith('*') || lines[i-1].trim().startsWith('/**') || lines[i-1].trim().startsWith('//'))) {
      // walk back to find comment block start
      let j = i - 1;
      while (j >= 0 && (lines[j].trim().startsWith('*') || lines[j].trim().startsWith('/**') || lines[j].trim().startsWith('//'))) j--;
      start = j + 1;
    }
    found = start;
    lines.splice(start, i - start + 1);
    console.log('removed lines', start+1, 'to', i+1);
    break;
  }
}
if (found === -1) { console.log('ERROR: not found'); process.exit(1); }
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done');
