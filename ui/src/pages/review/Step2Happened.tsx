import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';

import { FileErrorNotice, Loading } from '@/components/feedback';
import { DslEditor, type DslMark } from '@/components/requirement/DslEditor';
import { KaosDiagram } from '@/components/requirement/KaosDiagram';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { CountLink } from '@/components/ui/CountLink';
import { Disclosure } from '@/components/ui/Disclosure';
import { CollapseIcon, DownloadIcon, ExpandIcon, IconButton } from '@/components/ui/IconButton';
import { Instructions } from '@/components/ui/Instructions';
import { Notice } from '@/components/ui/Notice';
import { SETTING_COLUMNS } from '@/domain/evidence';
import { buildGoalModel } from '@/domain/goalModel';
import { layoutKaos } from '@/domain/kaosLayout';
import { runNumberOf, runOrdinal, type RoundSummary } from '@/domain/lineage';
import {
  isRecordingPass,
  requirementResults,
  runsCsv,
  testCases,
  testCasesCsv,
  type PartStatus,
  type RequirementPart,
  type RunResult,
} from '@/domain/testCases';
import { totalRuns } from '@/domain/reviewProgress';
import { useAsync } from '@/hooks/useAsync';
import type { AnalysisReport } from '@/services/schemas';
import { downloadText } from '@/services/signing';
import { KNOWN_FILES } from '@/services/workspace';
import { reviewHash } from '@/state/route';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cx, displayDate, displayPercent, shortId } from '@/utils/format';

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

  const [pointed, setPointed] = useState<RequirementPart | null>(null);
  const runNumber = runNumberOf(round, workspace?.rounds ?? []);

  return (
    <div className="flex flex-col gap-5">
      {runNumber > 1 && previous && previousRecorded ? (
        <section
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[color:var(--color-header)] bg-surface-raised px-5 py-3"
          aria-label="Which run this is"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold tracking-[0.08em] text-text uppercase">
              {runOrdinal(runNumber)} of this requirement
            </p>
            <p className="text-sm">
              This report tests <strong>R{runNumber - 1}</strong>, the requirement refined after the{' '}
              {runOrdinal(runNumber - 1).toLowerCase()}
              {previous.round.meta.created_at
                ? ` (${displayDate(previous.round.meta.created_at)})`
                : ''}
              . Its counts sit beside that run&rsquo;s in the table below.
            </p>
          </div>
          <a
            href={reviewHash(previous.round.id, 2)}
            className="text-sm font-semibold whitespace-nowrap underline"
          >
            See the {runOrdinal(runNumber - 1).toLowerCase()}&rsquo;s report →
          </a>
        </section>
      ) : null}
      <Instructions cta="Select any number to open the simulations behind it in the Failure Analysis.">
        <p>
          This report shows how the system under test performed against the requirement in
          simulation. A <strong>test case</strong> is one scenario, a combination of settings such
          as pedestrian, clothing and fog; a <strong>run</strong> is one simulation of it, and each
          test case is run several times. A run <strong>passes</strong> when the car keeps the 5 m
          safety margin to the pedestrian and <strong>fails</strong> when it does not.
          {fm.passed_stalled
            ? ` Of the ${fm.passes} passes, ${fm.passed_stalled} ended with the car stopped and never moving on again.`
            : ''}{' '}
          Runs are <strong>not counted</strong> when a scope rule or a broken domain assumption sets
          them aside, or when the run did not test anything, for example because the pedestrian
          never crossed.
          {recording ? ' The extra run recorded for the video is not a test run.' : ''}
        </p>
      </Instructions>
      <section className="card p-5" aria-label="Summary">
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
      </section>

      <Instructions cta="Point at a row to locate that part in the requirement, and note which failures to investigate in the Failure Analysis.">
        <p>
          Each part of the requirement is assessed on its own. The <strong>safety goal</strong> and
          the measurable <strong>soft goals</strong> are judged on the counted runs; each{' '}
          <strong>domain assumption</strong> is checked against the conditions every run actually
          met. <strong>Failed</strong> means the system did not meet that part.{' '}
          <strong>Broken</strong> means the assumption did not hold, so those runs are excluded from
          the verdict instead of being counted against the system. <strong>Not checked</strong>{' '}
          marks free text the tool cannot measure. Beside the list, the requirement marks each part
          where it sits, in the REAL-DSL and in the goal model.
        </p>
      </Instructions>
      <div className="grid items-stretch gap-5 xl:grid-cols-2">
        <section className="card flex min-w-0 flex-col gap-3 p-5" aria-labelledby="parts-title">
          <div className="flex flex-col gap-1">
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
              <li key={`${p.part}:${p.text}`}>
                <button
                  type="button"
                  onMouseEnter={() => setPointed(p)}
                  onMouseLeave={() => setPointed(null)}
                  onFocus={() => setPointed(p)}
                  onBlur={() => setPointed(null)}
                  aria-label={`${p.status} ${p.part}: ${p.text}. ${p.detail}`}
                  className={cx(
                    '-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-left transition-colors duration-fast hover:bg-fill',
                    pointed === p && 'bg-fill',
                  )}
                >
                  <Chip tone={PART_TONE[p.status]} className="w-[6.5rem] justify-center">
                    {p.status}
                  </Chip>
                  <span className="w-24 text-xs text-text-muted">{p.part}</span>
                  <code className="min-w-0 flex-1 text-sm text-text">{p.text}</code>
                  <span className="basis-full pl-[calc(6.5rem+0.75rem)] text-xs text-text-muted">
                    {p.detail}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <WhereItFailed round={round} report={report} parts={parts} pointed={pointed} />
      </div>

      <Instructions cta="Tick “only test cases with a failed run” to focus on the problems, then expand a test case to see each run’s outcome and closest approach. The icons download the table, every run, or the raw simulations.csv.">
        <p>
          Every scenario generated from the requirement appears once, with its settings and its
          results; a highlighted row has at least one failed run.
        </p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {COLUMN_NOTES.map(([term, note]) => (
            <div key={term} className="flex gap-2">
              <dt className="w-24 shrink-0 font-semibold">{term}</dt>
              <dd className="m-0">{note}</dd>
            </div>
          ))}
        </dl>
      </Instructions>
      <section className="card flex min-w-0 flex-col gap-3 p-5" aria-labelledby="cases-title">
        {rowsState.status === 'loading' ? <Loading what="simulations.csv" /> : null}
        {rowsState.status === 'error' ? (
          <FileErrorNotice error={rowsState.error} consequence="The test cases cannot be listed." />
        ) : null}
        <CaseTable
          cases={cases}
          runCount={runCount}
          downloads={
            <>
              <IconButton
                label="Download the test cases (CSV)"
                disabled={!cases.length}
                onClick={() =>
                  downloadText(`test_cases_${round.id.slice(0, 8)}.csv`, testCasesCsv(cases))
                }
              >
                <DownloadIcon badge="CSV" />
              </IconButton>
              <IconButton
                label="Download every run (CSV)"
                disabled={!cases.length}
                onClick={() =>
                  downloadText(`test_runs_${round.id.slice(0, 8)}.csv`, runsCsv(cases))
                }
              >
                <DownloadIcon badge="RUNS" />
              </IconButton>
              <IconButton
                label="Download the raw simulations.csv"
                disabled={!workspace}
                onClick={async () => {
                  const text = await workspace!.source.readText(
                    `${round.dir}/${KNOWN_FILES.simulations}`,
                  );
                  downloadText(`simulations_${round.id.slice(0, 8)}.csv`, text);
                }}
              >
                <DownloadIcon badge="RAW" />
              </IconButton>
            </>
          }
        />
      </section>

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

/** The test-case columns, explained for this project (the box above the table). */
const COLUMN_NOTES: [string, string][] = [
  ['Test case', 'the scenario’s number in this run.'],
  ['Pedestrian', 'adult or child, which changes how large the pedestrian appears to the detector.'],
  ['Clothing', 'light or dark; dark clothing is harder for the detector to see.'],
  [
    'Direction',
    'the kerb the pedestrian starts from, seen from the driver: LR from the left, RL from the right.',
  ],
  [
    'Distance',
    'how far ahead of the car the pedestrian waits to cross: Short (20 m) or Long (35 m).',
  ],
  ['Fog', 'the simulator’s fog density, from 0 % (clear) to 100 %.'],
  ['Runs', 'how many times the scenario was simulated.'],
  ['Passed', 'runs in which the car kept the 5 m safety margin.'],
  ['Failed', 'runs in which the car came closer than 5 m to the pedestrian.'],
  ['Not counted', 'runs set aside by a scope rule or a broken assumption, or that tested nothing.'],
];

/**
 * The requirement beside "What failed": the REAL-DSL or the goal model, each
 * part marked by its result (failed red, broken amber); the row pointed at
 * is outlined in both.
 */
function WhereItFailed({
  round,
  report,
  parts,
  pointed,
}: {
  round: RoundSummary;
  report: AnalysisReport;
  parts: RequirementPart[];
  pointed: RequirementPart | null;
}) {
  const [view, setView] = useState<'dsl' | 'model'>('dsl');
  const layout = useMemo(() => layoutKaos(buildGoalModel(report), { obstacles: [] }), [report]);
  const boxOf = useCallback(
    (p: RequirementPart): string | null => {
      if (p.part === 'safety goal') return 'goal';
      if (!layout.ok) return null;
      const kind = p.part === 'soft goal' ? 'soft' : p.part === 'assumption' ? 'domain' : null;
      return layout.boxes.find((b) => b.kind === kind && b.title === p.text)?.id ?? null;
    },
    [layout],
  );
  const tones = useMemo(() => {
    const t: Record<string, 'fail' | 'caution'> = {};
    for (const p of parts) {
      const id = boxOf(p);
      if (id && (p.status === 'failed' || p.status === 'broken'))
        t[id] = p.status === 'failed' ? 'fail' : 'caution';
    }
    return t;
  }, [parts, boxOf]);
  const marks: DslMark[] = parts
    .filter((p) => p.status === 'failed' || p.status === 'broken')
    .map((p) => ({ needle: p.text, tone: p.status === 'failed' ? 'fail' : 'caution' }));
  if (pointed) marks.push({ needle: pointed.text, tone: 'point' });
  const pointedBox = pointed ? boxOf(pointed) : null;
  const text = round.requirementText;
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-5" aria-label="Where it failed">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg">Where it failed</h2>
        <div className="ml-auto flex rounded-lg bg-fill p-0.5" role="group" aria-label="Show as">
          {(
            [
              ['dsl', 'REAL-DSL'],
              ['model', 'Goal model'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cx(
                'rounded-md px-3 py-1 text-xs transition-all duration-fast',
                view === v
                  ? 'bg-surface-raised font-medium text-text shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'dsl' ? (
        text ? (
          <DslEditor
            value={text}
            readOnly
            marks={marks}
            fileName={round.files.includes(KNOWN_FILES.r0) ? KNOWN_FILES.r0 : 'requirement as run'}
            status={
              <span className="flex flex-wrap items-center gap-x-3">
                <span className="rounded-sm bg-fail-soft px-1 text-fail underline decoration-2 underline-offset-2">
                  failed
                </span>
                <span className="rounded-sm bg-[#fbecc4] px-1 text-caution underline decoration-dotted decoration-2 underline-offset-2">
                  broken
                </span>
              </span>
            }
          />
        ) : (
          <Notice tone="warning">No requirement text for this round.</Notice>
        )
      ) : layout.ok ? (
        <KaosDiagram
          layout={layout}
          selectedObstacleId={null}
          onSelectObstacle={() => {}}
          fit
          withObstacles={false}
          tones={tones}
          highlight={pointedBox ? [pointedBox] : null}
        />
      ) : (
        <Notice tone="info" title="No diagram for this requirement">
          {layout.reason}.
        </Notice>
      )}
    </section>
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

function CaseTable({
  cases,
  runCount,
  downloads,
}: {
  cases: ReturnType<typeof testCases>;
  runCount: number;
  downloads: ReactNode;
}) {
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="cases-title" className="text-lg">
          Test cases
        </h2>
        <span className="text-sm text-text-muted">
          {cases.length} test cases, {runCount} runs
        </span>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={onlyFailing}
            onChange={(e) => setOnlyFailing(e.target.checked)}
          />
          only test cases with a failed run
        </label>
        <span className="ml-auto flex items-center gap-1.5">
          <IconButton
            label="Expand every test case"
            disabled={!shown.length}
            onClick={() => setOpen(new Set(shown.map((c) => c.id)))}
          >
            <ExpandIcon />
          </IconButton>
          <IconButton
            label="Collapse every test case"
            disabled={!open.size}
            onClick={() => setOpen(new Set())}
          >
            <CollapseIcon />
          </IconButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <span className="flex items-center gap-3.5 pr-2">{downloads}</span>
        </span>
      </div>
      {cases.length ? (
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
                    <tr
                      className={cx('border-t border-border', tc.failed > 0 && 'bg-fail-soft/40')}
                    >
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
      ) : null}
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
