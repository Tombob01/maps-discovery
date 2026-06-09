const fs = require('fs');
const f = 'src/providers/google-maps/GoogleMapsProvider.ts';
let c = fs.readFileSync(f, 'utf8');

// 1. Add counters before the Phase 2 loop
c = c.replace(
  '      let totalYielded = 0;\n\n      for (const entry of collectedUrls) {',
  '      let totalYielded = 0;\n      let urlsVisited = 0;\n      let successfulExtractions = 0;\n      let failedNavigations = 0;\n      let failedExtractions = 0;\n\n      for (const entry of collectedUrls) {'
);

// 2. urlsVisited++ before page.goto, failedNavigations++ in navigation catch
c = c.replace(
  '        try {\n          await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 20000 });\n          await page.waitForSelector(\'div[role="main"]\', { timeout: 10000 });\n        } catch (err) {\n          log.error(`phase2: navigation failed for ${entry.url} -- skipping`, err);\n          continue;\n        }',
  '        urlsVisited++;\n        try {\n          await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 20000 });\n          await page.waitForSelector(\'div[role="main"]\', { timeout: 10000 });\n        } catch (err) {\n          failedNavigations++;\n          log.error(`phase2: navigation failed for ${entry.url} -- skipping`, err);\n          continue;\n        }'
);

// 3. failedExtractions++ in extraction catch, successfulExtractions++ after extraction
c = c.replace(
  '        } catch (err) {\n          log.error(`phase2: extraction failed for ${entry.url} -- skipping`, err);\n          continue;\n        }\n\n        const resultId =',
  '        } catch (err) {\n          failedExtractions++;\n          log.error(`phase2: extraction failed for ${entry.url} -- skipping`, err);\n          continue;\n        }\n\n        successfulExtractions++;\n\n        const resultId ='
);

// 4. Summary log with correct [phase2-stats] prefix
c = c.replace(
  '      log.debug(`phase2 complete: yielded ${totalYielded} results`);',
  '      const successRate = urlsVisited > 0 ? Math.round((successfulExtractions / urlsVisited) * 100) : 0;\n      log.debug(`[phase2-stats] visited=${urlsVisited} extracted=${successfulExtractions} failed_navigation=${failedNavigations} failed_extraction=${failedExtractions} success_rate=${successRate}%`);\n      log.debug(`phase2 complete: yielded ${totalYielded} results`);'
);

fs.writeFileSync(f, c, 'utf8');

const checks = [
  c.includes('urlsVisited++'),
  c.includes('failedNavigations++'),
  c.includes('failedExtractions++'),
  c.includes('successfulExtractions++'),
  c.includes('[phase2-stats]'),
  !c.includes('phase2-stats]visited'),
];
console.log('checks:', checks);
console.log(checks.every(Boolean) ? 'OK' : 'FAILED');
