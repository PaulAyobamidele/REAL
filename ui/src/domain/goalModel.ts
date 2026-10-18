import type {
  AnalysisReport,
  AssumptionSummary,
  GoalTree,
  Obstacle,
  Operation,
  Refinement,
  SoftGoalSummary,
} from '@/services/schemas';

import { belowBarWords, bySupport, isSupported } from './support';

import { STUDY } from '@/study/config';

/**
 * The goal model shown on "Failure Analysis": the requirement's goal tree (from
 * the report, parsed once in Python) with each obstacle attached to the node
 * it obstructs. Attachment is a name lookup on `blocks_goal` and
 * `domain_property`, never an inference; what matches nothing is listed as
 * unattached with the reason, because hiding it would hide a gap in the
 * requirement.
 */

export type ModelNode =
  | { kind: 'goal'; id: string; temporal: string | null; objective: string; children: ModelNode[] }
  | { kind: 'combination'; id: string; combinator: string; children: ModelNode[] }
  | {
      kind: 'refined_goal';
      id: string;
      objective: string;
      agent: string | null;
      children: ModelNode[];
    }
  | { kind: 'operation'; id: string; operation: Operation; children: ModelNode[] }
  | { kind: 'section'; id: string; label: string; emptyText: string; children: ModelNode[] }
  | {
      kind: 'assumption';
      id: string;
      text: string;
      summary: AssumptionSummary | null;
      children: ModelNode[];
    }
  | {
      kind: 'soft_goal';
      id: string;
      text: string;
      summary: SoftGoalSummary | null;
      children: ModelNode[];
    }
  | {
      kind: 'obstacle';
      id: string;
      obstacle: Obstacle;
      attachedTo: string | null;
      unattachedReason: string | null;
      children: ModelNode[];
    }
  /** The obstacles of one node that are not supported, folded into one line (closed at first). */
  | { kind: 'below_bar'; id: string; label: string; children: ModelNode[] };

export type ObstacleNode = Extract<ModelNode, { kind: 'obstacle' }>;
export type BelowBarNode = Extract<ModelNode, { kind: 'below_bar' }>;

export interface GoalModel {
  root: ModelNode | null;
  assumptions: ModelNode;
  softGoals: ModelNode;
  unattached: ModelNode;
  /** Obstacle id -> node id of what it obstructs, or null. */
  attachment: Map<string, string | null>;
  /** Why the model is partial, if it is (e.g. the report predates the goal tree). */
  limitation: string | null;
}

function operationNode(op: Operation, id: string): ModelNode {
  return { kind: 'operation', id, operation: op, children: [] };
}

function refinementNode(ref: Refinement, id: string): ModelNode {
  if ('goals' in ref) {
    return {
      kind: 'combination',
      id,
      combinator: ref.combinator,
      children: ref.goals.map((g, i) => refinementNode(g, `${id}.${i}`)),
    };
  }
  return {
    kind: 'refined_goal',
    id,
    objective: ref.objective ?? '(unnamed goal)',
    agent: ref.agent,
    children: ref.operations.map((op, i) => operationNode(op, `${id}.op${i}`)),
  };
}

function tasksOf(op: Operation): string[] {
  if (op.tasks && op.tasks.length) return op.tasks;
  return op.task ? op.task.split('&').map((t) => t.trim()) : [];
}

function walk(node: ModelNode, visit: (n: ModelNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

/**
 * What the goal model is built from: an analysis report, or - while a
 * requirement is being written - the parser's tree with no results yet.
 */
export type GoalModelSource = Pick<AnalysisReport, 'requirement' | 'obstacles'> & {
  soft_goals?: AnalysisReport['soft_goals'];
  admissibility: { assumptions?: AnalysisReport['admissibility']['assumptions'] };
};

/** Build the goal model for a report. Works on reports without a tree, degraded and labelled. */
export function buildGoalModel(report: GoalModelSource): GoalModel {
  const req = report.requirement;
  const tree: GoalTree | null | undefined = req.tree;
  let root: ModelNode | null = null;
  let limitation: string | null = null;

  if (tree) {
    root = {
      kind: 'goal',
      id: 'goal',
      temporal: tree.temporal,
      objective: tree.objective ?? '(unnamed goal)',
      children: tree.refinement ? [refinementNode(tree.refinement, 'goal.r')] : [],
    };
  } else if (req.parsed === false) {
    limitation = req.error
      ? `the requirement did not parse (${req.error}); no goal tree`
      : 'the requirement did not parse; no goal tree';
  } else {
    limitation =
      'this analysis report predates the goal tree export (schema version 1): only the operations are listed; re-run the analysis for the full goal model';
    root = {
      kind: 'goal',
      id: 'goal',
      temporal: null,
      objective: '(top goal not in this report)',
      children: (req.operations ?? []).map((op, i) => operationNode(op, `goal.op${i}`)),
    };
  }

  const assumptionSummaries = new Map(
    (report.admissibility.assumptions ?? []).map((a) => [a.text, a]),
  );
  const assumptionTexts = tree?.assumptions ?? req.assumptions ?? [];
  const assumptions: ModelNode = {
    kind: 'section',
    id: 'assumptions',
    label: 'Domain assumptions (assuming)',
    emptyText: 'none stated',
    children: assumptionTexts.map((text, i) => ({
      kind: 'assumption',
      id: `assumption.${i}`,
      text,
      summary: assumptionSummaries.get(text) ?? null,
      children: [],
    })),
  };

  const softGoalSummaries = new Map((report.soft_goals ?? []).map((g) => [g.text, g]));
  const softGoalTexts = tree?.soft_goals ?? req.soft_goals ?? [];
  const softGoals: ModelNode = {
    kind: 'section',
    id: 'soft_goals',
    label: 'Soft goals (ensuring)',
    emptyText: 'none stated',
    children: softGoalTexts.map((text, i) => ({
      kind: 'soft_goal',
      id: `soft_goal.${i}`,
      text,
      summary: softGoalSummaries.get(text) ?? null,
      children: [],
    })),
  };

  // index the attachable nodes by name
  const byTask = new Map<string, ModelNode>();
  const byObjective = new Map<string, ModelNode>();
  if (root) {
    walk(root, (n) => {
      if (n.kind === 'operation')
        for (const t of tasksOf(n.operation)) if (!byTask.has(t)) byTask.set(t, n);
      if (n.kind === 'goal' || n.kind === 'refined_goal')
        if (!byObjective.has(n.objective)) byObjective.set(n.objective, n);
    });
  }
  const byAssumption = new Map(
    assumptions.children.map((n) => [(n as Extract<ModelNode, { kind: 'assumption' }>).text, n]),
  );
  const bySoftGoal = new Map(
    softGoals.children.map((n) => [(n as Extract<ModelNode, { kind: 'soft_goal' }>).text, n]),
  );

  const unattached: ModelNode = {
    kind: 'section',
    id: 'unattached',
    label: 'Obstacles not attached to any node',
    emptyText: 'every obstacle attaches to a goal, assumption or soft goal',
    children: [],
  };
  const attachment = new Map<string, string | null>();

  for (const o of report.obstacles) {
    const target =
      byTask.get(o.blocks_goal) ??
      byObjective.get(o.blocks_goal) ??
      bySoftGoal.get(o.blocks_goal) ??
      (o.domain_property ? byAssumption.get(o.domain_property) : undefined) ??
      null;
    const node: ObstacleNode = {
      kind: 'obstacle',
      id: `obstacle.${o.id}`,
      obstacle: o,
      attachedTo: target?.id ?? null,
      unattachedReason: target
        ? null
        : unattachedReason(o, {
            hasTree: Boolean(tree),
            softGoals: softGoalTexts,
            assumptions: assumptionTexts,
          }),
      children: [],
    };
    attachment.set(o.id, target?.id ?? null);
    if (target) target.children.push(node);
    else unattached.children.push(node);
  }

  for (const n of [root, assumptions, softGoals, unattached]) if (n) walk(n, foldBelowBar);

  return { root, assumptions, softGoals, unattached, attachment, limitation };
}

/**
 * A node's obstacles in support order, the supported ones in the open and
 * the rest in one `below_bar` line after them: what matters is on top,
 * nothing is dropped.
 */
function foldBelowBar(node: ModelNode): void {
  if (node.kind === 'below_bar') return;
  const obstacles = node.children.filter((c): c is ObstacleNode => c.kind === 'obstacle');
  if (!obstacles.length) return;
  const rest = node.children.filter((c) => c.kind !== 'obstacle');
  if (STUDY) {
    // the study build: every obstacle open, A to Z - the order must not say which the tool supports
    node.children = [
      ...rest,
      ...[...obstacles].sort((a, b) => a.obstacle.id.localeCompare(b.obstacle.id)),
    ];
    return;
  }
  const sorted = [...obstacles].sort((a, b) => bySupport(a.obstacle, b.obstacle));
  const above = sorted.filter((o) => isSupported(o.obstacle));
  const below = sorted.filter((o) => !isSupported(o.obstacle));
  node.children = [
    ...rest,
    ...above,
    ...(below.length
      ? [
          {
            kind: 'below_bar' as const,
            id: `${node.id}.below_bar`,
            label: belowBarWords(below.map((o) => o.obstacle)),
            children: below,
          },
        ]
      : []),
  ];
}

function unattachedReason(
  o: Obstacle,
  ctx: { hasTree: boolean; softGoals: string[]; assumptions: string[] },
): string {
  const parts: string[] = [];
  if (!ctx.hasTree) parts.push('the goal tree is not in this report');
  parts.push(
    o.outcome
      ? `the requirement states no soft goal named "${o.blocks_goal}"${ctx.softGoals.length ? ` (it states: ${ctx.softGoals.map((s) => `"${s}"`).join(', ')})` : ' (it states none)'}`
      : `no goal or operation named "${o.blocks_goal}" in the requirement`,
  );
  if (o.domain_property) {
    parts.push(
      `the domain property it challenges, "${o.domain_property}", is not stated as an assumption${ctx.assumptions.length ? '' : ' (the requirement states none)'}`,
    );
  }
  return parts.join('; ');
}

/** All obstacle nodes of a model, in tree order followed by the unattached ones. */
export function obstacleNodes(model: GoalModel): ObstacleNode[] {
  const out: ObstacleNode[] = [];
  const collect = (n: ModelNode) => {
    if (n.kind === 'obstacle') out.push(n);
  };
  if (model.root) walk(model.root, collect);
  walk(model.assumptions, collect);
  walk(model.softGoals, collect);
  walk(model.unattached, collect);
  return out;
}

/** Every node in the model, depth-first, for keyboard navigation. */
export function flattenModel(model: GoalModel, expanded: ReadonlySet<string>): ModelNode[] {
  const out: ModelNode[] = [];
  const visit = (n: ModelNode) => {
    out.push(n);
    if (expanded.has(n.id)) for (const child of n.children) visit(child);
  };
  if (model.root) visit(model.root);
  visit(model.assumptions);
  visit(model.softGoals);
  visit(model.unattached);
  return out;
}

/** What a tree shows open at first: everything but the below-the-bar lines. */
export function initiallyExpanded(model: GoalModel): Set<string> {
  return new Set(allNodeIds(model).filter((id) => !id.endsWith('.below_bar')));
}

/** The below-the-bar line holding an obstacle, if it is folded into one. */
export function belowBarOf(model: GoalModel, obstacleId: string): string | null {
  let found: string | null = null;
  const look = (n: ModelNode) => {
    if (
      n.kind === 'below_bar' &&
      n.children.some((c) => c.kind === 'obstacle' && c.obstacle.id === obstacleId)
    )
      found = n.id;
  };
  if (model.root) walk(model.root, look);
  walk(model.assumptions, look);
  walk(model.softGoals, look);
  walk(model.unattached, look);
  return found;
}

export function allNodeIds(model: GoalModel): string[] {
  const ids: string[] = [];
  const collect = (n: ModelNode) => ids.push(n.id);
  if (model.root) walk(model.root, collect);
  walk(model.assumptions, collect);
  walk(model.softGoals, collect);
  walk(model.unattached, collect);
  return ids;
}
