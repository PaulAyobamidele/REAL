import { useMemo, type KeyboardEvent, type ReactNode } from 'react';

import { fitText, type Box, type KaosLayout, type LinkPath } from '@/domain/kaosLayout';
import { cx } from '@/utils/format';
import { STUDY } from '@/study/config';

/**
 * The goal model drawn in the KAOS notation of the REAL paper, from a
 * layout computed by `layoutKaos` (which never returns overlapping boxes).
 * Clicking an obstacle selects it - the same selection the tree and the
 * evidence panel use - and dims everything outside its chain: the
 * obstacle, the node it obstructs, and the module responsible for that
 * node. That dimming is the only motion, and only when the reader allows
 * motion.
 */
const SLANT = 16;

function goalPoints(b: Box, slant = SLANT): string {
  return `${b.x + slant},${b.y} ${b.x + b.w},${b.y} ${b.x + b.w - slant},${b.y + b.h} ${b.x},${b.y + b.h}`;
}

function obstaclePoints(b: Box, slant = 14): string {
  return `${b.x},${b.y} ${b.x + b.w - slant},${b.y} ${b.x + b.w},${b.y + b.h} ${b.x + slant},${b.y + b.h}`;
}

function housePoints(b: Box, roof = 9): string {
  return `${b.x},${b.y + roof} ${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + roof} ${b.x + b.w},${b.y + b.h} ${b.x},${b.y + b.h}`;
}

function hexPoints(b: Box, s = 16): string {
  const cy = b.y + b.h / 2;
  return `${b.x},${cy} ${b.x + s},${b.y} ${b.x + b.w - s},${b.y} ${b.x + b.w},${cy} ${b.x + b.w - s},${b.y + b.h} ${b.x + s},${b.y + b.h}`;
}

const OBSTACLE_TONE: Record<string, { shape: string; name: string; note: string }> = {
  supported: {
    shape: 'fill-kaos-obstacle stroke-kaos-obstacle-line [stroke-width:2]',
    name: 'fill-text font-bold',
    note: 'fill-text',
  },
  insufficient_data: {
    shape: 'fill-caution-soft stroke-caution [stroke-dasharray:5_3] [stroke-width:1.4]',
    name: 'fill-caution font-semibold',
    note: 'fill-text-muted',
  },
  not_supported: {
    shape: 'fill-set-aside-soft stroke-border-strong',
    name: 'fill-text-muted font-semibold',
    note: 'fill-text-faint',
  },
};

/** The boxes and links that stay bright when an obstacle is selected. */
function chainOf(layout: KaosLayout, obstacleBoxId: string): Set<string> {
  const keep = new Set<string>([obstacleBoxId]);
  const ob = layout.boxes.find((b) => b.id === obstacleBoxId);
  const target = ob?.target;
  if (target) {
    keep.add(target);
    if (target.startsWith('op.')) keep.add(target.replace(/^op\./, 'agent.'));
    if (target.startsWith('sub.')) {
      const col = target.slice('sub.'.length);
      for (const b of layout.boxes)
        if (b.id.startsWith(`op.${col}.`) || b.id.startsWith(`agent.${col}.`)) keep.add(b.id);
    }
  }
  return keep;
}

function linkLit(link: LinkPath, chain: Set<string>, obstacleBoxId: string | null): boolean {
  // an obstacle's own segment, and the shared spine into the node it obstructs
  if (link.kind === 'obstacle')
    return link.from === obstacleBoxId || (link.from.startsWith('spine.') && chain.has(link.to));
  return chain.has(link.from) && chain.has(link.to);
}

export function KaosDiagram({
  layout,
  selectedObstacleId,
  onSelectObstacle,
  fit = false,
  withObstacles = true,
  highlight = null,
  tones = null,
  fill = false,
}: {
  layout: KaosLayout;
  selectedObstacleId: string | null;
  onSelectObstacle: (id: string | null) => void;
  /** Scale down to the container's width instead of scrolling (the authoring preview). */
  fit?: boolean;
  /** Whether the legend lists obstacles (none while a requirement is being written). */
  withObstacles?: boolean;
  /** Boxes to mark (id prefixes, e.g. "domain" or "op.0.1"): the part of the text being pointed at. */
  highlight?: readonly string[] | null;
  /** Boxes to colour by their test result: failed (red) or broken (amber), by box id. */
  tones?: Readonly<Record<string, 'fail' | 'caution'>> | null;
  /** Fill the container's height: the diagram centred, the legend at the bottom. */
  fill?: boolean;
}) {
  const selectedBox = selectedObstacleId ? `obstacle.${selectedObstacleId}` : null;
  const chain = useMemo(
    () => (selectedBox ? chainOf(layout, selectedBox) : null),
    [layout, selectedBox],
  );
  const marked = highlight?.length
    ? (id: string) => highlight.some((p) => id === p || id.startsWith(`${p}.`))
    : null;
  const dim = (id: string) =>
    (chain !== null && !chain.has(id)) || (marked !== null && !marked(id));
  const toggle = (id: string) => onSelectObstacle(selectedObstacleId === id ? null : id);
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(id);
    }
  };
  const fade = 'transition-opacity motion-safe:duration-base motion-reduce:transition-none';

  return (
    <div className={cx('flex flex-col gap-2', fill && 'h-full')}>
      <div
        className={cx(
          'overflow-x-auto rounded-lg bg-surface-raised',
          fill && 'flex flex-1 flex-col justify-center',
        )}
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          // natural size where it fits, down to 80 % before it scrolls sideways
          style={{
            width: '100%',
            maxWidth: layout.width,
            minWidth: fit ? undefined : layout.width * 0.8,
            height: 'auto',
          }}
          role="img"
          aria-label="The requirement as a KAOS goal model, with the obstacles the analysis found"
          className="block max-w-none select-none"
        >
          {layout.region ? (
            <g>
              <rect
                x={layout.region.x}
                y={layout.region.y}
                width={layout.region.w}
                height={layout.region.h}
                rx={16}
                className="fill-fail-soft/40 stroke-fail/40 [stroke-dasharray:6_5]"
              />
              <text
                x={layout.region.x + 24}
                y={layout.region.y + 30}
                className="fill-text text-[14px] font-semibold"
              >
                Nothing in the requirement to attach these to
              </text>
              <text
                x={layout.region.x + 24}
                y={layout.region.y + 48}
                className="fill-text-muted text-[11px]"
              >
                The analysis names what each obstacle obstructs; the requirement states none of it,
                so there is no node to draw a link to.
              </text>
            </g>
          ) : null}

          {layout.captions.map((c) => (
            <text
              key={c.text}
              x={c.x}
              y={c.y}
              textAnchor={c.anchor}
              className="fill-text-faint text-[10.5px] tracking-wide"
            >
              {c.text}
            </text>
          ))}

          {layout.links.map((l, i) => {
            const lit =
              (chain === null || linkLit(l, chain, selectedBox)) &&
              (marked === null || marked(l.from) || marked(l.to));
            const d = l.points.map(([x, y], k) => `${k ? 'L' : 'M'}${x},${y}`).join(' ');
            const last = l.points[l.points.length - 1]!;
            const prev = l.points[l.points.length - 2]!;
            const isArrow = Boolean(l.arrow);
            return (
              <g key={i} className={cx(fade, !lit && 'opacity-15')}>
                <path
                  d={d}
                  fill="none"
                  className={
                    l.kind === 'obstacle'
                      ? 'stroke-kaos-obstacle-line [stroke-width:1.4]'
                      : 'stroke-text-muted [stroke-width:1.1]'
                  }
                />
                {l.kind === 'responsibility' ? (
                  <circle
                    cx={(l.points[0]![0] + last[0]) / 2}
                    cy={(l.points[0]![1] + last[1]) / 2}
                    r={6}
                    className="fill-surface-raised stroke-text-muted"
                  />
                ) : null}
                {isArrow ? <ObstacleArrow from={prev} to={last} /> : null}
              </g>
            );
          })}

          {layout.refinement ? (
            <g className={cx(fade, dim('goal') && 'opacity-30')}>
              <line
                x1={layout.refinement.x}
                y1={layout.refinement.y - 8}
                x2={layout.refinement.x}
                y2={layout.refinement.y - 30}
                className="stroke-kaos-ref-line"
              />
              <polygon
                points={`${layout.refinement.x},${layout.refinement.y - 40} ${layout.refinement.x - 7},${layout.refinement.y - 27} ${layout.refinement.x + 7},${layout.refinement.y - 27}`}
                className="fill-kaos-ref stroke-kaos-ref-line"
              />
              <circle
                cx={layout.refinement.x}
                cy={layout.refinement.y}
                r={8}
                className="fill-kaos-ref stroke-kaos-ref-line"
              />
            </g>
          ) : null}

          {layout.boxes.map((b) => {
            if (b.kind === 'obstacle') {
              const o = b.obstacle!;
              // the study build styles every obstacle alike: no verdict in the colour
              const tone = STUDY
                ? OBSTACLE_TONE.supported!
                : (OBSTACLE_TONE[o.verdict] ?? OBSTACLE_TONE.not_supported!);
              const selected = o.id === selectedObstacleId;
              const cxText = b.x + b.w / 2;
              return (
                <g
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`Obstacle ${b.title}`}
                  onClick={() => toggle(o.id)}
                  onKeyDown={(e) => onKey(e, o.id)}
                  className={cx(
                    fade,
                    'cursor-pointer outline-none focus-visible:[&>polygon]:stroke-human',
                    dim(b.id) && 'opacity-25',
                  )}
                >
                  <title>{b.title}</title>
                  <polygon
                    points={obstaclePoints(b)}
                    className={cx(tone.shape, selected && '[stroke-width:3]')}
                  />
                  <text
                    x={cxText}
                    y={b.y + (b.unattached ? 22 : 18)}
                    textAnchor="middle"
                    className={cx('text-[12.5px]', tone.name)}
                  >
                    {b.lines[0]}
                  </text>
                  <text
                    x={cxText}
                    y={b.y + (b.unattached ? 40 : 33)}
                    textAnchor="middle"
                    className={cx('text-[10.5px]', tone.note)}
                  >
                    {b.note}
                  </text>
                  {b.detail ? (
                    <text
                      x={cxText}
                      y={b.y + (b.unattached ? 56 : 47)}
                      textAnchor="middle"
                      className={cx('text-[10.5px]', tone.note)}
                    >
                      {b.detail}
                    </text>
                  ) : null}
                  {b.unattached
                    ? fitText(b.unattached.reason, Math.max(320, layoutWidthLeft(b)), 3, 6.4).map(
                        (line, k) => (
                          <text
                            key={k}
                            x={b.x + b.w + 28}
                            y={b.y + 18 + k * 16}
                            className="fill-text-muted text-[11.5px]"
                          >
                            {line}
                          </text>
                        ),
                      )
                    : null}
                </g>
              );
            }
            return (
              <g
                key={b.id}
                className={cx(
                  fade,
                  dim(b.id) && 'opacity-25',
                  tones?.[b.id] && `kaos-${tones[b.id]}`,
                  marked?.(b.id) && 'kaos-marked',
                )}
              >
                <title>{b.title}</title>
                <BoxShape b={b} />
                <BoxText b={b} />
              </g>
            );
          })}
        </svg>
      </div>
      <Legend withObstacles={withObstacles} withResults={Boolean(tones)} />
    </div>
  );

  function layoutWidthLeft(b: Box): number {
    return layout.width - (b.x + b.w + 28) - 40;
  }
}

function ObstacleArrow({ from, to }: { from: [number, number]; to: [number, number] }) {
  const dir = Math.sign(to[0] - from[0]) || 1;
  const [x, y] = to;
  const mid = (from[0] + to[0]) / 2;
  return (
    <g>
      <line
        x1={mid}
        y1={y - 6}
        x2={mid}
        y2={y + 6}
        className="stroke-kaos-obstacle-line [stroke-width:1.4]"
      />
      <polygon
        points={`${x},${y} ${x - 9 * dir},${y - 4.5} ${x - 9 * dir},${y + 4.5}`}
        className="fill-kaos-obstacle-line"
      />
    </g>
  );
}

function BoxShape({ b }: { b: Box }) {
  switch (b.kind) {
    case 'goal':
    case 'subgoal':
      return (
        <polygon
          points={goalPoints(b)}
          className="fill-kaos-goal stroke-kaos-goal-line [stroke-width:1.2]"
        />
      );
    case 'soft':
      return (
        <polygon
          points={goalPoints(b)}
          className="fill-kaos-goal stroke-kaos-soft-line [stroke-dasharray:6_4] [stroke-width:1.6]"
        />
      );
    case 'domain':
      return (
        <polygon
          points={housePoints(b)}
          className="fill-kaos-domain stroke-kaos-domain-line [stroke-width:1.2]"
        />
      );
    case 'agent':
      return (
        <polygon
          points={hexPoints(b)}
          className="fill-kaos-agent stroke-kaos-agent-line [stroke-width:1.2]"
        />
      );
    case 'operation':
      return (
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={Math.min(18, b.h / 2)}
          className="fill-surface-raised stroke-text-faint [stroke-width:1.2]"
        />
      );
    default:
      return null;
  }
}

function BoxText({ b }: { b: Box }) {
  const cxText = b.x + b.w / 2;
  const mono = b.kind === 'domain' || b.kind === 'soft';
  const lineH = 15;
  if (b.kind === 'goal') {
    return (
      <>
        {b.note ? (
          <text
            x={cxText}
            y={b.y + 19}
            textAnchor="middle"
            className="fill-text-muted text-[10px] tracking-widest"
          >
            {b.note}
          </text>
        ) : null}
        <text
          x={cxText}
          y={b.y + 36}
          textAnchor="middle"
          className="fill-text text-[13.5px] font-semibold"
        >
          {b.lines[0]}
        </text>
      </>
    );
  }
  if (b.kind === 'subgoal' || b.kind === 'agent') {
    return (
      <>
        <text
          x={cxText}
          y={b.y + 19}
          textAnchor="middle"
          className={cx(
            'fill-text',
            b.kind === 'subgoal' ? 'text-[13px] font-semibold' : 'text-[12px]',
          )}
        >
          {b.lines[0]}
        </text>
        {b.note ? (
          <text
            x={cxText}
            y={b.y + 34}
            textAnchor="middle"
            className={cx(
              'text-[10.5px]',
              b.kind === 'agent' ? 'fill-text font-mono' : 'fill-text-muted',
            )}
          >
            {b.note}
          </text>
        ) : null}
      </>
    );
  }
  const total = b.lines.length + (b.note ? 1 : 0);
  const top = b.y + b.h / 2 - ((total - 1) * lineH) / 2 + 4;
  return (
    <>
      {b.lines.map((line, k) => (
        <text
          key={k}
          x={cxText}
          y={top + k * lineH}
          textAnchor="middle"
          className={cx(
            'text-[12px]',
            mono ? 'font-mono text-[11px]' : '',
            b.kind === 'domain' ? 'fill-text' : 'fill-text',
          )}
        >
          {line}
        </text>
      ))}
      {b.note ? (
        <text
          x={cxText}
          y={top + b.lines.length * lineH}
          textAnchor="middle"
          className="fill-text-muted text-[10.5px]"
        >
          {b.note}
        </text>
      ) : null}
    </>
  );
}

/**
 * What every shape means, always under the diagram: the shape, its name, what
 * it stands for, and the REAL-DSL words that write it.
 */
function Legend({
  withObstacles,
  withResults = false,
}: {
  withObstacles: boolean;
  withResults?: boolean;
}) {
  const item = (shape: ReactNode, name: string, meaning: string, dsl?: string) => (
    <li className="flex items-start gap-2.5">
      <svg viewBox="0 0 30 18" className="mt-0.5 h-[18px] w-[30px] shrink-0" aria-hidden="true">
        {shape}
      </svg>
      <span>
        <strong className="font-semibold text-text">{name}</strong>: {meaning}
        {dsl ? (
          <>
            {' '}
            <code className="rounded bg-surface-sunken px-1 font-mono text-[11px] text-text">
              {dsl}
            </code>
          </>
        ) : null}
      </span>
    </li>
  );
  return (
    <section
      className="rounded-lg border border-border bg-surface-sunken px-4 py-3"
      aria-label="Legend"
    >
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-text uppercase">Legend</h3>
      <ul className="grid gap-x-6 gap-y-2 text-xs leading-5 text-text-muted sm:grid-cols-2">
        {item(
          <polygon points="7,2 29,2 23,16 1,16" className="fill-kaos-goal stroke-kaos-goal-line" />,
          'Goal',
          'what the system must keep true or reach; sub-goals are its parts',
          'MAINTAIN / ACHIEVE, by',
        )}
        {item(
          <>
            <line x1="15" y1="2" x2="15" y2="9" className="stroke-kaos-ref-line" />
            <circle cx="15" cy="12" r="5" className="fill-kaos-ref stroke-kaos-ref-line" />
          </>,
          'Refinement',
          'the sub-goals under it, together, meet the goal above',
          'followed by / parallely',
        )}
        {item(
          <rect
            x="1"
            y="3"
            width="28"
            height="12"
            rx="6"
            className="fill-surface-raised stroke-text-faint"
          />,
          'Operation',
          'a task the system performs',
          'operationalized as',
        )}
        {item(
          <polygon
            points="1,9 6,2 24,2 29,9 24,16 6,16"
            className="fill-kaos-agent stroke-kaos-agent-line"
          />,
          'Module',
          'the software that performs the task; the small circle on its line marks who is responsible',
          'performed by',
        )}
        {item(
          <polygon
            points="1,6 15,1 29,6 29,16 1,16"
            className="fill-kaos-domain stroke-kaos-domain-line"
          />,
          'Domain property',
          'what is assumed about the world; a failure counts against the system only when it held',
          'assuming',
        )}
        {item(
          <polygon
            points="7,2 29,2 23,16 1,16"
            className="fill-kaos-goal stroke-kaos-soft-line [stroke-dasharray:3_2]"
          />,
          'Soft goal',
          'a quality promised beyond safety (dashed border)',
          'ensuring',
        )}
        {withResults ? (
          <>
            {item(
              <polygon
                points="7,2 29,2 23,16 1,16"
                className="fill-fail-soft stroke-fail [stroke-width:2]"
              />,
              'Failed',
              'the system did not meet this part in the counted runs',
            )}
            {item(
              <polygon
                points="1,6 15,1 29,6 29,16 1,16"
                className="fill-[#fbecc4] stroke-caution [stroke-dasharray:3_2] [stroke-width:2]"
              />,
              'Broken assumption',
              'it did not hold in some runs, so those runs are not counted against the system',
            )}
          </>
        ) : null}
        {withObstacles ? (
          <>
            {item(
              <polygon
                points="1,2 23,2 29,16 7,16"
                className="fill-kaos-obstacle stroke-kaos-obstacle-line"
              />,
              'Obstacle',
              STUDY
                ? 'a group of failures that blocks a goal'
                : 'a group of failures that blocks a goal, supported by the evidence',
            )}
            {STUDY ? null : (
              <>
                {item(
                  <polygon
                    points="1,2 23,2 29,16 7,16"
                    className="fill-caution-soft stroke-caution [stroke-dasharray:3_2]"
                  />,
                  'Obstacle, insufficient data',
                  'too few simulations to decide',
                )}
                {item(
                  <polygon
                    points="1,2 23,2 29,16 7,16"
                    className="fill-set-aside-soft stroke-border-strong"
                  />,
                  'Obstacle, not supported',
                  'the evidence does not back it',
                )}
              </>
            )}
            <li className="sm:col-span-2">Click an obstacle to follow its chain to the goal.</li>
          </>
        ) : null}
      </ul>
    </section>
  );
}
