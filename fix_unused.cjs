const fs = require('fs');
const path = 'src/providers/google-maps/GoogleMapsProvider.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  '          const freshCard = freshCards[i];\n          // If card is gone (DOM changed), skip this index\n          if (freshCard === undefined) continue;',
  '          // If card is gone after navigation (DOM changed), skip this index\n          if (freshCards[i] === undefined) continue;'
);
fs.writeFileSync(path, content, 'utf8');
console.log('done');
