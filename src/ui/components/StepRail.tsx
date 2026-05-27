import React from 'react';
import type { FlowStep } from '../types/ui';

interface StepDef {
  id: FlowStep;
  label: string;
  sub: string;
}

const STEPS: StepDef[] = [
  { id: 'expand',  label: 'Expand',  sub: 'keyword ideas' },
  { id: 'select',  label: 'Select',  sub: 'pick keywords' },
  { id: 'run',     label: 'Run',     sub: 'discovery'     },
  { id: 'results', label: 'Results', sub: 'view records'  },
];

const ORDER: FlowStep[] = ['expand', 'select', 'run', 'results'];

interface Props {
  currentStep: FlowStep;
}

export function StepRail({ currentStep }: Props): React.ReactElement {
  const currentIdx = ORDER.indexOf(currentStep);

  return (
    <nav aria-label="Workflow steps" className="flex flex-col">
      {STEPS.map((step, i) => {
        const isDone   = i < currentIdx;
        const isActive = i === currentIdx;

        return (
          <div key={step.id} className="relative flex items-start gap-2.5 pb-7 last:pb-0">
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[12px] top-7 w-px bg-border-secondary dark:bg-neutral-700"
                style={{ height: 'calc(100% - 14px)' }}
              />
            )}

            {/* Dot */}
            <span
              aria-current={isActive ? 'step' : undefined}
              className={[
                'relative z-10 flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center',
                'rounded-full border text-xs font-medium',
                isDone
                  ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-600 dark:bg-teal-600'
                  : isActive
                  ? 'border-violet-800 bg-violet-800 text-white dark:border-violet-500 dark:bg-violet-500'
                  : 'border-neutral-300 bg-white text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-500',
              ].join(' ')}
            >
              {isDone ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                i + 1
              )}
            </span>

            {/* Labels */}
            <div className="pt-1">
              <p
                className={[
                  'text-[13px] font-medium leading-none',
                  isActive || isDone
                    ? 'text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-400 dark:text-neutral-500',
                ].join(' ')}
              >
                {step.label}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {step.sub}
              </p>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
