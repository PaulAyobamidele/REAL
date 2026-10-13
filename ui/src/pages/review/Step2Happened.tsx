import { Fragment, useMemo, useState } from 'react';

import { VideoPanel } from '@/components/evidence/VideoPanel';
import { FileErrorNotice, Loading } from '@/components/feedback';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { CountLink } from '@/components/ui/CountLink';
import { Disclosure } from '@/components/ui/Disclosure';
import { SETTING_COLUMNS } from '@/domain/evidence';
import type { RoundSummary } from '@/domain/lineage';
import {
  isRecordingPass,
  requirementResults,
  runsCsv,
  testCases,
  testCasesCsv,
  type PartStatus,
  type RunResult,
} from '@/domain/testCases';
import { totalRuns } from '@/domain/reviewProgress';
import { useAsync } from '@/hooks/useAsync';
import type { AnalysisReport } from '@/services/schemas';
import { downloadText } from '@/services/signing';
import { KNOWN_FILES } from '@/services/workspace';
import { reviewHash } from '@/state/route';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cx, displayPercent, shortId } from '@/utils/format';

/**
 * Step 2, the test execution result, written like a test report: how many
 * test cases (scenarios) and runs (simulations), how many passed and
 * failed, which parts of the requirement failed, every test case with its
 * runs (all downloadable), and the one recorded run. Counts still lead to
 * their simulations; nothing here names an obstacle - that is step 3.
 */
export function Step2Happened({
  round,
  report,
  previous,
  previousRecorded,
}: {
  round: RoundSummary;
  report: AnalysisReport;
  previous: { round: RoundSummary; report: AnalysisReport } | null;
  previousRecorded: boolean;
}) {
  const { simulations, workspace } = useWorkspace();
  const rowsState = useAsync(() => simulations(round), [round.dir]);
  const rows = useMemo(() => (rowsState.status === 'ready' ? rowsState.data : []), [rowsState]);
  const cases = useMemo(() => testCases(rows), [rows]);
  const parts = useMemo(() => requirementResults(report), [report]);
  const fm = report.failure_model;
  const runCount = rows.filter((r) => !isRecordingPass(r)).length;
  const recording = rows.length - runCount;
  const failedParts = parts.filter((p) => p.status === 'failed');

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4 p-5" aria-label="Summary">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat
            term="Test cases"
            value={cases.length || fm.n_scenarios}
            href={reviewHash(round.id, 3, 'all')}
          />
          <Stat
            term="Runs"
            value={runCount || fm.n_simulations}
            href={reviewHash(round.id, 3, 'all')}
          />
          <Stat
            term="Passed"
            value={fm.passes}
            tone="pass"
            href={reviewHash(round.id, 3, 'counted')}
          />
          <Stat
            term="Failed"
            value={fm.failures}
            tone={fm.failures ? 'fail' : undefined}
            extra={displayPercent(fm.failure_rate)}
            href={reviewHash(round.id, 3, 'failures')}
          />
          <Stat
            term="Not counted"
            value={Math.max(0, (runCount || totalRuns(report)) - fm.passes - fm.failures)}
            href={reviewHash(round.id, 3, 'set_aside')}
          />
        </dl>
        <p className="text-sm text-text-muted">
          A test case is one scenario; a run is one simulation of it.{' '}
          {fm.passed_stalled
            ? `Of the ${fm.passes} passes, ${fm.passed_stalled} stopped and never moved on. `
            : ''}
          Not counted: runs set aside by a scope rule or a broken assumption, and test defects.
          {recording ? ` The recording run for the video (${recording}) is not a test run.` : ''}
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="parts-title">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="parts-title" className="text-lg">
            What failed in the requirement
          </h2>
          <span className="text-sm text-text-muted">
            {failedParts.length
              ? `${failedParts.length} part${failedParts.length === 1 ? '' : 's'} failed: ${failedParts.map((p) => p.text).join(', ')}`
              : 'No part of the requirement failed this round'}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-border/70">
          {parts.map((p) => (
            <li
              key={`${p.part}:${p.text}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
            >
              <Chip tone={PART_TONE[p.status]} className="w-[6.5rem] justify-center">
                {p.status}
              </Chip>
              <span className="w-24 text-xs text-text-muted">{p.part}</span>
              <code className="min-w-0 flex-1 text-sm text-text">{p.text}</code>
              <span className="basis-full text-xs text-text-muted sm:basis-auto">{p.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card flex min-w-0 flex-col gap-3 p-5" aria-labelledby="cases-title">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="cases-title" className="text-lg">
              Test cases
            </h2>
            <span className="text-sm text-text-muted">
              {cases.length} test cases, {runCount} runs
            </span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              <Button
                size="sm"
                disabled={!cases.length}
                onClick={() =>
                  downloadText(`test_cases_${round.id.slice(0, 8)}.csv`, testCasesCsv(cases))
                }
              >
                Download test cases
              </Button>
              <Button
                size="sm"
                disabled={!cases.length}
                onClick={() =>
                  downloadText(`test_runs_${round.id.slice(0, 8)}.csv`, runsCsv(cases))
                }
              >
                Download all runs
              </Button>
              <Button
                size="sm"
                variant="quiet"
                disabled={!workspace}
                onClick={async () => {
                  const text = await workspace!.source.readText(
                    `${round.dir}/${KNOWN_FILES.simulations}`,
                  );
                  downloadText(`simulations_${round.id.slice(0, 8)}.csv`, text);
                }}
              >
                simulations.csv
              </Button>
            </span>
          </div>
          {rowsState.status === 'loading' ? <Loading what="simulations.csv" /> : null}
          {rowsState.status === 'error' ? (
            <FileErrorNotice
              error={rowsState.error}
              consequence="The test cases cannot be listed."
            />
          ) : null}
          {cases.length ? <CaseTable cases={cases} /> : null}
        </section>

        <section className="card flex min-w-0 flex-col gap-3 p-5" aria-label="The recorded run">
          <h2 className="text-lg">Recorded test case</h2>
          <VideoPanel round={round} />
        </section>
      </div>

      <Disclosure
        summary={previous ? 'All counts, beside the previous round' : 'All counts'}
        className="rounded-xl bg-surface-sunken px-4 py-2"
      >
        <CountsTable
          round={round}
          report={report}
          previous={previous}
          previousRecorded={previousRecorded}
        />
      </Disclosure>
    </div>
  );
}

const PART_TONE: Record<PartStatus, ChipTone> = {
  failed: 'fail',
  broken: 'caution',
  rejected: 'caution',
  held: 'pass',
  'not checked': 'neutral',
};

const RESULT_TONE: Record<RunResult, string> = {
  passed: 'text-pass',
  'passed, stopped and never moved on': 'text-caution',
  failed: 'text-fail font-medium',
  'not counted': 'text-text-faint',
};

function Stat({
  term,
  value,
  href,
  tone,
  extra,
}: {
  term: string;
  value: number;
  href: string;
  tone?: 'pass' | 'fail';
  extra?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-surface-sunken px-4 py-3">
      <dt className="text-xs font-medium text-text-muted">{term}</dt>
      <dd className="m-0 flex items-baseline gap-2">
        <a
          href={href}
          className={cx(
            'num text-2xl font-semibold no-underline hover:underline',
            tone === 'pass' ? 'text-pass' : tone === 'fail' ? 'text-fail' : 'text-text',
          )}
          title="show the simulations behind this number"
        >
          {value}
        </a>
        {extra ? <span className="text-xs text-text-muted">{extra}</span> : null}
      </dd>
    </div>
  );
}

function CaseTable({ cases }: { cases: ReturnType<typeof testCases> }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyFailing, setOnlyFailing] = useState(false);
  const shown = onlyFailing ? cases.filter((c) => c.failed > 0) : cases;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={onlyFailing}
            onChange={(e) => setOnlyFailing(e.target.checked)}
          />
          only test cases with a failed run
        </label>
        <Button size="sm" variant="quiet" onClick={() => setOpen(new Set(shown.map((c) => c.id)))}>
          Expand all
        </Button>
        <Button size="sm" variant="quiet" onClick={() => setOpen(new Set())}>
          Collapse all
        </Button>
      </div>
      <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-sunken text-xs text-text-muted">
            <tr>
              <th scope="col" className="px-2.5 py-2 font-medium">
                Test case
              </th>
              {SETTING_COLUMNS.map((c) => (
                <th key={c.key} scope="col" className="px-2 py-2 font-medium">
                  {c.header}
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-right font-medium">
                runs
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                passed
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                failed
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-medium">
                not counted
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((tc) => {
              const isOpen = open.has(tc.id);
              return (
                <Fragment key={tc.id}>
                  <tr className={cx('border-t border-border', tc.failed > 0 && 'bg-fail-soft/40')}>
                    <th scope="row" className="px-2.5 py-1.5 font-normal">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggle(tc.id)}
                        className="flex items-center gap-1.5 font-mono text-text"
                        title={tc.phenotype}
                      >
                        <span
                          aria-hidden="true"
                          className={cx(
                            'inline-block text-text-faint transition-transform duration-fast',
                            isOpen && 'rotate-90',
                          )}
                        >
                          ›
                        </span>
                        {tc.id}
                      </button>
                    </th>
                    {SETTING_COLUMNS.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-text-muted">
                        {tc.settings[c.key]}
                        {tc.settings[c.key] && c.unit ? c.unit : ''}
                      </td>
                    ))}
                    <td className="num px-2 py-1.5 text-right">{tc.runs.length}</td>
                    <td className="num px-2 py-1.5 text-right text-pass">{tc.passed}</td>
                    <td
                      className={cx(
                        'num px-2 py-1.5 text-right',
                        tc.failed ? 'font-semibold text-fail' : 'text-text-faint',
                      )}
                    >
                      {tc.failed}
                    </td>
                    <td className="num px-2.5 py-1.5 text-right text-text-faint">
                      {tc.notCounted}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="bg-surface-sunken/60">
                      <td colSpan={SETTING_COLUMNS.length + 5} className="px-2.5 py-2">
                        <p className="mb-1.5 font-mono text-xs text-text-muted">{tc.phenotype}</p>
                        <ul className="flex flex-col gap-0.5 text-xs">
                          {tc.runs.map((r) => (
                            <li key={r.row.key} className="flex flex-wrap gap-x-3">
                              <span className="num w-14 text-text-muted">
                                run {r.row.simIndex ?? '?'}
                              </span>
                              <span className={RESULT_TONE[r.result]}>{r.result}</span>
                              {r.reason ? (
                                <span className="text-text-faint">({r.reason})</span>
                              ) : null}
                              {r.row.csv.min_distance_m ? (
                                <span className="num text-text-faint">
                                  closest {Number(r.row.csv.min_distance_m).toFixed(1)} m
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface CountRow {
  label: string;
  focus: string;
  value: (r: AnalysisReport) => number | null | undefined;
  extra?: (r: AnalysisReport) => string;
  onlyIf?: (r: AnalysisReport) => boolean;
}

const COUNT_ROWS: CountRow[] = [
  { label: 'simulations', focus: 'all', value: (r) => r.failure_model.n_simulations },
  { label: 'true encounters', focus: 'counted', value: (r) => r.failure_model.n_encounters },
  {
    label: 'failed',
    focus: 'failures',
    value: (r) => r.failure_model.failures,
    extra: (r) => displayPercent(r.failure_model.failure_rate),
  },
  {
    label: 'passed, but stopped and never moved again',
    focus: 'passed_stalled',
    value: (r) => r.failure_model.passed_stalled,
  },
  { label: 'passed, drove on', focus: 'passed', value: (r) => r.failure_model.passed_clean },
  {
    label: 'no encounter (not counted)',
    focus: 'no_encounter',
    value: (r) => r.failure_model.n_no_encounter,
  },
  {
    label: 'car left the road (not counted)',
    focus: 'left_road',
    value: (r) => r.failure_model.n_left_road,
    onlyIf: (r) => (r.failure_model.n_left_road ?? 0) > 0,
  },
  {
    label: 'pedestrian never crossed (not counted)',
    focus: 'not_crossed',
    value: (r) => r.failure_model.n_not_crossed,
    onlyIf: (r) => (r.failure_model.n_not_crossed ?? 0) > 0,
  },
  {
    label: 'set aside by a rule or a broken assumption',
    focus: 'set_aside',
    value: (r) => r.admissibility.n_spurious,
  },
  {
    label: 'could not be simulated',
    focus: 'all',
    value: (r) => r.not_simulated?.length ?? 0,
    onlyIf: (r) => (r.not_simulated?.length ?? 0) > 0,
  },
];

/** The full count table, this round beside the previous one; each number leads to its simulations. */
function CountsTable({
  round,
  report,
  previous,
  previousRecorded,
}: {
  round: RoundSummary;
  report: AnalysisReport;
  previous: { round: RoundSummary; report: AnalysisReport } | null;
  previousRecorded: boolean;
}) {
  const rows = COUNT_ROWS.filter(
    (r) => !r.onlyIf || r.onlyIf(report) || (previous && r.onlyIf(previous.report)),
  );
  return (
    <div className="pb-2">
      <table className="w-full max-w-2xl text-sm">
        <thead className="text-xs text-text-muted">
          <tr>
            <th scope="col" className="py-2 text-left font-medium"></th>
            <th scope="col" className="py-2 text-right font-medium">
              this round
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {previous ? 'previous' : '—'}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const v = row.value(report);
            const pv = previous ? row.value(previous.report) : null;
            return (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-text">
                  {row.label}
                </th>
                <td className="num py-2 text-right">
                  {v === null || v === undefined ? (
                    <span className="text-text-muted">n/a</span>
                  ) : (
                    <CountLink href={reviewHash(round.id, 3, row.focus)}>{v}</CountLink>
                  )}
                  {row.extra ? (
                    <span className="ml-2 text-xs text-text-muted">{row.extra(report)}</span>
                  ) : null}
                </td>
                <td className="num py-2 text-right text-text-muted">
                  {previous ? (
                    pv === null || pv === undefined ? (
                      'n/a'
                    ) : (
                      <>
                        <CountLink
                          href={reviewHash(previous.round.id, 3, row.focus)}
                          title="the previous round's simulations"
                        >
                          {pv}
                        </CountLink>
                        {row.extra ? (
                          <span className="ml-2 text-xs">{row.extra(previous.report)}</span>
                        ) : null}
                      </>
                    )
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-text-muted">
        {previous
          ? `Previous: ${shortId(previous.round.id, 12)}${previousRecorded ? '' : ' (by date; no parent recorded)'}.`
          : 'No previous round to compare against.'}{' '}
        Numbers lead to their simulations.
      </p>
    </div>
  );
}
