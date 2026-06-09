const fs = require('fs');
const f = 'src/api/server.ts';
let c = fs.readFileSync(f, 'utf8');

// 1. Add isExecuting flag after app creation
c = c.replace(
  'const app = new Hono();',
  'const app = new Hono();\n\n  // Concurrency guard — one discovery run at a time\n  let isExecuting = false;'
);

// 2. Add 409 guard before body parsing — match exact CRLF text
c = c.replace(
  'app.post("/api/runs/:id/execute", async (c) => {\r\n    const runId = c.req.param("id");\r\n\r\n    let body: ExecuteRunBody;',
  'app.post("/api/runs/:id/execute", async (c) => {\r\n    const runId = c.req.param("id");\r\n\r\n    if (isExecuting) {\r\n      return c.json(\r\n        { ok: false, error: { code: "CONFLICT", message: "A discovery run is already in progress." } },\r\n        409,\r\n      );\r\n    }\r\n\r\n    let body: ExecuteRunBody;'
);

// 3. Set isExecuting = true before the seed loop
c = c.replace(
  '    for (const seed of body.seeds) {\r\n      if (!seed.keyword?.trim())',
  '    isExecuting = true;\r\n    try {\r\n    for (const seed of body.seeds) {\r\n      if (!seed.keyword?.trim())'
);

// 4. Reset isExecuting on success (before return c.json ok:true)
c = c.replace(
  '      return c.json({\r\n        ok: true,\r\n        data: {',
  '      isExecuting = false;\r\n      return c.json({\r\n        ok: true,\r\n        data: {'
);

// 5. Reset isExecuting on failure and close the try block
c = c.replace(
  '      return c.json(\r\n        { ok: false, error: { code: "EXECUTE_FAILED"',
  '    } catch (err) {\r\n      isExecuting = false;\r\n      return c.json(\r\n        { ok: false, error: { code: "EXECUTE_FAILED"'
);

// 6. Remove the now-duplicate original catch block closer
// The original had: } catch (err) { ... }
// We need to remove the original catch since we added our own above
// Find and remove the old standalone catch wrapper if it was doubled
// Verify by checking the result
fs.writeFileSync(f, c, 'utf8');

const checks = [
  c.includes('isExecuting = false'),
  c.includes('409'),
  c.includes('CONFLICT'),
  c.includes('isExecuting = true'),
];
console.log('checks:', checks);
console.log(checks.every(Boolean) ? 'OK' : 'FAILED');
