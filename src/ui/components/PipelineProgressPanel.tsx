import React from 'react';
import type { RunStats } from '../types/ui.js';

interface Props {
  stats: RunStats | null;
}

interface PipelineMetric {
  key: string;
  label: string;
  value: number;
}

/**
 * Compact dashboard-style summary of cumulative pipeline statistics.
 * Presentation-only -- renders whatever RunStats it is given.
 */
export function PipelineProgressPanel({ stats }: Props): React.ReactElement | null {
  if (stats === null) return null;

  const metrics: PipelineMetric[] = [
    { key: 'discovered', label: 'Businesses discovered', value: stats.discovered },
    { key: 'normalized', label: 'Businesses normalized', value: stats.normalized },
    { key: 'duplicatesRemoved', label: 'Duplicates removed', value: stats.duplicatesRemoved },
    { key: 'uniqueBusinesses', label: 'Unique businesses', value: stats.uniqueBusinesses },
    { key: 'exported', label: 'Exported', value: stats.exported },
  ];

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">
        Pipeline Progress
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-3">
        {metrics.map(metric => (
          <div key={metric.key} className="flex items-center justify-between gap-2">
            <span>{metric.label}</span>
            <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
              {metric.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}