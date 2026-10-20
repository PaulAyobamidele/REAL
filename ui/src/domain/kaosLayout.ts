import type { AnalysisReport, Obstacle, Operation } from '@/services/schemas';
import { STUDY } from '@/study/config';

import { evidenceText } from './decisions';
import { obstacleNodes, type GoalModel, type ModelNode } from './goalModel';
import { bySupport } from './support';

/**
 * The goal model laid out in the KAOS notation of the REAL paper (Figs. 2
 * and 4): functional goals as parallelograms, soft goals dashed, domain
 * properties as the house shape beside the goal they support, operations
 * under their sub-goal, the module performing each one as a hexagon joined
 * by a responsibility link, and obstacles - left-slanted - beside the node
 * the analysis says they obstruct.
 *
 * Everything drawn comes from the parse tree (via the report) or the
 * analysis output. Attachment is the goal model's: `blocks_goal` and
 * `domain_property` looked up by name, never inferred; an obstacle that
 * matches nothing goes to a separate region with the reason. The layout is
 * a fixed top-down scheme for the shallow trees the DSL produces (one goal,
 * sub-goals joined by one combinator, operations beneath). A requirement it
 * cannot place, or a placement in which two boxes would overlap, returns
 * `ok: false` with the reason; the caller shows the tree instead. A diagram
 * with overlapping boxes is never returned.
 */

export type BoxKind =
  'goal' | 'subgoal' | 'operation' | 'agent' | 'domain' | 'soft' | 'obstacle' | 'refinement';

export interface Box {
  id: string;
  kind: BoxKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text lines inside the box, already fitted; `title` holds the full text. */
  lines: string[];
  title: string;
  /** Smaller second-tier text (a module name, an obstacle's verdict). */
  note?: string;
  /** A third line for an obstacle: its counts. */
  detail?: string;
  obstacle?: Obstacle;
  /** For an obstacle: the node it obstructs; for an agent: its operation. */
  target?: string;
  unattached?: { reason: string };
}

export interface LinkPath {
  kind: 'refinement' | 'operationalisation' | 'responsibility' | 'obstacle' | 'domain';
  from: string;
  to: string;
  points: [number, number][];
  /** The segment that ends at the obstructed node: drawn with the obstacle link's crossbar and arrow. */
  arrow?: boolean;
}

export interface KaosLayout {
  ok: true;
  width: number;
  height: number;
  boxes: Box[];
  links: LinkPath[];
  refinement: { x: number; y: number } | null;
  /** The separate region for obstacles with nothing to attach to. */
  region: { x: number; y: number; w: number; h: number } | null;
  captions: { x: number; y: number; text: string; anchor: 'start' | 'end' }[];
}

export type LayoutResult = KaosLayout | { ok: false; reason: string };

// geometry, in SVG user units (1 = 1 px at 100%)
const PAD = 24;
const SLANT = 16;
const GOAL = { w: 280, h: 50 };
const SUB = { w: 240, h: 48 };
const OP = { w: 240 };
const AGENT = { w: 230, h: 44 };
const DOMAIN = { w: 230, h: 30, gap: 8 };
const SOFT = { w: 300, gap: 8 };
const OBST = { w: 260, h: 54, gap: 8 };
const LANE_GAP = 44;
const COL_GAP = 56;
const CHAR = 6.9; // average advance of 12 px Poppins
const MONO = 7.2; // 12 px monospace

/** Up to `maxLines` lines of at most `width` px; the last line ends in "…" when cut. */
export function fitText(text: string, width: number, maxLines = 2, perChar = CHAR): string[] {
  const max = Math.max(4, Math.floor(width / perChar));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > max ? word.slice(0, max - 1) + '…' : word;
    if (lines.length === maxLines) {
      line = '';
      break;
    }
  }
  if (line) lines.push(line);
  if (
    lines.length > maxLines ||
    (lines.length === maxLines && words.join(' ').length > lines.join(' ').length)
  ) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1] ?? '';
    kept[maxLines - 1] = (last.length >= max ? last.slice(0, max - 1) : last) + '…';
    return kept;
  }
  return lines.length ? lines : [''];
}

function tasksOf(op: Operation): string[] {
  if (op.tasks && op.tasks.length) return op.tasks;
  return op.task ? op.task.split('&').map((t) => t.trim()) : [];
}

interface Column {
  goal: Extract<ModelNode, { kind: 'refined_goal' }>;
  ops: Extract<ModelNode, { kind: 'operation' }>[];
}

/** The sub-goal columns, or why the tree is not one this layout holds. */
function columnsOf(model: GoalModel): { columns: Column[]; combinator: string | null } | string {
  if (!model.root || model.limitation) return model.limitation ?? 'the report has no goal tree';
  const kids = model.root.children.filter((c) => c.kind !== 'obstacle' && c.kind !== 'below_bar');
  if (kids.length !== 1) return 'the top goal is not refined into sub-goals';
  const ref = kids[0]!;
  const goals = ref.kind === 'combination' ? ref.children : [ref];
  const columns: Column[] = [];
  for (const g of goals) {
    if (g.kind === 'obstacle' || g.kind === 'below_bar') continue;
    if (g.kind !== 'refined_goal') return 'a sub-goal is refined into further sub-goals';
    const ops = g.children.filter(
      (c): c is Extract<ModelNode, { kind: 'operation' }> => c.kind === 'operation',
    );
    if (g.children.some((c) => c.kind === 'combination' || c.kind === 'refined_goal'))
      return 'a sub-goal is refined into further sub-goals';
    columns.push({ goal: g, ops });
  }
  if (!columns.length) return 'the top goal has no sub-goals';
  return { columns, combinator: ref.kind === 'combination' ? ref.combinator : null };
}

function opLines(op: Operation): { lines: string[]; note: string | null } {
  return {
    lines: fitText(tasksOf(op).join(' & '), OP.w - 24, 2),
    note: op.condition ? fitText(`if ${op.condition}`, OP.w - 24, 1)[0]! : null,
  };
}

const VERDICT_WORDS: Record<string, string> = {
  supported: 'supported',
  not_supported: 'not supported',
  insufficient_data: 'insufficient data',
};

function obstacleBox(
  o: Obstacle,
  x: number,
  y: number,
  w: number,
  h: number,
  status: string | null,
): Box {
  const verdict = `${VERDICT_WORDS[o.verdict] ?? o.verdict}${status ? ` · ${status}` : ''}`;
  // the study build shows the evidence only, not the tool's verdict
  const counts = STUDY ? evidenceText(o) : `${verdict} · ${evidenceText(o)}`;
  return {
    id: `obstacle.${o.id}`,
    kind: 'obstacle',
    x,
    y,
    w,
    h,
    lines: fitText(o.id, w - 2 * SLANT - 8, 1),
    // the study build: no verdict in the box either (brief 4.4)
    note: STUDY
      ? status
        ? fitText(status, w - 2 * SLANT - 4, 1, 6.2)[0]
        : undefined
      : fitText(verdict, w - 2 * SLANT - 4, 1, 6.2)[0],
    detail: fitText(evidenceText(o), w - 2 * SLANT - 4, 1, 6.2)[0],
    title: `${o.id} - ${counts}`,
    obstacle: o,
  };
}

/** Rectangles overlap (with a small margin), for the no-overlap guarantee. */
export function overlaps(a: Box, b: Box, margin = 2): boolean {
  return (
    a.x < b.x + b.w + margin &&
    b.x < a.x + a.w + margin &&
    a.y < b.y + b.h + margin &&
    b.y < a.y + a.h + margin
  );
}

export function layoutKaos(
  model: GoalModel,
  report: Pick<AnalysisReport, 'obstacles'>,
  statusOf: (obstacleId: string) => string | null = () => null,
): LayoutResult {
  // the compact arrangement first (soft goals share the right-hand obstacle
  // column, above its obstacles); the wide one when that would collide
  const compact = place(model, report, statusOf, true);
  return compact.ok ? compact : place(model, report, statusOf, false);
}

function place(
  model: GoalModel,
  report: Pick<AnalysisReport, 'obstacles'>,
  statusOf: (obstacleId: string) => string | null,
  compact: boolean,
): LayoutResult {
  const shape = columnsOf(model);
  if (typeof shape === 'string') return { ok: false, reason: shape };
  const { columns } = shape;

  const assumptions = model.assumptions.children.filter(
    (n): n is Extract<ModelNode, { kind: 'assumption' }> => n.kind === 'assumption',
  );
  const softGoals = model.softGoals.children.filter(
    (n): n is Extract<ModelNode, { kind: 'soft_goal' }> => n.kind === 'soft_goal',
  );

  // obstacles by the drawn node they obstruct
  const obstacles = [...report.obstacles].sort(bySupport);
  const nodeOf = new Map<string, string>(); // model node id -> box id
  nodeOf.set(model.root!.id, 'goal');
  columns.forEach((c, i) => {
    nodeOf.set(c.goal.id, `sub.${i}`);
    c.ops.forEach((op, k) => nodeOf.set(op.id, `op.${i}.${k}`));
  });
  assumptions.forEach((a, i) => nodeOf.set(a.id, `domain.${i}`));
  softGoals.forEach((s, i) => nodeOf.set(s.id, `soft.${i}`));
  const reasons = new Map(obstacleNodes(model).map((n) => [n.obstacle.id, n.unattachedReason]));
  const attachedTo = new Map<string, string>(); // obstacle id -> box id
  const unattached: Obstacle[] = [];
  for (const o of obstacles) {
    const node = model.attachment.get(o.id);
    const box = node ? nodeOf.get(node) : undefined;
    if (box) attachedTo.set(o.id, box);
    else unattached.push(o);
  }
  const obstaclesOn = (box: string) => obstacles.filter((o) => attachedTo.get(o.id) === box);
  const columnObstacles = (i: number) =>
    obstacles.filter((o) => {
      const b = attachedTo.get(o.id);
      return b === `sub.${i}` || Boolean(b?.startsWith(`op.${i}.`));
    });
  const domainObstacles = obstacles.filter((o) => attachedTo.get(o.id)?.startsWith('domain.'));
  const softObstacles = obstacles.filter((o) => attachedTo.get(o.id)?.startsWith('soft.'));
  const goalObstacles = obstaclesOn('goal');

  // ---------------------------------------------------------------- x
  let x = PAD;
  const domainLaneX = domainObstacles.length ? x : null;
  if (domainLaneX !== null) x += OBST.w + LANE_GAP;
  const leftLaneW =
    assumptions.length || (columns[0] && columnObstacles(0).length)
      ? Math.max(assumptions.length ? DOMAIN.w : 0, columnObstacles(0).length ? OBST.w : 0)
      : 0;
  const leftLaneX = x;
  if (leftLaneW) x += leftLaneW + LANE_GAP;
  const mainW = Math.max(SUB.w, OP.w, AGENT.w);
  const colX: number[] = [];
  const rightLaneX: (number | null)[] = [];
  columns.forEach((_, i) => {
    colX.push(x);
    x += mainW;
    if (i > 0 && columnObstacles(i).length) {
      rightLaneX.push(x + LANE_GAP);
      x += LANE_GAP + OBST.w;
    } else rightLaneX.push(null);
    x += COL_GAP;
  });
  x -= COL_GAP;
  const columnsLeft = colX[0]!;
  const columnsRight = x;
  const lastLane = rightLaneX[rightLaneX.length - 1] ?? null;
  const shareLane = compact && lastLane !== null && softGoals.length > 0;
  const softW = shareLane ? OBST.w : SOFT.w;
  const softX = !softGoals.length ? null : shareLane ? lastLane : x + COL_GAP;
  if (softX !== null && !shareLane) x = softX + softW;
  const softLaneX = softObstacles.length ? x + LANE_GAP : null;
  if (softLaneX !== null) x = softLaneX + OBST.w;

  // ---------------------------------------------------------------- y
  const boxes: Box[] = [];
  const links: LinkPath[] = [];
  const captions: KaosLayout['captions'] = [];
  const topY = PAD + 22;
  const goalX = (columnsLeft + columnsRight) / 2 - GOAL.w / 2;
  const root = model.root as Extract<ModelNode, { kind: 'goal' }>;
  boxes.push({
    id: 'goal',
    kind: 'goal',
    x: goalX,
    y: topY,
    w: GOAL.w,
    h: GOAL.h,
    lines: fitText(root.objective, GOAL.w - 2 * SLANT - 12, 1),
    note: root.temporal ?? undefined,
    title: `${root.temporal ?? ''} ${root.objective}`.trim(),
  });
  const ref = { x: goalX + GOAL.w / 2, y: topY + GOAL.h + 40 };

  // domain properties, stacked left, joined by one spine to the refinement node
  let domainBottom = topY;
  if (assumptions.length) {
    captions.push({
      x: leftLaneX,
      y: topY - 8,
      text: 'assuming — domain properties',
      anchor: 'start',
    });
    assumptions.forEach((a, i) => {
      const y = topY + 2 + i * (DOMAIN.h + DOMAIN.gap);
      boxes.push({
        id: `domain.${i}`,
        kind: 'domain',
        x: leftLaneX,
        y,
        w: DOMAIN.w,
        h: DOMAIN.h,
        lines: fitText(a.text, DOMAIN.w - 20, 1, MONO),
        title: a.text,
      });
      domainBottom = y + DOMAIN.h;
    });
    const spineX = leftLaneX + DOMAIN.w + 18;
    const first = topY + 2 + DOMAIN.h / 2;
    const last = domainBottom - DOMAIN.h / 2;
    assumptions.forEach((_, i) => {
      const y = topY + 2 + i * (DOMAIN.h + DOMAIN.gap) + DOMAIN.h / 2;
      links.push({
        kind: 'domain',
        from: `domain.${i}`,
        to: 'refinement',
        points: [
          [leftLaneX + DOMAIN.w, y],
          [spineX, y],
        ],
      });
    });
    links.push({
      kind: 'domain',
      from: 'domain',
      to: 'refinement',
      points: [
        [spineX, Math.min(first, ref.y)],
        [spineX, Math.max(last, ref.y)],
      ],
    });
    links.push({
      kind: 'domain',
      from: 'domain',
      to: 'refinement',
      points: [
        [spineX, ref.y],
        [ref.x - 9, ref.y],
      ],
    });
  }

  // sub-goals, operations, agents
  const row1 = ref.y + 64;
  let mainBottom = row1 + SUB.h;
  const firstOpY: number[] = [];
  columns.forEach((c, i) => {
    const cx = colX[i]! + mainW / 2;
    boxes.push({
      id: `sub.${i}`,
      kind: 'subgoal',
      x: cx - SUB.w / 2,
      y: row1,
      w: SUB.w,
      h: SUB.h,
      lines: fitText(c.goal.objective, SUB.w - 2 * SLANT - 10, 1),
      note: c.goal.agent ? `using ${c.goal.agent}` : undefined,
      title: `${c.goal.objective}${c.goal.agent ? ` using ${c.goal.agent}` : ''}`,
    });
    links.push({
      kind: 'refinement',
      from: 'refinement',
      to: `sub.${i}`,
      points: [
        [ref.x, ref.y + 8],
        [cx, row1],
      ],
    });
    let y = row1 + SUB.h + 44;
    let above = `sub.${i}`;
    let aboveBottom = row1 + SUB.h;
    c.ops.forEach((op, k) => {
      const { lines, note } = opLines(op.operation);
      const h = 20 + lines.length * 15 + (note ? 15 : 0);
      if (k === 0) firstOpY.push(y);
      boxes.push({
        id: `op.${i}.${k}`,
        kind: 'operation',
        x: cx - OP.w / 2,
        y,
        w: OP.w,
        h,
        lines,
        note: note ?? undefined,
        title: `${tasksOf(op.operation).join(' & ')}${op.operation.condition ? ` if ${op.operation.condition}` : ''}`,
      });
      links.push({
        kind: 'operationalisation',
        from: above,
        to: `op.${i}.${k}`,
        points: [
          [cx, aboveBottom],
          [cx, y],
        ],
      });
      const agentY = y + h + 48;
      const module = op.operation.module ?? 'no module stated';
      boxes.push({
        id: `agent.${i}.${k}`,
        kind: 'agent',
        x: cx - AGENT.w / 2,
        y: agentY,
        w: AGENT.w,
        h: AGENT.h,
        lines: fitText(c.goal.agent ?? 'agent', AGENT.w - 40, 1),
        note: fitText(module, AGENT.w - 40, 1, MONO)[0],
        title: `${c.goal.agent ?? 'agent'}: performed by ${module}`,
        target: `op.${i}.${k}`,
      });
      links.push({
        kind: 'responsibility',
        from: `op.${i}.${k}`,
        to: `agent.${i}.${k}`,
        points: [
          [cx, y + h],
          [cx, agentY],
        ],
      });
      above = `agent.${i}.${k}`;
      aboveBottom = agentY + AGENT.h;
      y = agentY + AGENT.h + 40;
      mainBottom = Math.max(mainBottom, agentY + AGENT.h);
    });
    if (!c.ops.length) firstOpY.push(row1 + SUB.h + 44);
  });
  const opRowY = Math.min(...firstOpY);

  // soft goals, stacked right of the columns, each joined to the refinement node
  if (softX !== null) {
    captions.push({
      x: softX + softW,
      y: ref.y + 4,
      text: 'ensuring — soft goals',
      anchor: 'end',
    });
    let y = ref.y + 14;
    softGoals.forEach((s, i) => {
      const lines = fitText(s.text, softW - 2 * SLANT - 16, 2, MONO);
      const h = 18 + lines.length * 15;
      boxes.push({
        id: `soft.${i}`,
        kind: 'soft',
        x: softX,
        y,
        w: softW,
        h,
        lines,
        title: s.text,
      });
      links.push({
        kind: 'refinement',
        from: 'refinement',
        to: `soft.${i}`,
        points: [
          [ref.x + 8, ref.y],
          [softX + SLANT / 2, y + h / 2],
        ],
      });
      y += h + SOFT.gap;
      mainBottom = Math.max(mainBottom, y);
    });
  }

  // obstacle stacks: column 0 on the left lane (below the domain properties), others on their right
  const stack = (
    list: Obstacle[],
    laneX: number,
    startY: number,
    side: 'left' | 'right',
  ): number => {
    let y = startY;
    const byTarget = new Map<string, { ids: string[]; ys: number[] }>();
    for (const o of list) {
      boxes.push({
        ...obstacleBox(o, laneX, y, OBST.w, OBST.h, statusOf(o.id)),
        target: attachedTo.get(o.id),
      });
      const t = attachedTo.get(o.id)!;
      if (!byTarget.has(t)) byTarget.set(t, { ids: [], ys: [] });
      byTarget.get(t)!.ids.push(o.id);
      byTarget.get(t)!.ys.push(y + OBST.h / 2);
      y += OBST.h + OBST.gap;
    }
    let k = 0;
    for (const [target, { ids, ys }] of byTarget) {
      // one spine per target, side by side, so two targets' links never share a line
      const spineX = side === 'left' ? laneX + OBST.w + 14 + 8 * k : laneX - 14 - 8 * k;
      k += 1;
      const tb = boxes.find((b) => b.id === target)!;
      const ty = tb.y + tb.h / 2;
      const tx =
        side === 'left'
          ? tb.x + (tb.kind === 'subgoal' ? SLANT / 2 : 0)
          : tb.x + tb.w - (tb.kind === 'subgoal' ? SLANT / 2 : 0);
      ys.forEach((oy, n) => {
        links.push({
          kind: 'obstacle',
          from: `obstacle.${ids[n]}`,
          to: target,
          points: [
            [side === 'left' ? laneX + OBST.w - SLANT / 2 : laneX + SLANT / 2, oy],
            [spineX, oy],
          ],
        });
      });
      const lo = Math.min(...ys, ty);
      const hi = Math.max(...ys, ty);
      links.push({
        kind: 'obstacle',
        from: `spine.${target}`,
        to: target,
        points: [
          [spineX, lo],
          [spineX, hi],
        ],
      });
      links.push({
        kind: 'obstacle',
        from: `spine.${target}`,
        to: target,
        points: [
          [spineX, ty],
          [tx, ty],
        ],
        arrow: true,
      });
    }
    return y;
  };
  columns.forEach((_, i) => {
    const list = columnObstacles(i);
    if (!list.length) return;
    if (i === 0) {
      const start = Math.max(opRowY - 6, assumptions.length ? domainBottom + 24 : 0);
      mainBottom = Math.max(mainBottom, stack(list, leftLaneX, start, 'left'));
    } else {
      mainBottom = Math.max(mainBottom, stack(list, rightLaneX[i]!, opRowY - 6, 'right'));
    }
  });
  if (domainObstacles.length && domainLaneX !== null)
    mainBottom = Math.max(mainBottom, stack(domainObstacles, domainLaneX, topY + 2, 'left'));
  if (softObstacles.length && softLaneX !== null)
    mainBottom = Math.max(mainBottom, stack(softObstacles, softLaneX, ref.y + 14, 'right'));
  if (goalObstacles.length) {
    // beside the top goal, on its right
    mainBottom = Math.max(
      mainBottom,
      stack(goalObstacles, goalX + GOAL.w + LANE_GAP, topY, 'right'),
    );
    x = Math.max(x, goalX + GOAL.w + LANE_GAP + OBST.w);
  }

  // the region for obstacles with nothing in the requirement to attach to
  let region: KaosLayout['region'] = null;
  let height = mainBottom + PAD;
  const width = x + PAD;
  if (unattached.length) {
    const ry = mainBottom + 40;
    const itemH = 66;
    const h = 64 + unattached.length * (itemH + 14) + 8;
    region = { x: PAD, y: ry, w: width - 2 * PAD, h };
    unattached.forEach((o, i) => {
      const box = obstacleBox(o, PAD + 24, ry + 64 + i * (itemH + 14), 420, itemH, statusOf(o.id));
      box.unattached = {
        reason: reasons.get(o.id) ?? 'it obstructs nothing this requirement states',
      };
      boxes.push(box);
    });
    height = ry + h + PAD;
  }

  // the guarantee: no two boxes overlap
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (overlaps(boxes[i]!, boxes[j]!))
        return { ok: false, reason: `${boxes[i]!.title} and ${boxes[j]!.title} would overlap` };

  return { ok: true, width, height, boxes, links, refinement: ref, region, captions };
}
