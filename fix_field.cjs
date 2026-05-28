const fs = require('fs');
const path = 'src/ui/hooks/useDiscoveryFlow.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replaceAll('summary.normalization.recordsNormalized', 'summary.normalization.processed');
fs.writeFileSync(path, content, 'utf8');
console.log('done');
