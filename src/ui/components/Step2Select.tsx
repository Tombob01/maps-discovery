import React from 'react';
import type { Phase, ExpandedSuggestion } from '../types/ui';

interface Props {
  selectedKeywords: ExpandedSuggestion[];
  location: string;
  phase: Phase;
  error: string | null;
  onLocationChange: (value: string) => void;
  onBack: () => void;
  onStartRun: () => void;
}

export function Step2Select({
  selectedKeywords,
  location,
  phase,
  error,
  onLocationChange,
  onBack,
  onStartRun,
}: Props): React.ReactElement {
  const isLoading = phase === 'loading';

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
        Run configuration
      </p>

      {/* Selected keywords summary */}
      <div className="mb-4">
        <p className="mb-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          Selected keywords ({selectedKeywords.length})
        </p>
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Selected keywords">
          {selectedKeywords.map(kw => (
            <span
              key={kw.keyword + ':' + kw.strategy}
              role="listitem"
              className="inline-flex items-center rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-300"
            >
              {kw.keyword}
            </span>
          ))}
        </div>
      </div>

      <hr className="mb-4 border-neutral-100 dark:border-neutral-700" />

      {/* Config fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="provider-select"
            className="text-[11px] text-neutral-500 dark:text-neutral-400"
          >
            Provider
          </label>
          <select
            id="provider-select"
            disabled
            className={[
              'h-9 rounded-lg border px-3 text-sm',
              'border-neutral-200 bg-neutral-50 text-neutral-500',
              'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
              'cursor-not-allowed opacity-75',
            ].join(' ')}
          >
            <option value="google-maps">google-maps (Playwright)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="run-location"
            className="text-[11px] text-neutral-500 dark:text-neutral-400"
          >
            Location
          </label>
          <input
            id="run-location"
            type="text"
            value={location}
            onChange={e => onLocationChange(e.target.value)}
            disabled={isLoading}
            className={[
              'h-9 rounded-lg border px-3 text-sm outline-none transition',
              'border-neutral-200 bg-white text-neutral-900',
              'focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
              'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100',
              'dark:focus:border-violet-500 dark:focus:ring-violet-900',
              'disabled:opacity-50',
            ].join(' ')}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
        >
          <AlertIcon />
          {error}
        </div>
      )}

      {/* Footer buttons */}
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className={[
            'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition',
            'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
            'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
            'disabled:opacity-50',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400',
          ].join(' ')}
        >
          <ArrowLeftIcon />
          back
        </button>

        <button
          type="button"
          onClick={onStartRun}
          disabled={isLoading || selectedKeywords.length === 0}
          aria-busy={isLoading}
          className={[
            'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition',
            'bg-violet-700 text-white hover:bg-violet-800 active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500',
          ].join(' ')}
        >
          {isLoading ? (
            <>
              <SpinnerIcon />
              runningâ€¦
            </>
          ) : (
            <>
              <PlayIcon />
              start discovery
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Micro-icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
