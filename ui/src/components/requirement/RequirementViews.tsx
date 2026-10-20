import { useMemo, type ReactNode } from 'react';

import { DslBlock } from '@/components/requirement/DslBlock';
import { GoalTree } from '@/components/requirement/GoalTree';
import { KaosDiagram } from '@/components/requirement/KaosDiagram';
import { Notice } from '@/components/ui/Notice';
import type { GoalModel } from '@/domain/goalModel';
import { layoutKaos } from '@/domain/kaosLayout';
import type { AnalysisReport } from '@/services/schemas';
import type { Draft } from '@/state/draft';
import type { RequirementView } from '@/state/requirementView';
import { STUDY } from '@/study/config';
import { cx } from '@/utils/format';

/**
 * Three views of one requirement - its text, the goal tree, the KAOS
 * diagram - switched by one control. All three read the same parse tree
 * (the report's) and the same selection; none is a source of truth, the
 * .dsl file is. The chosen view is remembered per screen, across steps and
 * reloads (kept in this browser only; it falls back to the default when
 * storage is unavailable).
 */
/** Round-to-round status, short enough for an obstacle box (the tree and step 4 carry the long words). */
const SHORT_STATUS: Record<string, string> = {
  new: 'new',
  persisting: 'persisting',
  resolved: 'no longer supported',
  absent: 'in neither round',
};

const VIEWS: { value: RequirementView; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'tree', label: 'Tree' },
  { value: 'diagram', label: 'Diagram' },
];

export function ViewSwitch({
  view,
  onChange,
  label = 'Show the requirement as',
}: {
  view: RequirementView;
  onChange: (v: RequirementView) => void;
  label?: string;
}) {
  return (
    <div className="flex rounded-lg bg-fill p-0.5" role="group" aria-label={label}>
      {VIEWS.filter((v) => !(STUDY && v.value === 'tree')).map((v) => (
        <button
          key={v.value}
          type="button"
          aria-pressed={view === v.value}
          onClick={() => onChange(v.value)}
          className={cx(
            'rounded-md px-3 py-1 text-xs transition-all duration-fast',
            view === v.value
              ? 'bg-surface-raised font-medium text-text shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-[#5a5a5e]'
              : 'text-text-muted hover:text-text',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/** The body for the chosen view. The diagram falls back to the tree, with the reason, if it cannot be laid out. */
export function RequirementViewBody({
  view,
  text,
  model,
  report,
  draft,
  hasPrevious,
  sampling,
  selectedObstacleId,
  onSelectObstacle,
  textLabel,
}: {
  view: RequirementView;
  text: string | null;
  model: GoalModel;
  report: AnalysisReport;
  draft: Draft | null;
  hasPrevious: boolean;
  sampling?: string;
  selectedObstacleId: string | null;
  onSelectObstacle: (id: string | null) => void;
  textLabel: string;
}): ReactNode {
  const layout = useMemo(
    () =>
      view === 'diagram'
        ? layoutKaos(model, report, (id) => {
            const status = draft?.doc.obstacles[id]?.status;
            return hasPrevious && status ? (SHORT_STATUS[status] ?? status) : null;
          })
        : null,
    [view, model, report, draft, hasPrevious],
  );

  if (view === 'text')
    return text ? (
      <DslBlock text={text} label={textLabel} />
    ) : (
      <Notice tone="warning">No requirement text for this round.</Notice>
    );

  const tree = (
    <div className="min-w-[20rem]">
      <GoalTree
        model={model}
        selectedObstacleId={selectedObstacleId}
        onSelectObstacle={onSelectObstacle}
        draft={draft}
        hasPrevious={hasPrevious}
        sampling={sampling}
      />
    </div>
  );
  if (view === 'tree' || !layout) return tree;
  if (!layout.ok)
    return (
      <>
        <Notice tone="info" title="No diagram for this requirement">
          {layout.reason}. The tree shows the same goal model.
        </Notice>
        {tree}
      </>
    );
  return (
    <>
      <p className="text-xs text-text-muted lg:hidden">
        The diagram scrolls sideways at this width; the Tree view fits it.
      </p>
      <KaosDiagram
        layout={layout}
        selectedObstacleId={selectedObstacleId}
        onSelectObstacle={onSelectObstacle}
      />
    </>
  );
}
