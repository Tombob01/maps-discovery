import React from 'react';
import type { IRuntimeFacade } from '../types/ui';
import { mockFacade } from '../types/ui';
import { useDiscoveryFlow } from '../hooks/useDiscoveryFlow';
import { StepRail } from '../components/StepRail';
import { Step1Expand } from '../components/Step1Expand';
import { Step2Select } from '../components/Step2Select';
import { RunProgressRow } from '../components/RunProgressRow';
import { EventLog } from '../components/EventLog';
import { ResultsTable } from '../components/ResultsTable';

interface Props {
  /** Pass a real HTTP client here to swap out the mock. */
  facade?: IRuntimeFacade;
}

export function DiscoveryPage({ facade = mockFacade }: Props): React.ReactElement {
  const { state, actions } = useDiscoveryFlow(facade);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
            Maps Discovery
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Expand keywords, select targets, run Playwright scrape, review results.
          </p>
        </div>

        {/* Layout: rail + content */}
        <div className="flex gap-8">
          {/* Step rail — hidden on small screens */}
          <aside className="hidden w-44 flex-shrink-0 sm:block">
            <StepRail currentStep={state.step} />
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1 space-y-4">

            {/* Step 1: Expand */}
            {state.step === 'expand' && (
              <Step1Expand
                keyword={state.keyword}
                location={state.location}
                phase={state.phase}
                suggestions={state.suggestions}
                selectedKeywords={state.selectedKeywords}
                error={state.error}
                onKeywordChange={actions.setKeyword}
                onLocationChange={actions.setLocation}
                onExpand={actions.expandKeyword}
                onToggleKeyword={actions.toggleKeyword}
                onNext={actions.goToSelect}
              />
            )}

            {/* Step 2: Configure run */}
            {state.step === 'select' && (
              <Step2Select
                selectedKeywords={state.selectedKeywords}
                location={state.location}
                phase={state.phase}
                error={state.error}
                onLocationChange={actions.setLocation}
                onBack={actions.goToExpand}
                onStartRun={actions.startRun}
              />
            )}

            {/* Steps 3 + 4: Run progress, event log, results */}
            {(state.step === 'run' || state.step === 'results') && (
              <>
                <RunProgressRow
                  runId={state.runId}
                  runStatus={state.runStatus}
                  progress={state.progress}
                  stats={state.stats}
                />

                <EventLog events={state.events} />

                {state.step === 'results' && (
                  <ResultsTable records={state.records} />
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
