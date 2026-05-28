const fs = require('fs');
const path = 'src/providers/google-maps/GoogleMapsProvider.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  'await page.waitForSelector(sel("resultsSidebar"), { timeout: 5000 });',
  'await page.waitForSelector(\'div[role="feed"]\', { timeout: 5000 });'
);
fs.writeFileSync(path, content, 'utf8');
console.log('done');
