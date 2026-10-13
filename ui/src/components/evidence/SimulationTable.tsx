import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/feedback';
import { Chip } from '@/components/ui/Chip';
import { Notice } from '@/components/ui/Notice';
import {
  formatCsvNumber,
  isCountedEncounter,
  MEASURE_COLUMNS,
  outcomeWords,
  setAsideReason,
  SETTING_COLUMNS,
  type EvidenceSelection,
  type SimulationRow,
} from '@/domain/evidence';
import { BREAKPOINT, useMediaQuery } from '@/hooks/useMediaQuery';
import { cx } from '@/utils/format';

/**
 * The round's simulations, filterable, with the set-aside ones as their own
 * group carrying their reason - never silently excluded, never counted as
 * passes. Rows are cards below the medium breakpoint. A row can be opened
 * to its trace and video.
 */
export type OutcomeFilter =
  'all' | 'counted' | 'failures' | 'passed' | 'passed_stalled' | 'set_aside' | string;

export interface SimulationTableProps {
  rows: SimulationRow[];
  /** When an obstacle is selected: its scope and hits; the table shows the scope with hits highlighted. */
  selection: EvidenceSelection | null;
  reported?: { scope: number | null; hits: number | null };
  filter: OutcomeFilter;
  onFilterChange: (filter: OutcomeFilter) => void;
  selectedKey: string | null;
  onSelectRow: (row: SimulationRow | null) => void;
  worstPhenotype: string | null;
}

const FILTERS: { value: OutcomeFilter; label: string }[] = [
  { value: 'all', label: 'every row' },
  { value: 'counted', label: 'counted encounters' },
  { value: 'failures', label: 'failures' },
  { value: 'passed', label: 'passes, drove on' },
  { value: 'passed_stalled', label: 'passes, stalled' },
  { value: 'set_aside', label: 'set aside' },
];

function matchesFilter(row: SimulationRow, filter: OutcomeFilter): boolean {
  const aside = setAsideReason(row);
  switch (filter) {
    case 'all':
      return true;
    case 'counted':
      return isCountedEncounter(row);
    case 'failures':
      return isCountedEncounter(row) && Boolean(row.label?.failed);
    case 'set_aside':
      return aside !== null;
    default:
      return row.label?.outcome === filter;
  }
}

export function SimulationTable({
  rows,
  selection,
  reported,
  filter,
  onFilterChange,
  selectedKey,
  onSelectRow,
  worstPhenotype,
}: SimulationTableProps) {
  const wide = useMediaQuery(BREAKPOINT.md);
  const [settingFilter, setSettingFilter] = useState<Record<string, string>>({});

  const settingValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const col of SETTING_COLUMNS) {
      const values = new Set<string>();
      for (const r of rows) {
        const v = r.csv[col.key];
        if (v !== undefined && v !== '') values.add(v);
      }
      if (values.size > 1) out[col.key] = [...values].sort();
    }
    return out;
  }, [rows]);

  const base = selection ? selection.scope : rows;
  const hitKeys = useMemo(() => new Set(selection?.hits.map((r) => r.key) ?? []), [selection]);
  const visible = useMemo(
    () =>
      base.filter(
        (r) =>
          matchesFilter(r, filter) &&
          Object.entries(settingFilter).every(([k, v]) => !v || r.csv[k] === v),
      ),
    [base, filter, settingFilter],
  );
  const counted = visible.filter((r) => setAsideReason(r) === null);
  const aside = visible.filter((r) => setAsideReason(r) !== null);
  const unlabeled = rows.filter((r) => !r.label).length;

  const mismatch =
    selection && reported && reported.scope !== null && reported.scope !== selection.scope.length
      ? `The report counts ${reported.scope} simulations for this obstacle; ${selection.scope.length} rows match in simulations.csv. The report and the CSV may be from different analyses.`
      : selection && reported && reported.hits !== null && reported.hits !== selection.hits.length
        ? `The report counts ${reported.hits} matching simulations; ${selection.hits.length} rows match in simulations.csv.`
        : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Show
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {Object.entries(settingValues).map(([key, values]) => (
          <label key={key} className="flex flex-col gap-1 text-xs text-text-muted">
            {SETTING_COLUMNS.find((c) => c.key === key)?.header ?? key}
            <select
              value={settingFilter[key] ?? ''}
              onChange={(e) => setSettingFilter((prev) => ({ ...prev, [key]: e.target.value }))}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
            >
              <option value="">any</option>
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="num ml-auto text-xs text-text-muted" role="status">
          {selection ? `${selection.description}: ` : ''}
          {counted.length} counted, {aside.length} set aside
          {selection ? `, ${visible.filter((r) => hitKeys.has(r.key)).length} highlighted` : ''}
        </p>
      </div>
      {mismatch ? <Notice tone="warning">{mismatch}</Notice> : null}
      {unlabeled ? (
        <Notice tone="warning">
          {unlabeled} row{unlabeled === 1 ? '' : 's'} of simulations.csv have no label in the
          analysis report (its schema version predates per-simulation labels, or the files differ).
          Their outcome is shown as unknown, not as a pass.
        </Notice>
      ) : null}
      {visible.length === 0 ? (
        <EmptyState title="No simulations match">Change the filters above.</EmptyState>
      ) : wide ? (
        <Table
          rows={counted}
          aside={aside}
          hitKeys={hitKeys}
          selectedKey={selectedKey}
          onSelectRow={onSelectRow}
          worstPhenotype={worstPhenotype}
        />
      ) : (
        <Cards
          rows={counted}
          aside={aside}
          hitKeys={hitKeys}
          selectedKey={selectedKey}
          onSelectRow={onSelectRow}
          worstPhenotype={worstPhenotype}
        />
      )}
    </div>
  );
}

interface ListProps {
  rows: SimulationRow[];
  aside: SimulationRow[];
  hitKeys: Set<string>;
  selectedKey: string | null;
  onSelectRow: (row: SimulationRow | null) => void;
  worstPhenotype: string | null;
}

function Table({ rows, aside, hitKeys, selectedKey, onSelectRow, worstPhenotype }: ListProps) {
  const columns = [...SETTING_COLUMNS, ...MEASURE_COLUMNS];
  const render = (row: SimulationRow, isAside: boolean) => {
    const selected = row.key === selectedKey;
    const hit = hitKeys.has(row.key);
    return (
      <tr
        key={row.key}
        aria-selected={selected}
        className={cx(
          'border-t border-border text-xs',
          selected
            ? 'bg-human-soft'
            : hit
              ? 'bg-fail-soft/35 shadow-[inset_3px_0_0_var(--color-fail)]'
              : '',
          'hover:bg-surface-sunken',
        )}
      >
        <td className="px-2 py-1">
          <button
            type="button"
            className="count-link"
            onClick={() => onSelectRow(selected ? null : row)}
            aria-pressed={selected}
          >
            {row.scenarioId}/{row.simIndex ?? '?'}
          </button>
          {worstPhenotype && row.csv.phenotype === worstPhenotype ? (
            <Chip tone="neutral" className="ml-1">
              video
            </Chip>
          ) : null}
        </td>
        {columns.map((c) => (
          <td key={c.key} className={cx('px-2 py-1', c.numeric && 'num text-right')}>
            {c.numeric ? formatCsvNumber(row.csv[c.key]) : (row.csv[c.key] ?? '')}
          </td>
        ))}
        <td className="px-2 py-1">
          {isAside ? (
            <span className="text-set-aside">{setAsideReason(row)}</span>
          ) : (
            <span className={cx(row.label?.failed ? 'text-fail' : '')}>
              {outcomeWords(row.label?.outcome)}
            </span>
          )}
        </td>
      </tr>
    );
  };
  return (
    <div className="max-h-[30rem] overflow-auto rounded-md border border-border">
      <table className="w-full min-w-[56rem] text-left">
        <thead className="sticky top-0 z-10 bg-surface-sunken text-xs text-text-muted">
          <tr>
            <th scope="col" className="px-2 py-1.5 font-medium">
              scenario/sim
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx('px-2 py-1.5 font-medium', c.numeric && 'text-right')}
              >
                {c.header}
                {c.unit ? ` (${c.unit})` : ''}
              </th>
            ))}
            <th scope="col" className="px-2 py-1.5 font-medium">
              how it ended
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => render(r, false))}
          {aside.length ? (
            <tr className="bg-surface-sunken text-xs">
              <th
                scope="rowgroup"
                colSpan={columns.length + 2}
                className="px-2 py-1.5 text-left font-medium text-text"
              >
                Set aside — {aside.length} simulation{aside.length === 1 ? '' : 's'} not counted,
                with the reason
              </th>
            </tr>
          ) : null}
          {aside.map((r) => render(r, true))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ rows, aside, hitKeys, selectedKey, onSelectRow, worstPhenotype }: ListProps) {
  const card = (row: SimulationRow, isAside: boolean) => {
    const selected = row.key === selectedKey;
    return (
      <li
        key={row.key}
        className={cx(
          'rounded-md border px-3 py-2 text-xs',
          selected
            ? 'border-human bg-human-soft'
            : hitKeys.has(row.key)
              ? 'border-fail bg-fail-soft/60'
              : 'border-border',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="count-link text-sm"
            onClick={() => onSelectRow(selected ? null : row)}
            aria-pressed={selected}
          >
            {row.scenarioId}/{row.simIndex ?? '?'}
          </button>
          {worstPhenotype && row.csv.phenotype === worstPhenotype ? (
            <Chip tone="neutral">video</Chip>
          ) : null}
        </div>
        <p className="mt-1 text-text-muted">
          {SETTING_COLUMNS.map((c) => `${c.header} ${row.csv[c.key] ?? ''}`).join(' · ')}
        </p>
        <p className="mt-1">
          {isAside ? (
            <span className="text-set-aside">Set aside: {setAsideReason(row)}</span>
          ) : (
            outcomeWords(row.label?.outcome)
          )}
        </p>
        <p className="num mt-1 text-text-muted">
          {MEASURE_COLUMNS.map(
            (c) =>
              `${c.header} ${formatCsvNumber(row.csv[c.key]) || 'n/a'}${c.unit ? ` ${c.unit}` : ''}`,
          ).join(' · ')}
        </p>
      </li>
    );
  };
  return (
    <div className="flex max-h-[30rem] flex-col gap-3 overflow-auto rounded-md border border-border p-2">
      <ul className="flex flex-col gap-2">{rows.map((r) => card(r, false))}</ul>
      {aside.length ? (
        <div>
          <h4 className="mb-2 text-sm font-medium">Set aside — {aside.length} not counted</h4>
          <ul className="flex flex-col gap-2">{aside.map((r) => card(r, true))}</ul>
        </div>
      ) : null}
    </div>
  );
}
