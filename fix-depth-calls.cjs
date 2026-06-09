const fs = require('fs');
const f = 'src/pipeline/PipelineRunner.ts';
let c = fs.readFileSync(f, 'utf8');

// Fix drain:start depth call
c = c.replace(
  '    const depthBefore = await this.queue.depth();\n    console.log(\'[drain:start] queue-depth=\' + (isOk(depthBefore) ? depthBefore.value : \'?\'));',
  '    let depthBeforeVal = \'?\';\n    try { const db = await this.queue.depth(); if (isOk(db)) depthBeforeVal = String(db.value); } catch { /* instrumentation only */ }\n    console.log(\'[drain:start] queue-depth=\' + depthBeforeVal);'
);

// Fix drain:end depth call
c = c.replace(
  '    const depthAfter = await this.queue.depth();\n    console.log(\'[drain:end] exit=\' + exitReason + \' emptyPolls=\' + emptyPolls + \' dequeued=\' + dequeueCount + \' succeeded=\' + this.stats.succeeded + \' failed=\' + this.stats.failed + \' skipped=\' + this.stats.skipped + \' queue-depth-after=\' + (isOk(depthAfter) ? depthAfter.value : \'?\'));',
  '    let depthAfterVal = \'?\';\n    try { const da = await this.queue.depth(); if (isOk(da)) depthAfterVal = String(da.value); } catch { /* instrumentation only */ }\n    console.log(\'[drain:end] exit=\' + exitReason + \' emptyPolls=\' + emptyPolls + \' dequeued=\' + dequeueCount + \' succeeded=\' + this.stats.succeeded + \' failed=\' + this.stats.failed + \' skipped=\' + this.stats.skipped + \' queue-depth-after=\' + depthAfterVal);'
);

fs.writeFileSync(f, c, 'utf8');
console.log(c.includes('depthBeforeVal') && c.includes('depthAfterVal') ? 'OK' : 'FAILED');
