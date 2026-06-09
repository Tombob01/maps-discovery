const fs = require('fs');
const f = 'src/storage/PostgresRecordRepository.ts';
let c = fs.readFileSync(f, 'utf8');

// Remove the broken method inserted by the previous patch
c = c.replace(
  /\/\/ getByRunIdPaginated\r?\n  \/\/ -{75,}\r?\n\r?\n  async getByRunIdPaginated[\s\S]*?return rows\.map\(rowToRecord\);\r?\n  \}\r?\n\r?\n  /,
  ''
);

// Insert correct method before countByRunId section
const anchor = '  // ---------------------------------------------------------------------------\r\n  // countByRunId';
const insert = [
  '  // ---------------------------------------------------------------------------',
  '  // getByRunIdPaginated',
  '  // ---------------------------------------------------------------------------',
  '',
  '  async getByRunIdPaginated(runId: string, limit: number, offset: number): Promise<readonly BusinessRecord[]> {',
  '    const { rows } = await this.db.query<BusinessRecordRow>(',
  "      'SELECT * FROM businesses WHERE run_id = $1 ORDER BY collected_at ASC LIMIT $2 OFFSET $3',",
  '      [runId, limit, offset],',
  '    );',
  '    return rows.map(rowToRecord);',
  '  }',
  '',
  '  ',
].join('\r\n');

c = c.replace(anchor, insert + anchor);
fs.writeFileSync(f, c, 'utf8');
console.log(c.includes('getByRunIdPaginated') ? 'OK' : 'FAILED');
