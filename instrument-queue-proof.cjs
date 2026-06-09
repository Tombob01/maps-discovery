const fs = require('fs');

// --- 1. DiscoveryRunner: log enqueue result + depth after all enqueues ---
const df = 'src/runtime/DiscoveryRunner.ts';
let dc = fs.readFileSync(df, 'utf8');

dc = dc.replace(
  '        await this.normalizationQueue.enqueue(payload);\n        jobsEnqueued++;',
  '        const enqResult = await this.normalizationQueue.enqueue(payload);\n        if (enqResult.ok) { jobsEnqueued++; } else { console.log(\'[discovery:enqueue-fail] reason=\' + enqResult.error.code + \' rawResultId=\' + payload.rawResultId); errors++; }'
);

// Log queue depth after generator finishes
dc = dc.replace(
  '    return { resultsCollected',
  '    const qDepth = await this.normalizationQueue.depth();\n    const qDepthVal = qDepth.ok ? qDepth.value : \'?\';\n    console.log(\'[discovery:done] resultsCollected=\' + resultsCollected + \' resultsSaved=\' + resultsSaved + \' jobsEnqueued=\' + jobsEnqueued + \' errors=\' + errors + \' queue-depth-after-enqueue=\' + qDepthVal);\n    return { resultsCollected'
);

fs.writeFileSync(df, dc, 'utf8');
console.log('DiscoveryRunner:', dc.includes('[discovery:done]') && dc.includes('[discovery:enqueue-fail]') ? 'OK' : 'FAILED');

// --- 2. createServices: log queue instance identity ---
const sf = 'src/runtime/createServices.ts';
let sc = fs.readFileSync(sf, 'utf8');

sc = sc.replace(
  'const createDiscoveryRunner = (provider: IProvider): DiscoveryRunner =>\n    new DiscoveryRunner(provider, rawResultStore, normalizationQueue);',
  'const createDiscoveryRunner = (provider: IProvider): DiscoveryRunner => {\n    console.log(\'[services:createDiscoveryRunner] queue-name=\' + normalizationQueue.name + \' queue-ref=\' + (normalizationQueue as any)._instanceId);\n    return new DiscoveryRunner(provider, rawResultStore, normalizationQueue);\n  };'
);

// Add instance ID to queue for identity tracking
sc = sc.replace(
  'const normalizationQueue: IQueue<NormalizationJobPayload> =\n    overrides.normalizationQueue ?? new InMemoryQueue<NormalizationJobPayload>("normalization");',
  'const normalizationQueue: IQueue<NormalizationJobPayload> =\n    overrides.normalizationQueue ?? new InMemoryQueue<NormalizationJobPayload>("normalization");\n  (normalizationQueue as any)._instanceId = Math.random().toString(36).slice(2, 8);\n  console.log(\'[services:init] queue-instance=\' + (normalizationQueue as any)._instanceId);'
);

// Log coordinator queue identity
sc = sc.replace(
  'const coordinator = new RunCoordinator(lifecycle, normalizer, normalizationQueue, {',
  'console.log(\'[services:coordinator] queue-ref=\' + (normalizationQueue as any)._instanceId);\n  const coordinator = new RunCoordinator(lifecycle, normalizer, normalizationQueue, {'
);

fs.writeFileSync(sf, sc, 'utf8');
console.log('createServices:', sc.includes('[services:init]') && sc.includes('[services:coordinator]') ? 'OK' : 'FAILED');
