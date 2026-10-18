import { Chip, StatusChip, ToolVerdictChip } from '@/components/ui/Chip';
import { evidenceText } from '@/domain/decisions';
import type { AnalysisReport, Obstacle } from '@/services/schemas';
import type { Draft } from '@/state/draft';
import { displayPercent } from '@/utils/format';
import { STUDY } from '@/study/config';

/** What the tool says about one obstacle, as tool output, with its evidence line. */
export function ObstacleSummary({
  obstacle,
  report,
  previous,
  draft,
}: {
  obstacle: Obstacle;
  report: AnalysisReport;
  previous: AnalysisReport | null;
  draft: Draft | null;
}) {
  const entry = draft?.doc.obstacles[obstacle.id];
  const prev = previous?.obstacles.find((o) => o.id === obstacle.id);
  const bars = report.bars;
  const condition = obstacle.outcome
    ? `passes of type ${obstacle.outcome}; blocks the soft goal ${obstacle.blocks_goal}`
    : obstacle.failure_type
      ? `failures of type ${obstacle.failure_type}; blocks the goal ${obstacle.blocks_goal}`
      : `${obstacle.param} = ${obstacle.value}; blocks the goal ${obstacle.blocks_goal}`;
  return (
    <div className="tool-output flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="tool">tool output</Chip>
        <h3 className="text-lg font-semibold">{obstacle.id}</h3>
        <ToolVerdictChip verdict={obstacle.verdict} sampling={report.sampling} />
        {entry ? <StatusChip status={entry.status} hasPrevious={Boolean(previous)} /> : null}
      </div>
      <p className="prose-width text-sm">{obstacle.description}</p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-text-muted">Stands for</dt>
        <dd className="m-0">{condition}</dd>
        <dt className="text-text-muted">{STUDY ? 'Evidence' : 'Support this round'}</dt>
        <dd className="m-0">
          <span className="num">{entry?.evidence ?? evidenceText(obstacle)}</span>
          {bars && !STUDY ? (
            <span className="text-text-muted">
              {' '}
              · bar for support:{' '}
              {obstacle.failure_type || obstacle.outcome
                ? `${displayPercent(bars.min_share)} of the failures / passes`
                : `effect of ${displayPercent(bars.min_effect)} or more with at least ${bars.min_n} on each side`}
            </span>
          ) : null}
        </dd>
        {previous && !STUDY ? (
          <>
            <dt className="text-text-muted">Previous round</dt>
            <dd className="num m-0">
              {prev
                ? `${evidenceText(prev)} → ${prev.verdict.replace('_', ' ')}`
                : 'not assessed in the previous round'}
            </dd>
          </>
        ) : null}
        {obstacle.detection_failure_share !== null &&
        obstacle.detection_failure_share !== undefined ? (
          <>
            <dt className="text-text-muted">Perception share</dt>
            <dd className="m-0">
              {displayPercent(obstacle.detection_failure_share)} of these failures were perception
              failures (never detected, or detected too late to stop)
              {obstacle.detection_failure_share < 0.5
                ? '; the pedestrian was mostly seen in time, so look at braking behaviour'
                : ''}
              .
            </dd>
          </>
        ) : null}
        {obstacle.domain_property ? (
          <>
            <dt className="text-text-muted">Domain property</dt>
            <dd className="m-0">challenges {obstacle.domain_property}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
