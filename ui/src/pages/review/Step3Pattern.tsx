import { useEffect, useMemo, useState } from 'react';

import { ClusterMapView } from '@/components/evidence/ClusterMap';
import { SimulationTable, type OutcomeFilter } from '@/components/evidence/SimulationTable';
import { TraceView } from '@/components/evidence/TraceView';
import { CarlaVideo } from '@/components/evidence/CarlaVideo';
import { VideoPanel } from '@/components/evidence/VideoPanel';
import { EmptyState, FileErrorNotice, Loading } from '@/components/feedback';
import { RequirementViewBody, ViewSwitch } from '@/components/requirement/RequirementViews';
import { ObstacleSummary } from '@/components/review/ObstacleSummary';
import { Button } from '@/components/ui/Button';
import { StatusChip, ToolVerdictChip } from '@/components/ui/Chip';
import { Disclosure } from '@/components/ui/Disclosure';
import { Instructions } from '@/components/ui/Instructions';
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
import { useBestScenario } from '@/hooks/useBestScenario';
import { useRequirementView } from '@/state/requirementView';
import { routeHash } from '@/state/route';
import { useWorkspace } from '@/state/WorkspaceContext';
import { STUDY } from '@/study/config';

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
  // opens on the diagram (owner, 2026-10-19); a new key, so an older remembered tree does not win
  const [view, setView] = useRequirementView('step3.opens-on-diagram', 'diagram');
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
      {/* the study build lists every obstacle A to Z: the list must not say which the tool supports */}
      {STUDY || report.obstacles.some(isSupported) ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-2 text-sm">
          <span className="text-text-muted">{STUDY ? 'Obstacles:' : 'Supported this round:'}</span>
          {[...report.obstacles]
            .filter((o) => STUDY || isSupported(o))
            .sort((a, b) => (STUDY ? a.id.localeCompare(b.id) : bySupport(a, b)))
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
          {STUDY ? null : (
            <span className="text-xs text-text-faint">
              {report.obstacles.filter((o) => !isSupported(o)).length} below the bar
            </span>
          )}
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

  const video = <BestScenarioVideo round={round} />;

  return (
    <div className="flex flex-col gap-5">
      <Instructions cta="Select an obstacle, in the diagram or in the list above it, to see the evidence behind it below.">
        <p>
          The goal model shows the requirement with the obstacles found in this round, each attached
          to the goal it blocks. An <strong>obstacle</strong> is a group of failed runs that share a
          likely cause, such as the pedestrian being too small for the detector or being detected
          too late.
        </p>
      </Instructions>
      <section
        className="card flex min-w-0 flex-col gap-3 p-5"
        aria-label="Requirement as a goal model"
      >
        {goalPanel}
      </section>

      <div className="flex min-w-0 flex-col gap-3">
        <Instructions cta="Open the simulations and select a run to see its distance, speed and detection over time.">
          <p>
            The evidence behind the selected obstacle: how many runs it covers, CARLA’s recording of
            the round’s best scenario, and the simulations themselves. With no obstacle selected,
            every simulation is listed.
          </p>
        </Instructions>
        <section
          className="card flex min-w-0 flex-col gap-4 p-5"
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
              {video}
              <Disclosure
                summary={`Simulations behind this${counts && counts.hits !== null ? ` (${counts.hits} of ${counts.scope})` : ''}`}
              >
                {table}
              </Disclosure>
            </>
          ) : (
            <>
              <h3 className="text-lg">Failures · video · evidence</h3>
              {noSupported && !STUDY ? (
                <Notice tone="success" title="No supported obstacle">
                  Nothing is above the support bar this round. The counts and set-aside rows are
                  still here.
                </Notice>
              ) : null}
              {video}
              <Disclosure summary="All simulations">{table}</Disclosure>
            </>
          )}
        </section>
      </div>

      <Instructions cta="Select a dot to open that run’s trace. With an obstacle selected, the runs behind it are ringed.">
        <p>
          Each dot is one counted run, placed so that runs which unfolded alike over time sit close
          together; a group of dots is a recurring way the scenario played out.
        </p>
      </Instructions>
      {patterns}
    </div>
  );
}

/**
 * CARLA's recording of the round's best scenario where the round has one
 * (hooks/useBestScenario.ts); otherwise the round's own video or frames
 * (VideoPanel).
 */
function BestScenarioVideo({ round }: { round: RoundSummary }) {
  const { testCase, video } = useBestScenario(round);
  if (!video || !testCase) return <VideoPanel round={round} />;
  return (
    <div className="flex flex-col gap-1.5">
      <CarlaVideo
        round={round}
        file={video}
        title={`Recording of the best scenario: test case ${testCase.id}`}
      />
      <a href={routeHash({ screen: 'example', runId: round.id })} className="text-xs">
        See the worked example of this test case
      </a>
    </div>
  );
}
