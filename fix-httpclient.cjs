const fs = require('fs');
const f = 'src/ui/lib/httpClient.ts';
let c = fs.readFileSync(f, 'utf8');

const oldFn = [
  '  async listRecords(runId: string): Promise<BusinessRecord[]> {',
  '    const data = await apiFetch<BackendRecordPage>(',
  "      `/api/runs/${runId}/records?page=1&pageSize=500`,",
  '    );',
  '    return data.items.map(toUIRecord);',
  '  },',
].join('\r\n');

const newFn = [
  '  async listRecords(runId: string): Promise<BusinessRecord[]> {',
  '    const allRecords: BusinessRecord[] = [];',
  '    let page = 1;',
  '    const pageSize = 100;',
  '    let hasMore = true;',
  '    while (hasMore) {',
  '      const data = await apiFetch<BackendRecordPage>(',
  "        `/api/runs/${runId}/records?page=${page}&pageSize=${pageSize}`,",
  '      );',
  '      allRecords.push(...data.items.map(toUIRecord));',
  '      hasMore = data.hasMore;',
  '      page += 1;',
  '    }',
  '    return allRecords;',
  '  },',
].join('\r\n');

c = c.replace(oldFn, newFn);
fs.writeFileSync(f, c, 'utf8');
console.log(c.includes('while (hasMore)') ? 'OK' : 'FAILED');
