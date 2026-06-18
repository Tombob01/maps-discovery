import React from 'react';
import type { RunStatus, RunStats } from '../types/ui';

interface Props {
  runId: string | null;
  runStatus: RunStatus;
  progress: number;
  stats: RunStats | null;
  currentSeed?: string | null;
  isPollingStalled: boolean;
}

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  pending: {
    label: 'pending',
    dotClass: 'bg-neutral-400',
    badgeClass:
      'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
  running: {
    label: 'running',
    dotClass: 'bg-violet-500 animate-pulse',
    badgeClass:
      'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  },
  complete: {
    label: 'complete',
    dotClass: 'bg-teal-600',
    badgeClass:
      'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  },
  failed: {
    label: 'failed',
    dotClass: 'bg-red-500',
    badgeClass:
      'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
};

const STALLED_CONFIG = {
  label: 'stalled',
  dotClass: 'bg-amber-500',
  badgeClass:
    'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

export function getStatusDisplay(
  runStatus: RunStatus,
  isPollingStalled: boolean,
): { label: string; dotClass: string; badgeClass: string } {
  if (runStatus === 'running' && isPollingStalled) {
    return STALLED_CONFIG;
  }
  return STATUS_CONFIG[runStatus];
}

export function getExtractionHeading(
  runStatus: RunStatus,
  isPollingStalled: boolean,
): string {
  if (runStatus === 'complete') return 'Extraction complete';
  if (runStatus === 'running' && isPollingStalled) return 'Updates paused';
  return 'Extraction in progress';
}

export function getProgressBarColorClass(
  runStatus: RunStatus,
  isPollingStalled: boolean,
): string {
  if (runStatus === 'failed') return 'bg-red-500';
  if (runStatus === 'running' && isPollingStalled) return 'bg-amber-500';
  return 'bg-violet-600';
}

export function shouldAnimateProgressBar(
  runStatus: RunStatus,
  isPollingStalled: boolean,
): boolean {
  return !(runStatus === 'running' && isPollingStalled);
}

export function RunProgressRow({
  runId,
  runStatus,
  progress,
  stats,
  currentSeed,
  isPollingStalled,
}: Props): React.ReactElement {
  const statusDisplay = getStatusDisplay(runStatus, isPollingStalled);
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  // Refinement 2: clamp extractionPercent to 0-100.
  const extractionPercent =
    stats && stats.discovered > 0
      ? Math.min(100, Math.max(0, Math.round((stats.normalized / stats.discovered) * 100)))
      : 0;

  // Refinement 1: panel remains visible when status transitions to "complete".
  const showExtractionPanel =
    stats !== null &&
    stats.discovered > 0 &&
    (runStatus === 'running' || runStatus === 'complete');

  const extractionHeading = getExtractionHeading(runStatus, isPollingStalled);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">
            Run progress
          </p>
          {runId && (
            <p className="mt-0.5 font-mono text-[11px] text-neutral-400 dark:text-neutral-500">
              {runId}
            </p>
          )}
        </div>

        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium',
            statusDisplay.badgeClass,
          ].join(' ')}
        >
          <span className={['h-1.5 w-1.5 rounded-full', statusDisplay.dotClass].join(' ')} aria-hidden="true" />
          {statusDisplay.label}
        </span>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Run progress: ${pct}%`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700"
      >
        <div
          className={[
            'h-full rounded-full transition-all duration-500',
            getProgressBarColorClass(runStatus, isPollingStalled),
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right font-mono text-[11px] text-neutral-400">{pct}%</p>

      {/* Current keyword - only while running */}
      {runStatus === 'running' && isPollingStalled && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Updates paused -- refresh the page to reconnect and see the latest status.
        </p>
      )}

      {runStatus === 'running' && !isPollingStalled && currentSeed != null && currentSeed !== '' && (
        <p className="mt-2 text-xs text-violet-600 dark:text-violet-400">
          Current keyword: {currentSeed}
        </p>
      )}

      {/* Extraction panel - visible while running and after completion */}
      {showExtractionPanel && stats !== null && (
        <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950">
          <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
            {extractionHeading}
          </p>
          <div className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">
            <span>Businesses discovered: {stats.discovered}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs text-violet-600 dark:text-violet-400">
            <span>Businesses extracted: {stats.normalized} / {stats.discovered}</span>
            <span className="font-mono font-medium">{extractionPercent}%</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-violet-200 dark:bg-violet-800">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${extractionPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-3">
          <StatCard label="discovered" value={stats.discovered} />
          <StatCard label="extracted" value={stats.normalized} />
          <StatCard label="failed" value={stats.failed} highlight={stats.failed > 0} />
        </div>
      )}
    </div>
  );
}

// Sub-component

interface StatCardProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function StatCard({ label, value, highlight = false }: StatCardProps) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</p>
      <p
        className={[
          'mt-0.5 text-xl font-medium',
          highlight && value > 0
            ? 'text-red-600 dark:text-red-400'
            : 'text-neutral-900 dark:text-neutral-100',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
