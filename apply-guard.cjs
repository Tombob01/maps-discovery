const fs = require('fs');
const f = 'src/api/server.ts';
let c = fs.readFileSync(f, 'utf8');
const originalLength = c.length;

// 1. Add isExecuting flag after "const app = new Hono();"
c = c.replace(
  'const app = new Hono();',
  'const app = new Hono();\r\n\r\n  // Concurrency guard — one discovery run at a time\r\n  let isExecuting = false;'
);

// 2. Insert 409 check — find the exact string after runId is parsed
const guardTarget = '    let body: ExecuteRunBody;\r\n    try {\r\n      body = await c.req.json<ExecuteRunBody>();';
const guardReplacement = '    if (isExecuting) {\r\n      return c.json(\r\n        { ok: false, error: { code: "CONFLICT", message: "A discovery run is already in progress." } },\r\n        409,\r\n      );\r\n    }\r\n\r\n    let body: ExecuteRunBody;\r\n    try {\r\n      body = await c.req.json<ExecuteRunBody>();';
c = c.replace(guardTarget, guardReplacement);

// 3. Set isExecuting=true before seed loop, wrap in try/finally style
// Find the exact line before the seed loop
const loopTarget = '    try {\r\n      for (const seed of body.seeds) {\r\n        const summary = await facade.executeFromSeed({';
const loopReplacement = '    isExecuting = true;\r\n    try {\r\n      for (const seed of body.seeds) {\r\n        const summary = await facade.executeFromSeed({';
c = c.replace(loopTarget, loopReplacement);

// 4. Reset on success
c = c.replace(
  '      return c.json({\r\n        ok: true,\r\n        data: {\r\n          discovery: {',
  '      isExecuting = false;\r\n      return c.json({\r\n        ok: true,\r\n        data: {\r\n          discovery: {'
);

// 5. Reset on failure
c = c.replace(
  '    } catch (err) {\r\n      return c.json(\r\n        { ok: false, error: { code: "EXECUTE_FAILED"',
  '    } catch (err) {\r\n      isExecuting = false;\r\n      return c.json(\r\n        { ok: false, error: { code: "EXECUTE_FAILED"'
);

fs.writeFileSync(f, c, 'utf8');

const newLength = c.length;
const checks = [
  c.includes('let isExecuting = false'),
  c.includes('if (isExecuting)'),
  c.includes('409'),
  c.includes('CONFLICT'),
  c.includes('isExecuting = true'),
  (c.match(/isExecuting = false/g) || []).length === 2,
  newLength > originalLength,
];
console.log('original length:', originalLength, 'new length:', newLength);
console.log('checks:', checks);
console.log(checks.every(Boolean) ? 'OK' : 'FAILED - check which check failed');
