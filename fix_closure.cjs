const fs = require('fs');
const path = 'src/ui/hooks/useDiscoveryFlow.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace the startRun promise chain — capture runId locally + add diagnostic logs
const oldChain = `    facade
      .createRun({ niche: state.keyword, location: state.location })
      .then(({ runId }) => {
        addEvent(\`run created: \${runId}\`, 'ok');
        dispatch({ type: 'SET_RUN_ID', runId });
        dispatch({ type: 'SET_RUN_STATUS', status: 'running' });
        dispatch({ type: 'SET_PROGRESS', progress: 20 });
        dispatch({ type: 'SET_STEP', step: 'run' });
        addEvent('executing discoveryâ€¦', 'info');

        return facade.executeRun({
          provider: 'google-maps',
          runId,
          query: {
            niche: state.keyword,
            location: state.location,
          },
        });
      })
      .then(summary => {
        addEvent(
          \`discovery done â€" \${summary.discovery.resultsFound} results, \` +
          \`\${summary.normalization.processed} normalized\`,
          'ok',
        );
        dispatch({ type: 'SET_PROGRESS', progress: 70 });

        // getRun uses the runId captured in state â€" read via closure from reducer
        // We need the current runId; since it was just set, we grab it from the
        // closure inside the chain via a local variable captured above.
        return facade.getRun(
          // runId is guaranteed non-null here because createRun succeeded
          // TypeScript doesn't track promise-chain ordering, so cast is safe.
          state.runId as string,
        );
      })`;

const newChain = `    facade
      .createRun({ niche: state.keyword, location: state.location })
      .then(({ runId }) => {
        console.log('[startRun] createRun resolved, runId:', runId);
        addEvent(\`run created: \${runId}\`, 'ok');
        dispatch({ type: 'SET_RUN_ID', runId });
        dispatch({ type: 'SET_RUN_STATUS', status: 'running' });
        dispatch({ type: 'SET_PROGRESS', progress: 20 });
        dispatch({ type: 'SET_STEP', step: 'run' });
        addEvent('executing discovery\u2026', 'info');

        console.log('[startRun] calling executeRun with runId:', runId);
        return facade.executeRun({
          provider: 'google-maps',
          runId,
          query: {
            niche: state.keyword,
            location: state.location,
          },
        }).then(summary => {
          console.log('[startRun] executeRun resolved, runId:', runId, 'summary:', JSON.stringify(summary.discovery));
          addEvent(
            \`discovery done \u2013 \${summary.discovery.resultsFound} results, \` +
            \`\${summary.normalization.recordsNormalized} normalized\`,
            'ok',
          );
          dispatch({ type: 'SET_PROGRESS', progress: 70 });
          console.log('[startRun] calling getRun with captured runId:', runId);
          return facade.getRun(runId);
        });
      })`;

if (!content.includes('createRun({ niche: state.keyword, location: state.location })')) {
  console.log('ERROR: createRun call not found'); process.exit(1);
}

content = content.replace(oldChain, newChain);

// Also fix the .then(run => ...) to use run.id (already correct) and add log
const oldRunThen = `.then(run => {
        dispatch({ type: 'SET_RUN_STATUS', status: run.status });
        dispatch({ type: 'SET_STATS', stats: run.stats });
        dispatch({ type: 'SET_PROGRESS', progress: 90 });
        addEvent('fetching recordsâ€¦', 'info');
        return facade.listRecords(run.id);
      })`;

const newRunThen = `.then(run => {
        console.log('[startRun] getRun resolved, status:', run.status, 'id:', run.id);
        dispatch({ type: 'SET_RUN_STATUS', status: run.status });
        dispatch({ type: 'SET_STATS', stats: run.stats });
        dispatch({ type: 'SET_PROGRESS', progress: 90 });
        addEvent('fetching records\u2026', 'info');
        return facade.listRecords(run.id);
      })`;

content = content.replace(oldRunThen, newRunThen);

fs.writeFileSync(path, content, 'utf8');
console.log('done');
