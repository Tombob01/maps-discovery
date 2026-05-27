import React from 'react';
import type { BusinessRecord } from '../types/ui';

interface Props {
  records: BusinessRecord[];
}

const COLUMNS = [
  { key: 'name',     label: 'Name',     width: 'w-[22%]' },
  { key: 'phone',    label: 'Phone',    width: 'w-[13%]' },
  { key: 'rating',   label: 'Rating',   width: 'w-[8%]'  },
  { key: 'reviews',  label: 'Reviews',  width: 'w-[8%]'  },
  { key: 'address',  label: 'Address',  width: 'w-[27%]' },
  { key: 'website',  label: 'Website',  width: 'w-[22%]' },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

export function ResultsTable({ records }: Props): React.ReactElement {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <TableIcon />
        <p className="mt-2 text-sm text-neutral-400">No records yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">
          Results — {records.length} businesses
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed text-sm"
          aria-label="Discovered business records"
        >
          <thead>
            <tr className="border-t border-neutral-100 dark:border-neutral-700">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  className={[
                    col.width,
                    'px-4 py-2.5 text-left text-[11px] font-medium uppercase',
                    'tracking-widest text-neutral-400 dark:text-neutral-500',
                  ].join(' ')}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, i) => (
              <tr
                key={i}
                className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-700/50 dark:hover:bg-neutral-800"
              >
                {COLUMNS.map(col => (
                  <td
                    key={col.key}
                    className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-neutral-800 dark:text-neutral-200"
                    title={record[col.key as ColumnKey]}
                  >
                    <CellContent col={col.key as ColumnKey} record={record} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

interface CellProps {
  col: ColumnKey;
  record: BusinessRecord;
}

function CellContent({ col, record }: CellProps): React.ReactElement {
  switch (col) {
    case 'rating':
      return record.rating ? (
        <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400">
          ★ {record.rating}
        </span>
      ) : (
        <span className="text-neutral-400">—</span>
      );

    case 'website':
      return record.website ? (
        <a
          href={`https://${record.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
          onClick={e => e.stopPropagation()}
        >
          {record.website}
        </a>
      ) : (
        <span className="text-neutral-400">—</span>
      );

    default:
      return record[col] ? (
        <>{record[col]}</>
      ) : (
        <span className="text-neutral-400">—</span>
      );
  }
}

// ─── Empty state icon ─────────────────────────────────────────────────────────

function TableIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mx-auto text-neutral-300 dark:text-neutral-600"
    >
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M8 21V8" /><path d="M3 8h18" /><path d="M16 3h5v5" /><path d="m21 3-5 5" />
    </svg>
  );
}
