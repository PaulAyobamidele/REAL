import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Chip, StatusChip, ToolVerdictChip } from '@/components/ui/Chip';
import {
  belowBarOf,
  flattenModel,
  initiallyExpanded,
  type GoalModel,
  type ModelNode,
} from '@/domain/goalModel';
import type { Draft } from '@/state/draft';
import { displayPercent, cx } from '@/utils/format';
import { STUDY } from '@/study/config';

/**
 * The requirement as a goal tree with obstacles attached - a WAI-ARIA tree
 * (roles tree / treeitem / group, roving tab index, arrow keys). Obstacle
 * nodes are a distinct node type, styled so they cannot be mistaken for a
 * part of the requirement: dashed outline, the word "obstacle", the tool's
 * verdict as machine output.
 */
export interface GoalTreeProps {
  model: GoalModel;
  selectedObstacleId: string | null;
  onSelectObstacle: (obstacleId: string | null) => void;
  draft: Draft | null;
  hasPrevious: boolean;
  sampling?: string;
}

interface Row {
  node: ModelNode;
  level: number;
  parentId: string | null;
  index: number;
  size: number;
}

function rows(model: GoalModel, expanded: ReadonlySet<string>): Row[] {
  const out: Row[] = [];
  const visit = (
    node: ModelNode,
    level: number,
    parentId: string | null,
    index: number,
    size: number,
  ) => {
    out.push({ node, level, parentId, index, size });
    if (expanded.has(node.id))
      node.children.forEach((c, i) => visit(c, level + 1, node.id, i, node.children.length));
  };
  const roots = [model.root, model.assumptions, model.softGoals, model.unattached].filter(
    (n): n is ModelNode => Boolean(n),
  );
  roots.forEach((r, i) => visit(r, 1, null, i, roots.length));
  return out;
}

export function GoalTree({
  model,
  selectedObstacleId,
  onSelectObstacle,
  draft,
  hasPrevious,
  sampling,
}: GoalTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => initiallyExpanded(model));
  const [focusId, setFocusId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    setExpanded(initiallyExpanded(model));
  }, [model]);

  // an obstacle selected from elsewhere (a link, the decision screen) is shown even if folded
  useEffect(() => {
    const fold = selectedObstacleId ? belowBarOf(model, selectedObstacleId) : null;
    if (fold) setExpanded((prev) => (prev.has(fold) ? prev : new Set(prev).add(fold)));
  }, [model, selectedObstacleId]);

  const visible = useMemo(() => rows(model, expanded), [model, expanded]);
  const visibleIds = useMemo(() => visible.map((r) => r.node.id), [visible]);
  const current = focusId && visibleIds.includes(focusId) ? focusId : (visibleIds[0] ?? null);

  const focusNode = useCallback((id: string) => {
    setFocusId(id);
    itemRefs.current.get(id)?.focus();
  }, []);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const activate = useCallback(
    (node: ModelNode) => {
      if (node.kind === 'obstacle')
        onSelectObstacle(selectedObstacleId === node.obstacle.id ? null : node.obstacle.id);
      else if (node.children.length) toggle(node.id);
    },
    [onSelectObstacle, selectedObstacleId, toggle],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, row: Row) => {
    const i = visibleIds.indexOf(row.node.id);
    const flat = flattenModel(model, expanded);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (i < visibleIds.length - 1) focusNode(visibleIds[i + 1] as string);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (i > 0) focusNode(visibleIds[i - 1] as string);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (row.node.children.length) {
          if (!expanded.has(row.node.id)) toggle(row.node.id);
          else focusNode(row.node.children[0]?.id as string);
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (row.node.children.length && expanded.has(row.node.id)) toggle(row.node.id);
        else if (row.parentId) focusNode(row.parentId);
        break;
      case 'Home':
        event.preventDefault();
        focusNode(flat[0]?.id as string);
        break;
      case 'End':
        event.preventDefault();
        focusNode(flat[flat.length - 1]?.id as string);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        activate(row.node);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tree"
      aria-label="Requirement as a goal model, with obstacles attached"
      className="flex flex-col gap-0.5 text-sm"
    >
      {visible.map((row) => {
        const { node } = row;
        const isObstacle = node.kind === 'obstacle';
        const selected = isObstacle && node.obstacle.id === selectedObstacleId;
        const hasChildren = node.children.length > 0;
        const open = expanded.has(node.id);
        return (
          <div
            key={node.id}
            ref={(el) => {
              if (el) itemRefs.current.set(node.id, el);
              else itemRefs.current.delete(node.id);
            }}
            role="treeitem"
            aria-level={row.level}
            aria-setsize={row.size}
            aria-posinset={row.index + 1}
            aria-expanded={hasChildren ? open : undefined}
            aria-selected={isObstacle ? selected : undefined}
            tabIndex={node.id === current ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, row)}
            onFocus={() => setFocusId(node.id)}
            onClick={(e) => {
              e.stopPropagation();
              activate(node);
            }}
            className={cx(
              'flex cursor-default items-start gap-2 rounded-md py-1 pr-2 outline-offset-0',
              isObstacle ? 'cursor-pointer' : hasChildren ? 'cursor-pointer' : '',
              selected ? 'bg-human-soft/60' : 'hover:bg-surface-sunken',
            )}
            style={{ paddingLeft: `${(row.level - 1) * 1.1 + 0.25}rem` }}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 w-3 shrink-0 text-center text-xs text-text-faint"
            >
              {hasChildren ? (open ? '▾' : '▸') : ''}
            </span>
            <NodeBody node={node} draft={draft} hasPrevious={hasPrevious} sampling={sampling} />
          </div>
        );
      })}
    </div>
  );
}

function Label({ kind, children }: { kind: string; children?: ReactNode }) {
  return (
    <span className="mr-1 text-xs uppercase tracking-wide text-text-faint">
      {kind}
      {children}
    </span>
  );
}

function NodeBody({
  node,
  draft,
  hasPrevious,
  sampling,
}: {
  node: ModelNode;
  draft: Draft | null;
  hasPrevious: boolean;
  sampling?: string;
}) {
  switch (node.kind) {
    case 'goal':
      return (
        <div>
          <Label kind="top goal" />
          <span className="font-mono text-xs text-text-muted">{node.temporal ?? ''}</span>{' '}
          <span className="font-semibold">{node.objective}</span>
        </div>
      );
    case 'combination':
      return (
        <div>
          <Label kind="refinement" />
          <span className="text-text-muted">
            {node.children.length} goals, <span className="font-mono">{node.combinator}</span>
          </span>
        </div>
      );
    case 'refined_goal':
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Label kind="goal" />
          <span className="font-medium">{node.objective}</span>
          {node.agent ? (
            <span className="text-text-muted">
              using <span className="font-mono text-xs">{node.agent}</span>
            </span>
          ) : null}
        </div>
      );
    case 'operation': {
      const op = node.operation;
      const tasks = op.tasks?.length ? op.tasks : op.task ? [op.task] : [];
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Label kind="operation" />
            <span className="font-medium">{tasks.join(' & ')}</span>
            {op.condition ? (
              <span className="text-text-muted">
                if <span className="font-mono text-xs">{op.condition}</span>
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
            <span>
              performed by{' '}
              <span className="dsl-performed font-mono">{op.module ?? 'none stated'}</span>
            </span>
            {op.inputs.length ? <span>in: {op.inputs.join(', ')}</span> : null}
            {op.outputs.length ? <span>out: {op.outputs.join(', ')}</span> : null}
          </div>
        </div>
      );
    }
    case 'below_bar':
      return <span className="text-text-muted">{node.label}</span>;
    case 'section':
      return (
        <div>
          <span className="font-medium">{node.label}</span>
          {node.children.length === 0 ? (
            <span className="ml-2 text-text-muted">— {node.emptyText}</span>
          ) : null}
        </div>
      );
    case 'assumption':
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Label kind="assumption" />
          <span className="dsl-assuming font-mono text-xs">{node.text}</span>
          {node.summary ? (
            <AssumptionSummaryText summary={node.summary} />
          ) : (
            <span className="text-xs text-text-faint">not checked in this report</span>
          )}
        </div>
      );
    case 'soft_goal':
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Label kind="soft goal" />
          <span className="dsl-ensuring font-mono text-xs">{node.text}</span>
          {node.summary ? (
            <span className="text-xs text-text-muted">
              {node.summary.kind === 'checked'
                ? `met ${node.summary.met}, missed ${node.summary.missed}${node.summary.not_measured ? `, not measured ${node.summary.not_measured}` : ''}`
                : node.summary.kind === 'rejected'
                  ? `rejected: ${node.summary.message}`
                  : 'free text, not checked automatically'}
            </span>
          ) : null}
        </div>
      );
    case 'obstacle': {
      const o = node.obstacle;
      const entry = draft?.doc.obstacles[o.id];
      return (
        <div className="flex w-full min-w-0 flex-col gap-1 rounded-r-md border border-border border-l-2 border-l-fail bg-surface-raised px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Chip tone="tool">obstacle</Chip>
            <span className="text-lg font-semibold [overflow-wrap:anywhere]">{o.id}</span>
            {o.source === 'candidate' ? <Chip tone="neutral">unnamed candidate</Chip> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ToolVerdictChip verdict={o.verdict} sampling={sampling} />
            {entry ? <StatusChip status={entry.status} hasPrevious={hasPrevious} /> : null}
            {entry ? <span className="num text-xs text-text-muted">{entry.evidence}</span> : null}
          </div>
          {node.unattachedReason ? (
            <p className="text-xs text-text-muted" title={node.unattachedReason}>
              Unattached: nothing in the requirement to attach it to.
            </p>
          ) : null}
          {o.domain_property && !node.unattachedReason ? (
            <p className="text-xs text-text-muted">
              Challenges the domain property {o.domain_property}.
            </p>
          ) : null}
        </div>
      );
    }
  }
}

function AssumptionSummaryText({
  summary,
}: {
  summary: NonNullable<Extract<ModelNode, { kind: 'assumption' }>['summary']>;
}) {
  if (summary.kind === 'free_text')
    return <span className="text-xs text-text-muted">free text, not checked automatically</span>;
  if (summary.kind === 'rejected')
    return <span className="text-xs text-fail">rejected by the tool: {summary.message}</span>;
  return (
    <span className="text-xs text-text-muted">
      held {summary.held}, broken {summary.broken}
      {summary.not_measured ? `, not measured ${summary.not_measured}` : ''}
      {summary.verdict && !STUDY ? ` · tool: ${summary.verdict}` : ''}
      {summary.rate_held !== null && summary.rate_held !== undefined
        ? ` · failure rate held ${displayPercent(summary.rate_held)} / broken ${displayPercent(summary.rate_broken)}`
        : ''}
    </span>
  );
}
