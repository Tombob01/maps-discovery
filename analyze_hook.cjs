const fs = require('fs');
const path = 'src/ui/hooks/useDiscoveryFlow.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Find the .then(summary => block and state.runId usage
let summaryThenLine = -1;
let stateRunIdLine = -1;
let processedLine = -1;
let executeRunReturnLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('.then(summary =>')) summaryThenLine = i;
  if (lines[i].includes('state.runId as string')) stateRunIdLine = i;
  if (lines[i].includes('normalization.processed')) processedLine = i;
  if (lines[i].includes('return facade.executeRun(')) executeRunReturnLine = i;
}

console.log('summaryThen at line', summaryThenLine+1);
console.log('stateRunId at line', stateRunIdLine+1);
console.log('processed field at line', processedLine+1);
console.log('executeRun return at line', executeRunReturnLine+1);

// Fix 1: Add console.log before executeRun return and capture runId in closure
// The runId is already captured correctly in .then(({ runId }) => {
// We just need to thread it through to the summary handler

// Fix 2: state.runId → runId (captured in outer .then)
// We do this by restructuring: nest the summary .then inside the createRun .then

// Find the closing of executeRun call to restructure
let executeRunClose = -1;
let depth = 0;
for (let i = executeRunReturnLine; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
  }
  if (depth <= 0 && i > executeRunReturnLine) { executeRunClose = i; break; }
}
console.log('executeRun closes at line', executeRunClose+1);

// Simple targeted fixes:
// 1. Fix normalization.processed → normalization.recordsNormalized
if (processedLine !== -1) {
  lines[processedLine] = lines[processedLine].replace('normalization.processed', 'normalization.recordsNormalized');
  console.log('Fixed normalization field');
}

// 2. Add console.log inside createRun .then after runId is captured
const createRunThenLine = lines.findIndex(l => l.includes(".then(({ runId }) => {"));
if (createRunThenLine !== -1) {
  lines.splice(createRunThenLine + 1, 0, "        console.log('[startRun] createRun resolved, runId:', runId);");
  console.log('Added createRun log at line', createRunThenLine+2);
  // Recalculate after splice
  if (stateRunIdLine > createRunThenLine) stateRunIdLine++;
  if (summaryThenLine > createRunThenLine) summaryThenLine++;
}

// 3. Restructure: wrap executeRun + summary handler inside createRun .then
// by converting the standalone .then(summary => to be nested
// Find the return facade.executeRun line again after splice
const execLine = lines.findIndex(l => l.includes('return facade.executeRun('));
console.log('executeRun line after splice:', execLine+1);

// Find end of executeRun args (closing paren + semicolon of the return)
let execDepth = 0;
let execEnd = -1;
for (let i = execLine; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '(') execDepth++;
    if (ch === ')') execDepth--;
  }
  if (execDepth === 0 && i > execLine) { execEnd = i; break; }
}
console.log('executeRun arg close at line', execEnd+1);

// The .then(summary => starts after the executeRun return
// We need to change: return facade.executeRun(...); \n })\n .then(summary =>
// to: return facade.executeRun(...).then(summary =>
// and fix state.runId to runId

// Find summary then line after splice
const sumLine = lines.findIndex(l => l.includes('.then(summary =>'));
console.log('sumLine after splice:', sumLine+1);

// The line before sumLine should be `      })` (closing of createRun .then)
// We need to:
// 1. Remove the `});` at execEnd and `      })` + `.then(summary =>` 
// 2. Replace with `.then(summary =>`  attached to executeRun

// Simpler approach: just fix state.runId → use a workaround
// Find state.runId as string line
const stateRunLine = lines.findIndex(l => l.includes('state.runId as string'));
if (stateRunLine !== -1) {
  // Replace the whole getRun block
  // Find the line with 'return facade.getRun('
  const getRunLine = lines.findIndex(l => l.includes('return facade.getRun('));
  console.log('getRun at line', getRunLine+1);
  
  // We need to pass runId here but it's out of scope
  // The fix: move the summary .then INSIDE the createRun .then
  // Find the boundary: the }) that closes createRun .then before .then(summary =>
  
  // Look backwards from sumLine for the standalone })
  let closingLine = sumLine - 1;
  while (closingLine > execLine && lines[closingLine].trim() !== '})') closingLine--;
  console.log('closing }) at line', closingLine+1, ':', lines[closingLine]);
  
  if (lines[closingLine].trim() === '})') {
    // Remove the `      })` line and the `.then(summary =>` line
    // and replace with `.then(summary =>` attached inline
    // Also need to add runId parameter
    
    // Step 1: remove the }) closing line
    lines.splice(closingLine, 1);
    
    // Step 2: the sumLine shifted by -1
    const newSumLine = lines.findIndex(l => l.includes('.then(summary =>'));
    console.log('newSumLine:', newSumLine+1);
    
    // Step 3: Change .then(summary => to .then(summary => (nested, needs indent fix)
    // and add runId parameter: .then(summary => { ... return facade.getRun(runId); ...})
    // For now just fix state.runId
    const newStateRunLine = lines.findIndex(l => l.includes('state.runId as string'));
    if (newStateRunLine !== -1) {
      // Find the comment lines above and the actual getRun call
      // Replace the multi-line getRun block with a single line
      let blockStart = newStateRunLine;
      while (blockStart > 0 && !lines[blockStart-1].includes('return facade.getRun(')) blockStart--;
      blockStart--; // now at return facade.getRun(
      
      // Find block end
      let blockEnd = newStateRunLine;
      while (blockEnd < lines.length && !lines[blockEnd].includes(');')) blockEnd++;
      
      console.log('getRun block:', blockStart+1, 'to', blockEnd+1);
      
      // Replace the whole block with a single line using a closure variable
      // We can't use runId directly here since it's still out of scope
      // Instead add a NOTE and use a different approach:
      // Add runId as a variable before the chain starts
      console.log('NOTE: runId still out of scope at getRun call - needs chain restructure');
    }
  }
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done');
