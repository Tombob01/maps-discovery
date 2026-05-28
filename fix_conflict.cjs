const fs = require('fs');
const path = 'src/storage/PostgresRecordRepository.ts';
let content = fs.readFileSync(path, 'utf8');
const before = (content.match(/ON CONFLICT \(id\) DO NOTHING/g) || []).length;
content = content.replaceAll('ON CONFLICT (id) DO NOTHING', 'ON CONFLICT (fingerprint) DO NOTHING');
const after = (content.match(/ON CONFLICT \(fingerprint\) DO NOTHING/g) || []).length;
console.log('Replaced', before, '->', after);
fs.writeFileSync(path, content, 'utf8');
console.log('done');
