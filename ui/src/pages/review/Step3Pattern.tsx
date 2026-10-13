import { useEffect, useMemo, useState } from 'react';

import { ClusterMapView } from '@/components/evidence/ClusterMap';
import { SimulationTable, type OutcomeFilter } from '@/components/evidence/SimulationTable';
import { TraceView } from '@/components/evidence/TraceView';
import { VideoPanel } from '@/components/evidence/VideoPanel';
import { EmptyState, FileErrorNotice, Loading } from '@/components/feedback';
import { RequirementViewBody, ViewSwitch } from '@/components/requirement/RequirementViews';
import { MitigationList } from '@/components/review/MitigationMenu';
import { ObstacleSummary } from '@/components/review/ObstacleSummary';
import { Button } from '@/components/ui/Button';
import { Chip, StatusChip, ToolVerdictChip } from '@/components/ui/Chip';
import { Disclosure } from '@/components/ui/Disclosure';
import { Notice } from '@/components/ui/Notice';
import { FileName } from '@/components/ui/Section';
import { reportedCounts, selectEvidence, type SimulationRow } from '@/domain/evidence';
import { buildGoalModel } from '@/domain/goalModel';
import { bySupport, isSupported } from '@/domain/support';
import type { RoundSummary } from '@/domain/lineage';
import { useAsync } from '@/hooks/useAsync';
import type { AnalysisReport } from '@/services/schemas';
import type { Draft } from '@/state/draft';
import { KNOWN_FILES } from '@/services/workspace';
import { useRequirementView } from '@/state/requirementView';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cx } from '@/utils/format';

/**
 * Step 3, the sandbox: the goal model on the left, failures and their video
 * evidence top right, the candidate fixes bottom right. One frame, three
 * panels, each scrolling inside itself on large screens; stacked below.
 */
export function Step3Pattern({
  round,
  report,
  previous,
  draft,
  focus,
}: {
  round: RoundSummary;
  report: AnalysisReport;
  previous: AnalysisReport | null;
  draft: Draft | null;
  focus: string | undefined;
}) {
  const { simulations, trace, clusterMap } = useWorkspace();
  const model = useMemo(() => buildGoalModel(report), [report]);
  const focusObstacle = focus?.startsWith('obstacle:') ? focus.slice('obstacle:'.length) : null;
  const [selectedId, setSelectedId] = useState<string | null>(focusObstacle);
  const [view, setView] = useRequirementView('step3', 'tree');
  const selectObstacle = (id: string | null) => {
    setSelectedId(id);
    setSelectedRow(null);
  };
  const [filter, setFilter] = useState<OutcomeFilter>(focus && !focusObstacle ? focus : 'all');
  const [selectedRow, setSelectedRow] = useState<SimulationRow | null>(null);

  useEffect(() => {
    if (focusObstacle) setSelectedId(focusObstacle);
    else if (focus) setFilter(focus);
  }, [focus, focusObstacle]);

  const rowsState = useAsync(() => simulations(round), [round.dir]);
  const rows = useMemo(() => (rowsState.status === 'ready' ? rowsState.data : []), [rowsState]);
  const obstacle = selectedId ? (report.obstacles.find((o) => o.id === selectedId) ?? null) : null;
  const selection = useMemo(
    () => (obstacle ? selectEvidence(obstacle, rows) : null),
    [obstacle, rows],
  );
  const tracePath = selectedRow
    ? (selectedRow.label?.trace ??
      (round.files.includes(`traces/${selectedRow.key}.json`)
        ? `traces/${selectedRow.key}.json`
        : null))
    : null;
  const traceState = useAsync(tracePath ? () => trace(round, tracePath) : null, [
    round.dir,
    tracePath,
  ]);
  const timestep = selectedRow ? Number(selectedRow.csv.timestep_s) || null : null;
  const hasMap = round.files.includes(KNOWN_FILES.clusterMap);
  const mapState = useAsync(hasMap ? () => clusterMap(round) : null, [round.dir, hasMap]);
  const highlight = useMemo(
    () => (selection ? new Set(selection.hits.map((r) => r.key)) : null),
    [selection],
  );
  const traceBlock = selectedRow ? (
    tracePath === null ? (
      <p className="text-sm text-text-muted">No trace file for this simulation.</p>
    ) : traceState.status === 'loading' ? (
      <Loading what={tracePath} />
    ) : traceState.status === 'error' ? (
      <FileErrorNotice error={traceState.error} />
    ) : traceState.status === 'ready' ? (
      <TraceView trace={traceState.data} file={tracePath} timestep={timestep} />
    ) : null
  ) : null;
  const entry = obstacle && draft ? draft.doc.obstacles[obstacle.id] : undefined;
  const noSupported = report.obstacles.every((o) => o.verdict !== 'supported');
  const counts = obstacle ? reportedCounts(obstacle) : null;

  const table =
    rowsState.status === 'loading' ? (
      <Loading what="simulations.csv" />
    ) : rowsState.status === 'error' ? (
      <FileErrorNotice error={rowsState.error} consequence="The simulations cannot be listed." />
    ) : rowsState.status === 'ready' ? (
      <div className="flex flex-col gap-4">
        <SimulationTable
          rows={rows}
          selection={selection}
          reported={counts ?? undefined}
          filter={filter}
          onFilterChange={setFilter}
          selectedKey={selectedRow?.key ?? null}
          onSelectRow={setSelectedRow}
          worstPhenotype={round.meta.worst_phenotype ?? null}
        />
        {selectedRow ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">
              Trace of {selectedRow.scenarioId}/{selectedRow.simIndex ?? '?'}
            </h4>
            {traceBlock}
            {round.meta.worst_phenotype &&
            selectedRow.csv.phenotype !== round.meta.worst_phenotype ? (
              <p className="text-xs text-text-muted">
                No video for this simulation: only the worst scenario was recorded.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  const patterns = (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="patterns-title">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="patterns-title" className="text-lg">
          Patterns across all encounters
        </h2>
        <p className="text-sm text-text-muted">
          How each run unfolded, grouped by likeness.{' '}
          {obstacle
            ? `The runs behind ${obstacle.id} are ringed.`
            : 'Select an obstacle to ring the runs behind it.'}
        </p>
      </div>
      {!hasMap ? (
        <EmptyState title="No cluster map for this round">
          Run <code>python -m scripts.analysis.cluster_map {round.dir}</code> to write{' '}
          <FileName>{KNOWN_FILES.clusterMap}</FileName> into the round folder, then reload.
        </EmptyState>
      ) : mapState.status === 'loading' ? (
        <Loading what={KNOWN_FILES.clusterMap} />
      ) : mapState.status === 'error' ? (
        <FileErrorNotice error={mapState.error} consequence="The pattern map cannot be shown." />
      ) : mapState.status === 'ready' ? (
        <ClusterMapView
          doc={mapState.data}
          rows={rows}
          highlight={highlight}
          highlightLabel={
            obstacle && selection
              ? `the ${selection.hits.length} runs behind ${obstacle.id} (${selection.description})`
              : undefined
          }
          selectedKey={selectedRow?.key ?? null}
          onSelect={(key) => setSelectedRow(rows.find((r) => r.key === key) ?? null)}
        />
      ) : null}
      {selectedRow && hasMap ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">
              Run {selectedRow.scenarioId}/{selectedRow.simIndex ?? '?'}
            </h3>
            <span className="text-sm text-text-muted">{selectedRow.csv.phenotype}</span>
            <Button
              size="sm"
              variant="quiet"
              className="ml-auto"
              onClick={() => setSelectedRow(null)}
            >
              Clear
            </Button>
          </div>
          {traceBlock}
        </div>
      ) : null}
    </section>
  );

  const goalPanel = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg">Requirement as goal model</h2>
        <span className="ml-auto">
          <ViewSwitch view={view} onChange={setView} />
        </span>
      </div>
      {report.obstacles.some(isSupported) ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-2 text-sm">
          <span className="text-text-muted">Supported this round:</span>
          {[...report.obstacles]
            .filter(isSupported)
            .sort(bySupport)
            .map((o) => (
              <Button
                key={o.id}
                size="sm"
                variant={o.id === selectedId ? 'primary' : 'secondary'}
                aria-pressed={o.id === selectedId}
                onClick={() => selectObstacle(o.id === selectedId ? null : o.id)}
              >
                {o.id}
              </Button>
            ))}
          <span className="text-xs text-text-faint">
            {report.obstacles.filter((o) => !isSupported(o)).length} below the bar
          </span>
        </div>
      ) : null}
      {model.limitation ? <Notice tone="warning">{model.limitation}</Notice> : null}
      <RequirementViewBody
        view={view}
        text={round.requirementText}
        model={model}
        report={report}
        draft={draft}
        hasPrevious={Boolean(previous)}
        sampling={report.sampling}
        selectedObstacleId={selectedId}
        onSelectObstacle={selectObstacle}
        textLabel="The requirement this round was run with"
      />
      {report.failure_model.warnings.length ? (
        <Disclosure
          summary={`Warnings about the data (${report.failure_model.warnings.length})`}
          compact
        >
          <ul className="list-disc pl-4 text-sm text-text-muted">
            {report.failure_model.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {view === 'diagram' ? (
        <section
          className="card flex min-w-0 flex-col gap-3 p-5"
          aria-label="Requirement as a goal model"
        >
          {goalPanel}
        </section>
      ) : null}
      <div className="card p-3">
        <div
          className={cx(
            'grid gap-3 lg:h-[calc(100dvh-15rem)]',
            view === 'diagram'
              ? 'lg:min-h-[34rem] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'
              : 'lg:min-h-[42rem] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]',
          )}
        >
          {view !== 'diagram' ? (
            <section
              className="panel flex min-w-0 flex-col gap-3 overflow-auto p-4 lg:row-span-2"
              aria-label="Requirement as a goal model"
            >
              {goalPanel}
            </section>
          ) : null}

          <section
            className="panel flex min-w-0 flex-col gap-4 overflow-auto p-4"
            aria-label="Failures, video, evidence"
          >
            {obstacle ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg">Evidence: {obstacle.id}</h3>
                  <ToolVerdictChip verdict={obstacle.verdict} sampling={report.sampling} />
                  {entry ? (
                    <StatusChip status={entry.status} hasPrevious={Boolean(previous)} />
                  ) : null}
                  <Button
                    size="sm"
                    variant="quiet"
                    className="ml-auto"
                    onClick={() => setSelectedId(null)}
                  >
                    Show all
                  </Button>
                </div>
                <p className="num text-sm text-text-muted">{entry?.evidence}</p>
                <Disclosure summary="What the tool says" compact>
                  <ObstacleSummary
                    obstacle={obstacle}
                    report={report}
                    previous={previous}
                    draft={draft}
                  />
                </Disclosure>
                <VideoPanel round={round} />
                <Disclosure
                  summary={`Simulations behind this${counts && counts.hits !== null ? ` (${counts.hits} of ${counts.scope})` : ''}`}
                >
                  {table}
                </Disclosure>
              </>
            ) : (
              <>
                <h3 className="text-lg">Failures · video · evidence</h3>
                {noSupported ? (
                  <Notice tone="success" title="No supported obstacle">
                    Nothing is above the support bar this round. The counts and set-aside rows are
                    still here.
                  </Notice>
                ) : (
                  <p className="text-sm text-text-muted">
                    Select an obstacle in the goal model. <Chip tone="tool">obstacle</Chip> marks
                    the tool's findings.
                  </p>
                )}
                <VideoPanel round={round} />
                <Disclosure summary="All simulations">{table}</Disclosure>
              </>
            )}
          </section>

          <section
            className="panel flex min-w-0 flex-col gap-3 overflow-auto p-4"
            aria-label="Fixes"
          >
            <h3 className="text-lg">Fixes</h3>
            {obstacle ? (
              <>
                <MitigationList
                  options={Object.entries(obstacle.mitigations ?? {})
                    .filter(([, v]) => v)
                    .map(([layer, action]) => ({ layer, action: action as string }))}
                  changes={obstacle.changes}
                />
                <p className="text-xs text-text-faint">
                  Tool suggestions by layer. You choose in the next step.
                </p>
              </>
            ) : (
              <p className="text-sm text-text-muted">
                Candidate fixes for the selected obstacle appear here.
              </p>
            )}
          </section>
        </div>
      </div>
      {patterns}
    </div>
  );
}
