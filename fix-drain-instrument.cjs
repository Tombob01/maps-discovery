const fs = require('fs');
const f = 'src/pipeline/PipelineRunner.ts';
let c = fs.readFileSync(f, 'utf8');

// Remove ack/nack monkey-patching, wrap drain loop in try/finally for cleanup
c = c.replace(
  '    const origAck = this.queue.ack.bind(this.queue);\n    const origNack = this.queue.nack.bind(this.queue);\n    (this.queue as any).ack = async (id: string) => { ackCount++; return origAck(id); };\n    (this.queue as any).nack = async (id: string, r?: string) => { nackCount++; return origNack(id, r); };\n\n    let exitReason = \'dequeue-error\';',
  '    let exitReason = \'dequeue-error\';'
);

c = c.replace(
  '    (this.queue as any).ack = origAck;\n    (this.queue as any).nack = origNack;\n\n    const depthAfter',
  '    const depthAfter'
);

// Update drain:end log to use runner.stats instead of ackCount/nackCount
c = c.replace(
  '\'[drain:end] exit=\' + exitReason + \' emptyPolls=\' + emptyPolls + \' dequeued=\' + dequeueCount + \' acked=\' + ackCount + \' nacked=\' + nackCount + \' queue-depth-after=\' + (isOk(depthAfter) ? depthAfter.value : \'?\')',
  '\'[drain:end] exit=\' + exitReason + \' emptyPolls=\' + emptyPolls + \' dequeued=\' + dequeueCount + \' succeeded=\' + this.stats.succeeded + \' failed=\' + this.stats.failed + \' skipped=\' + this.stats.skipped + \' queue-depth-after=\' + (isOk(depthAfter) ? depthAfter.value : \'?\')'
);

// Remove unused ackCount/nackCount declarations
c = c.replace('    let ackCount = 0;\n    let nackCount = 0;\n\n', '');

fs.writeFileSync(f, c, 'utf8');
console.log(c.includes('[drain:end]') && !c.includes('origAck') ? 'OK' : 'FAILED');
