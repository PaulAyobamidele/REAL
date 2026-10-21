import { useMemo } from 'react';

import { DslLegend } from '@/components/requirement/DslBlock';
import { RequirementViewBody, ViewSwitch } from '@/components/requirement/RequirementViews';
import { Disclosure } from '@/components/ui/Disclosure';
import { Notice } from '@/components/ui/Notice';
import { Fact, FileName } from '@/components/ui/Section';
import { buildGoalModel } from '@/domain/goalModel';
import type { RoundSummary } from '@/domain/lineage';
import type { AnalysisReport } from '@/services/schemas';
import { KNOWN_FILES } from '@/services/workspace';
import { useRequirementView } from '@/state/requirementView';
import { reviewHash } from '@/state/route';
import { STUDY } from '@/study/config';
import { cx } from '@/utils/format';

const SAMPLING_WORDS: Record<string, string> = {
  grid: 'balanced grid, every scenario equally often',
  list: 'a chosen list of scenarios, each equally often',
  ge: 'GE search: scenarios bred towards failure, so rates are leads, not population rates',
};

/** Step 1: the requirement with its three parts, the system it selected, and the rest behind a dropdown. */
export function Step1Asked({ round, report }: { round: RoundSummary; report: AnalysisReport }) {
  const text = round.requirementText;
  const source = round.files.includes(KNOWN_FILES.r0) ? KNOWN_FILES.r0 : KNOWN_FILES.runMeta;
  const req = report.requirement;
  const meta = round.meta;
  const sut = meta.system_under_test;
  const assumptions = req.assumptions ?? [];
  const softGoals = req.soft_goals ?? [];
  const model = useMemo(() => buildGoalModel(report), [report]);
  const [view, setView] = useRequirementView('step1', 'text');
  return (
    <div
      className={cx(
        'grid gap-5',
        view !== 'diagram' && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
      )}
    >
      <section className="card flex min-w-0 flex-col gap-4 p-5" aria-label="The requirement">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg">Requirement</h2>
          <FileName>{source}</FileName>
          <span className="ml-auto">
            <ViewSwitch view={view} onChange={setView} />
          </span>
        </div>
        {round.note ? <p className="text-sm">{round.note}</p> : null}
        {text || view !== 'text' ? (
          <RequirementViewBody
            view={view}
            text={text}
            model={model}
            report={report}
            draft={null}
            hasPrevious={false}
            sampling={report.sampling}
            selectedObstacleId={null}
            onSelectObstacle={(id) => {
              if (id) window.location.hash = reviewHash(round.id, 3, `obstacle:${id}`);
            }}
            textLabel="The requirement this round was run with"
          />
        ) : (
          <Notice tone="warning">No requirement text in {source}.</Notice>
        )}
        {view === 'text' ? <DslLegend /> : null}
        {req.parsed === false ? (
          <Notice tone="warning">
            The tool could not parse this requirement{req.error ? `: ${req.error}` : ''}.
          </Notice>
        ) : null}
        {/* a report's banner is a researcher's note: not shown to study participants */}
        {report.banner && !STUDY ? <Notice tone="tool">{report.banner}</Notice> : null}
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="card p-5" aria-label="The system it selected">
          <h2 className="mb-2 text-lg">System under test</h2>
          <dl>
            <Fact term="Detector">
              <span className="dsl-performed font-mono text-sm">
                {req.detection_module ?? sut?.yolo_model ?? 'n/a'}
              </span>
            </Fact>
            <Fact term="Braking">
              <span className="dsl-performed font-mono text-sm">
                {sut?.braking_mode ?? 'not recorded'}
              </span>
            </Fact>
            <Fact term="Assumptions">
              {assumptions.length ? (
                <ul className="flex flex-col gap-1">
                  {assumptions.map((a) => (
                    <li key={a} className="dsl-assuming font-mono text-sm">
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                'none stated'
              )}
            </Fact>
            <Fact term="Soft goals">
              {softGoals.length ? (
                <ul className="flex flex-col gap-1">
                  {softGoals.map((s) => (
                    <li key={s} className="dsl-ensuring font-mono text-sm">
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                'none stated'
              )}
            </Fact>
          </dl>
        </section>

        <section className="card p-5" aria-label="Scenario space and scoring">
          <h2 className="mb-1 text-lg">Scenario space</h2>
          <p className="text-sm text-text-muted">
            {meta.n_scenarios ?? 'n/a'} scenarios × {meta.trials_per_scenario ?? 'n/a'} trials ·{' '}
            {report.failure_model.n_simulations} simulations
          </p>
          <Disclosure summary="Details" className="mt-2">
            <dl>
              <Fact term="Sentence">{meta.scenario_text ?? req.scenario_text ?? 'n/a'}</Fact>
              <Fact term="Grammar">
                {meta.grammar_file ? <FileName>{meta.grammar_file}</FileName> : 'not recorded'}
              </Fact>
              <Fact term="Sampling">{SAMPLING_WORDS[report.sampling ?? 'grid']}</Fact>
              <Fact term="Seed">{meta.seed ?? 'not recorded'}</Fact>
              {meta.constraints && Object.keys(meta.constraints).length ? (
                <Fact term="Constraints">
                  {Object.entries(meta.constraints)
                    .map(([k, v]) => `${k} = ${v}`)
                    .join(', ')}
                </Fact>
              ) : null}
              {meta.scene ? (
                <Fact term="Scene">
                  version {String((meta.scene as { version?: unknown }).version ?? 'n/a')}
                </Fact>
              ) : null}
            </dl>
          </Disclosure>
          <Disclosure summary="How a simulation was scored">
            <p className="prose-width text-sm text-text-muted">
              The car must keep the safety margin to the pedestrian. Each row of{' '}
              <FileName>simulations.csv</FileName> records <code>rho</code>, the closest approach
              minus the margin; a simulation passes when rho stays at or above zero. A run in which
              the car never met the pedestrian is a no-encounter, not a pass.
            </p>
          </Disclosure>
        </section>
      </div>
    </div>
  );
}
