const fs = require('fs');
const f = 'src/api/server.ts';
let c = fs.readFileSync(f, 'utf8');

// Step 1: Remove duplicate isExecuting declaration (keep only first one)
const firstDecl = c.indexOf('let isExecuting = false;');
const secondDecl = c.indexOf('let isExecuting = false;', firstDecl + 1);
if (secondDecl !== -1) {
  c = c.slice(0, secondDecl - 2) + c.slice(secondDecl + 'let isExecuting = false;'.length);
}

// Step 2: Find and replace the broken execute route body
// Find from "isExecuting = true;" back to start of validation block
const brokenStart = c.indexOf('    isExecuting = true;\r\n    try {\r\n    for (const seed of body.seeds) {\r\n      if (!seed.keyword');
const brokenEnd = c.indexOf('\r\n  });\r\n\r\n  // ----------\r\n  // GET /api/runs/:id\r\n', brokenStart);

const replacement = [
  '    isExecuting = true;',
  '    try {',
  '      for (const seed of body.seeds) {',
  '        if (!seed.keyword?.trim()) {',
  '          isExecuting = false;',
  '          return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "each seed must have a keyword" } }, 400);',
  '        }',
  '        if (!seed.location?.trim()) {',
  '          isExecuting = false;',
  '          return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "each seed must have a location" } }, 400);',
  '        }',
  '      }',
  '      const provider: IProvider =',
  '        body.provider === "google-maps" && googleMapsProvider !== undefined',
  '          ? googleMapsProvider',
  '          : buildMockProvider(body.provider ?? "mock");',
  '      let totalResultsSaved = 0;',
  '      let totalJobsEnqueued = 0;',
  '      let totalRecordsNormalized = 0;',
  '      let totalErrors = 0;',
  '      for (const seed of body.seeds) {',
  '        const summary = await facade.executeFromSeed({',
  '          provider,',
  '          runId: runId as import("../core/types/common.js").RunID,',
  '          keyword: seed.keyword.trim(),',
  '          location: seed.location.trim(),',
  '        });',
  '        totalResultsSaved    += summary.discovery.resultsSaved;',
  '        totalJobsEnqueued    += summary.discovery.jobsEnqueued;',
  '        totalRecordsNormalized += summary.normalization.recordsNormalized;',
  '        totalErrors          += summary.normalization.errors;',
  '      }',
  '      isExecuting = false;',
  '      return c.json({',
  '        ok: true,',
  '        data: {',
  '          discovery: {',
  '            resultsSaved: totalResultsSaved,',
  '            jobsEnqueued: totalJobsEnqueued,',
  '          },',
  '          normalization: {',
  '            queriesGenerated: body.seeds.length,',
  '            queriesDispatched: body.seeds.length,',
  '            rawResultsFound: totalResultsSaved,',
  '            recordsNormalized: totalRecordsNormalized,',
  '            recordsUnique: totalRecordsNormalized,',
  '            recordsDuplicate: 0,',
  '            recordsExported: 0,',
  '            errors: totalErrors,',
  '          },',
  '        },',
  '      });',
  '    } catch (err) {',
  '      isExecuting = false;',
  '      return c.json(',
  '        { ok: false, error: { code: "EXECUTE_FAILED", message: err instanceof Error ? err.message : String(err) } },',
  '        500,',
  '      );',
  '    }',
].join('\r\n');

c = c.slice(0, brokenStart) + replacement + c.slice(brokenEnd);

fs.writeFileSync(f, c, 'utf8');

const checks = [
  c.includes('isExecuting = false'),
  c.includes('isExecuting = true'),
  c.includes('409'),
  c.includes('CONFLICT'),
  (c.match(/isExecuting = false/g) || []).length >= 3,
];
console.log('checks:', checks);
console.log(checks.every(Boolean) ? 'OK' : 'FAILED');
