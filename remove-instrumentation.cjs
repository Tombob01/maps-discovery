const fs = require('fs');

// --- NormalizationStage.ts ---
const nf = 'src/pipeline/NormalizationStage.ts';
let nc = fs.readFileSync(nf, 'utf8');

// Remove [norm:start]
nc = nc.replace(/\n    console\.log\(`\[norm:start\] rawResultId=\$\{payload\.rawResultId\}`\);/, '');

// Remove [norm:skipped] reason=not-found
nc = nc.replace(/\n    console\.log\(`\[norm:skipped\] reason=not-found rawResultId=\$\{payload\.rawResultId\}`\);/, '');

// Remove [norm:skipped] reason=normalize-failed
nc = nc.replace(/\n    console\.log\(`\[norm:skipped\] reason=normalize-failed rawResultId=\$\{payload\.rawResultId\}`\);/, '');

// Remove [norm:success]
nc = nc.replace(/\n    console\.log\(`\[norm:success\] rawResultId=\$\{payload\.rawResultId\} fingerprint=\$\{record\.fingerprint\}`\);/, '');

fs.writeFileSync(nf, nc, 'utf8');
const normOk = !nc.includes('[norm:start]') && !nc.includes('[norm:skipped]') && !nc.includes('[norm:success]');
console.log('NormalizationStage:', normOk ? 'OK' : 'FAILED');

// --- PostgresRecordRepository.ts ---
const rf = 'src/storage/PostgresRecordRepository.ts';
let rc = fs.readFileSync(rf, 'utf8');

// Remove [insertMany:pg] log line
rc = rc.replace(/\n    console\.log\(`\[insertMany:pg\] attempted=\$\{attempted\} actual-inserted=\$\{actualInserted\} conflict-skipped=\$\{conflictSkipped\}`\);/, '');

fs.writeFileSync(rf, rc, 'utf8');
const repoOk = !rc.includes('[insertMany:pg]');
console.log('PostgresRecordRepository:', repoOk ? 'OK' : 'FAILED');
