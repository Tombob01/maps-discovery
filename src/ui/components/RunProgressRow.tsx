import React from 'react';
import type { RunStatus, RunStats } from '../types/ui';

interface Props {
  runId: string | null;
  runStatus: RunStatus;
  progress: number;
  stats: RunStats | null;
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

export function RunProgressRow({
  runId,
  runStatus,
  progress,
  stats,
}: Props): React.ReactElement {
  const cfg = STATUS_CONFIG[runStatus];
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

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
            cfg.badgeClass,
          ].join(' ')}
        >
          <span className={['h-1.5 w-1.5 rounded-full', cfg.dotClass].join(' ')} aria-hidden="true" />
          {cfg.label}
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
            runStatus === 'failed' ? 'bg-red-500' : 'bg-violet-600',
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right font-mono text-[11px] text-neutral-400">{pct}%</p>

      {/* Stats grid */}
      {stats && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-3">
          <StatCard label="discovered" value={stats.discovered} />
          <StatCard label="normalized" value={stats.normalized} />
          <StatCard label="failed" value={stats.failed} highlight={stats.failed > 0} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

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
