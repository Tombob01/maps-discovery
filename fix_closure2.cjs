const fs = require('fs');
const path = 'src/ui/hooks/useDiscoveryFlow.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Current structure (after previous splice added console.log at line 181):
// 180: .then(({ runId }) => {
// 181:   console.log(...)   <- just added
// 182:   addEvent(`run created...`)
// ...
// 189:   return facade.executeRun({...
// 196:   });          <- closes executeRun args
// 197: })             <- closes createRun .then   <-- REMOVE THIS
// 198: .then(summary => {   <-- NEST THIS INSIDE instead
// 199:   addEvent(...)
// 200:   addEvent(discovery done - fixed field)
// 201:   dispatch progress 70
// 202-207: comments
// 208:   return facade.getRun(
// 209:     // comment
// 210:     // comment  
// 211:     state.runId as string,   <-- FIX to runId
// 212:   );
// 213: })   <- closes summary .then

// Find the }) that closes createRun .then (line 197 = index 196)
let createRunClose = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '})' && i > 185 && i < 200) {
    // Check next non-empty line is .then(summary =>
    for (let j = i+1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      if (lines[j].includes('.then(summary =>')) { createRunClose = i; }
      break;
    }
  }
}
console.log('createRun close at line:', createRunClose+1, ':', lines[createRunClose]);

if (createRunClose === -1) { console.log('ERROR: not found'); process.exit(1); }

// Find the .then(summary => line
const sumLine = lines.findIndex((l, i) => i > createRunClose && l.includes('.then(summary =>'));
console.log('summary .then at line:', sumLine+1);

// Find state.runId line
const stateRunLine = lines.findIndex(l => l.includes('state.runId as string'));
console.log('state.runId at line:', stateRunLine+1);

// Find the end of the summary .then block (the closing })
let sumClose = -1;
let depth = 0;
for (let i = sumLine; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth < 0 && i > sumLine) { sumClose = i; break; }
  if (depth === 0 && i > sumLine && lines[i].trim().startsWith('}')) { sumClose = i; break; }
}
console.log('summary close at line:', sumClose+1, ':', lines[sumClose]);

// Step 1: Fix state.runId → runId
lines[stateRunLine] = lines[stateRunLine].replace('state.runId as string', 'runId');
console.log('Fixed state.runId → runId');

// Step 2: Remove comment lines between return facade.getRun( and state.runId
// Find return facade.getRun(
const getRunLine = lines.findIndex(l => l.includes('return facade.getRun('));
console.log('getRun at line:', getRunLine+1);

// Remove the comment lines between getRun( and the runId arg
// These are lines getRunLine+1 to stateRunLine-1 (after our fix, stateRunLine is same index)
const commentStart = getRunLine + 1;
const commentEnd = lines.findIndex((l, i) => i >= commentStart && l.includes('runId'));
console.log('removing comment lines', commentStart+1, 'to', commentEnd);
if (commentEnd > commentStart) {
  lines.splice(commentStart, commentEnd - commentStart);
  console.log('removed', commentEnd - commentStart, 'comment lines');
}

// Recalculate after splice
const newSumClose = lines.findIndex((l, i) => {
  if (i <= sumLine) return false;
  let d = 0;
  // just find the }) after the summary block
  return l.trim() === '})' && i > sumLine + 5;
});

// Step 3: Remove `      })` that closes createRun .then (now at createRunClose)
const newCreateRunClose = lines.findIndex((l, i) => 
  i > 185 && i < 205 && l.trim() === '})' && (() => {
    for (let j = i+1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      return lines[j].includes('.then(summary =>');
    }
    return false;
  })()
);
console.log('new createRun close at line:', newCreateRunClose+1);

if (newCreateRunClose !== -1) {
  lines.splice(newCreateRunClose, 1);
  console.log('removed createRun closing })');
}

// Step 4: Fix the .then(summary => line indentation (now nested inside createRun .then)
// and add console.log
const newSumLine = lines.findIndex(l => l.includes('.then(summary =>'));
console.log('newSumLine:', newSumLine+1);
lines[newSumLine] = '        }).then(summary => {';

// Step 5: Add console.log after the summary handler opens
lines.splice(newSumLine + 1, 0, "          console.log('[startRun] executeRun resolved, resultsFound:', summary.discovery.resultsFound);");

// Step 6: Fix getRun log
const getRunLineFinal = lines.findIndex(l => l.includes('return facade.getRun('));
lines.splice(getRunLineFinal, 0, "          console.log('[startRun] calling getRun with runId:', runId);");

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done');
