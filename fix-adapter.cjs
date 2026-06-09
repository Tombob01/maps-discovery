const fs = require('fs');
const f = 'src/storage/PostgresRunServiceAdapter.ts';
let c = fs.readFileSync(f, 'utf8');

const oldBlock = [
  '    // a run filter is not exposed by storage.IRecordStore by design.',
  '    let allRecords: readonly BusinessRecord[];',
  '    if (typeof req.runId === "string" && req.runId.length > 0) {',
  '      allRecords = await this.store.getByRunId(req.runId);',
  '    } else {',
  '      allRecords = [];',
  '    }',
  '',
  '    const total = allRecords.length;',
  '    const start = (page - 1) * pageSize;',
  '    const items = allRecords.slice(start, start + pageSize);',
].join('\r\n');

const newBlock = [
  '    // a run filter is not exposed by storage.IRecordStore by design.',
  '    let items: readonly BusinessRecord[];',
  '    let total: number;',
  '    if (typeof req.runId === "string" && req.runId.length > 0) {',
  '      const offset = (page - 1) * pageSize;',
  '      [items, total] = await Promise.all([',
  '        this.store.getByRunIdPaginated(req.runId, pageSize, offset),',
  '        this.store.countByRunId(req.runId),',
  '      ]);',
  '    } else {',
  '      items = [];',
  '      total = 0;',
  '    }',
].join('\r\n');

c = c.replace(oldBlock, newBlock);
fs.writeFileSync(f, c, 'utf8');
console.log(c.includes('getByRunIdPaginated') && c.includes('countByRunId') && !c.includes('allRecords') ? 'OK' : 'FAILED');
