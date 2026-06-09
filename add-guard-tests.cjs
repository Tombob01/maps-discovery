const fs = require('fs');
const f = 'tests/unit/api/server.test.ts';
let c = fs.readFileSync(f, 'utf8');

const anchor = '});';
const lastAnchor = c.lastIndexOf(anchor);

const newTests = [
  '',
  'describe("POST /api/runs/:id/execute — concurrency guard", () => {',
  '  it("returns 409 when a discovery run is already in progress", async () => {',
  '    const facade = makeMockFacade();',
  '    // Make executeFromSeed hang so the first request never completes',
  '    let resolveFirst: () => void;',
  '    (facade.executeFromSeed as ReturnType<typeof vi.fn>).mockImplementationOnce(',
  '      () => new Promise<typeof import("../../../src/runtime/RuntimeExecutor.js").ExecutionSummary>(',
  '        (resolve) => { resolveFirst = () => resolve({ discovery: { resultsSaved: 0, jobsEnqueued: 0, resultsCollected: 0, errors: 0 }, normalization: { queriesGenerated: 0, queriesDispatched: 0, rawResultsFound: 0, recordsNormalized: 0, recordsUnique: 0, recordsDuplicate: 0, recordsExported: 0, errors: 0 } }); }',
  '      )',
  '    );',
  '',
  '    const app = createServer(facade);',
  '    const body = JSON.stringify({ provider: "mock", seeds: [{ keyword: "plumbers", location: "Lagos" }] });',
  '',
  '    // Fire first request — does not await, intentionally hangs',
  '    const first = app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });',
  '',
  '    // Small delay to ensure first request has set isExecuting = true',
  '    await new Promise(r => setTimeout(r, 10));',
  '',
  '    // Fire second request while first is still running',
  '    const second = await app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });',
  '    expect(second.status).toBe(409);',
  '    const secondBody = await second.json() as { ok: boolean; error: { code: string } };',
  '    expect(secondBody.ok).toBe(false);',
  '    expect(secondBody.error.code).toBe("CONFLICT");',
  '',
  '    // Clean up — resolve the first request',
  '    resolveFirst!();',
  '    await first;',
  '  });',
  '',
  '  it("accepts a new request after the previous run completes", async () => {',
  '    const facade = makeMockFacade();',
  '    const app = createServer(facade);',
  '    const body = JSON.stringify({ provider: "mock", seeds: [{ keyword: "plumbers", location: "Lagos" }] });',
  '',
  '    // First request completes normally',
  '    const first = await app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });',
  '    expect(first.status).toBe(200);',
  '',
  '    // Second request should also succeed',
  '    const second = await app.request("/api/runs/run-001/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body });',
  '    expect(second.status).toBe(200);',
  '  });',
  '});',
].join('\n');

c = c.slice(0, lastAnchor + anchor.length) + '\n' + newTests;
fs.writeFileSync(f, c, 'utf8');
console.log(c.includes('CONFLICT') && c.includes('409') ? 'OK' : 'FAILED');
