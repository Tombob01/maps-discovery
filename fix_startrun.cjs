const fs = require('fs');
const path = 'src/ui/hooks/useDiscoveryFlow.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Find startRun function start and end
let startRunStart = -1, startRunEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const startRun = useCallback(() => {')) startRunStart = i;
  if (startRunStart !== -1 && lines[i].includes('}, [facade, state.keyword, state.location, state.selectedKeywords')) {
    startRunEnd = i;
    break;
  }
}
console.log('startRun:', startRunStart+1, 'to', startRunEnd+1);
if (startRunStart === -1 || startRunEnd === -1) { console.log('ERROR'); process.exit(1); }

const newStartRun = [
"  const startRun = useCallback(() => {",
"    if (state.selectedKeywords.length === 0) return;",
"",
"    dispatch({ type: 'SET_PHASE', phase: 'loading' });",
"    dispatch({ type: 'SET_RUN_STATUS', status: 'pending' });",
"    dispatch({ type: 'SET_PROGRESS', progress: 0 });",
"    addEvent('creating run\u2026', 'info');",
"",
"    facade",
"      .createRun({ niche: state.keyword, location: state.location })",
"      .then(({ runId }) => {",
"        console.log('[startRun] createRun resolved, runId:', runId);",
"        addEvent(`run created: ${runId}`, 'ok');",
"        dispatch({ type: 'SET_RUN_ID', runId });",
"        dispatch({ type: 'SET_RUN_STATUS', status: 'running' });",
"        dispatch({ type: 'SET_PROGRESS', progress: 20 });",
"        dispatch({ type: 'SET_STEP', step: 'run' });",
"        addEvent('executing discovery\u2026', 'info');",
"",
"        console.log('[startRun] calling executeRun, runId:', runId);",
"        return facade.executeRun({",
"          provider: 'google-maps',",
"          runId,",
"          query: {",
"            niche: state.keyword,",
"            location: state.location,",
"          },",
"        }).then(summary => {",
"          console.log('[startRun] executeRun resolved, resultsFound:', summary.discovery.resultsFound, 'normalized:', summary.normalization.recordsNormalized);",
"          addEvent(",
"            `discovery done \u2013 ${summary.discovery.resultsFound} results, ` +",
"            `${summary.normalization.recordsNormalized} normalized`,",
"            'ok',",
"          );",
"          dispatch({ type: 'SET_PROGRESS', progress: 70 });",
"          console.log('[startRun] calling getRun, runId:', runId);",
"          return facade.getRun(runId);",
"        });",
"      })",
"      .then(run => {",
"        console.log('[startRun] getRun resolved, status:', run.status, 'id:', run.id);",
"        dispatch({ type: 'SET_RUN_STATUS', status: run.status });",
"        dispatch({ type: 'SET_STATS', stats: run.stats });",
"        dispatch({ type: 'SET_PROGRESS', progress: 90 });",
"        addEvent('fetching records\u2026', 'info');",
"        return facade.listRecords(run.id);",
"      })",
"      .then(records => {",
"        addEvent(`${records.length} records loaded`, 'ok');",
"        dispatch({ type: 'SET_RECORDS', records });",
"        dispatch({ type: 'SET_PHASE', phase: 'done' });",
"        dispatch({ type: 'SET_PROGRESS', progress: 100 });",
"        dispatch({ type: 'SET_STEP', step: 'results' });",
"      })",
"      .catch((err: unknown) => {",
"        const msg = err instanceof Error ? err.message : 'Run failed';",
"        addEvent(`run failed: ${msg}`, 'err');",
"        dispatch({ type: 'SET_RUN_STATUS', status: 'failed' });",
"        dispatch({ type: 'SET_ERROR', error: msg });",
"      });",
"  // eslint-disable-next-line react-hooks/exhaustive-deps",
"  }, [facade, state.keyword, state.location, state.selectedKeywords]);",
];

lines.splice(startRunStart, startRunEnd - startRunStart + 1, ...newStartRun);
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
