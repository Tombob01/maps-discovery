const fs = require('fs');
const path = 'src/storage/PostgresRecordRepository.ts';
let c = fs.readFileSync(path, 'utf8');

// Replace the broken log line with the correct template literal
c = c.replace(
  /console\.log\(\[insertMany:pg\][^\n]*\);/,
  'console.log(`[insertMany:pg] attempted=${attempted} actual-inserted=${actualInserted} conflict-skipped=${conflictSkipped}`);'
);

fs.writeFileSync(path, c, 'utf8');

const ok = c.includes('attempted=${attempted}');
console.log(ok ? 'OK — template literal restored' : 'FAILED — still broken');
