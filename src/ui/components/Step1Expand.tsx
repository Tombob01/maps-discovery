import React, { useRef, useEffect } from 'react';
import type { Phase, ExpandedSuggestion, ExpansionStrategy } from '../types/ui';

interface Props {
  keyword: string;
  location: string;
  phase: Phase;
  suggestions: ExpandedSuggestion[];
  selectedKeywords: ExpandedSuggestion[];
  expansionStrategy: ExpansionStrategy;
  error: string | null;
  onKeywordChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onExpand: () => void;
  onToggleKeyword: (suggestion: ExpandedSuggestion) => void;
  onStrategyChange: (strategy: ExpansionStrategy) => void;
  onNext: () => void;
}

export function Step1Expand({
  keyword,
  location,
  phase,
  suggestions,
  selectedKeywords,
  error,
  onKeywordChange,
  onLocationChange,
  onExpand,
  onToggleKeyword,
  onStrategyChange,
  expansionStrategy,
  onNext,
}: Props): React.ReactElement {
  const keywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    keywordRef.current?.focus();
  }, []);

  const isLoading       = phase === 'loading';
  const hasSuggestions  = suggestions.length > 0;
  const canNext         = selectedKeywords.length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') onExpand();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
        Keyword expansion
      </p>

      {/* Input row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="kw-input" className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Seed keyword
          </label>
          <input
            id="kw-input"
            ref={keywordRef}
            type="text"
            placeholder="e.g. plumbers"
            value={keyword}
            onChange={e => onKeywordChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className={[
              'h-9 rounded-lg border px-3 text-sm outline-none transition',
              'border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400',
              'focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
              'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500',
              'dark:focus:border-violet-500 dark:focus:ring-violet-900',
              'disabled:opacity-50',
            ].join(' ')}
          />
        </div>

        <div className="flex flex-col gap-1 sm:w-44">
          <label htmlFor="loc-input" className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Location
          </label>
          <input
            id="loc-input"
            type="text"
            placeholder="e.g. Austin TX"
            value={location}
            onChange={e => onLocationChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className={[
              'h-9 rounded-lg border px-3 text-sm outline-none transition',
              'border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400',
              'focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
              'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500',
              'dark:focus:border-violet-500 dark:focus:ring-violet-900',
              'disabled:opacity-50',
            ].join(' ')}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Strategy
          </label>
          <select
            value={expansionStrategy}
            onChange={e => onStrategyChange(e.target.value as ExpansionStrategy)}
            disabled={isLoading}
            className="h-9 rounded-lg border px-3 text-sm border-neutral-200 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 disabled:opacity-50 outline-none"
          >
            <option value="commercial">Commercial</option>
            <option value="discovery">Discovery</option>
            <option value="geographic">Geographic</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onExpand}
          disabled={isLoading || !keyword.trim()}
          aria-busy={isLoading}
          className={[
            'flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition',
            'bg-violet-700 text-white hover:bg-violet-800 active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500',
          ].join(' ')}
        >
          {isLoading ? (
            <>
              <SpinnerIcon />
              expandingâ€¦
            </>
          ) : (
            <>
              <SparkleIcon />
              expand
            </>
          )}
        </button>
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

      {/* Suggestions */}
      {hasSuggestions && (
        <>
          <hr className="my-4 border-neutral-100 dark:border-neutral-700" />
          <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
            {suggestions.length} suggestions — tap to select the keywords you want to use
          </p>

          {(['commercial', 'discovery', 'geographic'] as ExpansionStrategy[])
            .filter(st => suggestions.some(s => s.strategy === st))
            .map(st => (
              <div key={st} className="mb-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  {st}
                </p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={st + ' keyword suggestions'}>
                  {suggestions.filter(s => s.strategy === st).map(s => {
                    const selected = selectedKeywords.some(
                      sel => sel.keyword === s.keyword && sel.strategy === s.strategy
                    );
                    return (
                      <button
                        key={s.keyword + ':' + s.strategy}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onToggleKeyword(s)}
                        className={[
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500',
                          selected
                            ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-300'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600',
                        ].join(' ')}
                      >
                        {s.keyword}
                        {selected && (
                          <span aria-hidden="true" className="opacity-50">
                            {'\u2715'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              className={[
                'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition',
                'bg-teal-700 text-white hover:bg-teal-800 active:scale-[0.98]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500',
              ].join(' ')}
            >
              next: configure run
              <ArrowRightIcon />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// â”€â”€â”€ Inline micro-icons (no external dep) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SpinnerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
