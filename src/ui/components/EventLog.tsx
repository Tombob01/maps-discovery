import React, { useEffect, useRef } from 'react';
import type { EventEntry } from '../types/ui';

interface Props {
  events: EventEntry[];
}

const LEVEL_CLASS: Record<EventEntry['level'], string> = {
  info: 'text-violet-600 dark:text-violet-400',
  ok:   'text-teal-600   dark:text-teal-400',
  warn: 'text-amber-600  dark:text-amber-400',
  err:  'text-red-600    dark:text-red-400',
};

export function EventLog({ events }: Props): React.ReactElement | null {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
        Execution events
      </p>

      <div
        role="log"
        aria-live="polite"
        aria-label="Execution event log"
        className={[
          'max-h-40 overflow-y-auto rounded-lg px-3 py-2.5',
          'bg-neutral-50 dark:bg-neutral-800',
          'font-mono text-xs',
        ].join(' ')}
      >
        {events.map((entry, i) => (
          <div key={i} className="flex gap-2">
            <span className="flex-shrink-0 text-neutral-400 dark:text-neutral-500">
              {entry.time}
            </span>
            <span className={LEVEL_CLASS[entry.level]}>
              {entry.msg}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
