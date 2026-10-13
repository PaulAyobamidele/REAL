import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { outcomeWords, rowKey, setAsideReason, type SimulationRow } from '@/domain/evidence';
import { foldRepeats } from '@/domain/sequences';
import type { ClusterGroup, ClusterMap } from '@/services/schemas';
import { cx } from '@/utils/format';

/**
 * Every valid encounter of the round on one map: a dot per simulation,
 * placed so that runs which unfolded alike sit close together (the
 * event-sequence distance of scripts/analysis/cluster_map.py, laid out in
 * Python). Colour is the cluster of the chosen cut, shape the outcome, a
 * ring the simulations behind the selected obstacle. The cut is the
 * reviewer's to move: each cut carries its silhouette, and below 0.25 the
 * clusters are neighbourhoods, not types - the card says so.
 *
 * Colour: three validated categorical slots (`series-1..3`, colour-blind safe
 * all-pairs); clusters beyond the third are "other" in faint ink, never a
 * new hue. Identity never rests on colour alone: shapes carry the outcome,
 * every cluster has a numbered legend entry and a card.
 */

type Shape = 'failed' | 'stalled' | 'passed';

const SHAPE_WORDS: Record<Shape, string> = {
  failed: 'failed',
  stalled: 'stopped, never moved again',
  passed: 'drove on',
};

const SERIES = ['fill-series-1', 'fill-series-2', 'fill-series-3'];
const SERIES_BG = ['bg-series-1', 'bg-series-2', 'bg-series-3'];
const SERIES_STROKE = ['stroke-series-1', 'stroke-series-2', 'stroke-series-3'];
const W = 640;
const H = 440;
const PAD = 18;
const R = 4.5;

function seriesIndex(cluster: number): number | null {
  return cluster >= 1 && cluster <= SERIES.length ? cluster - 1 : null;
}

function shapeOf(failed: boolean, outcome: string | null): Shape {
  if (failed) return 'failed';
  return outcome === 'passed_stalled' ? 'stalled' : 'passed';
}

function Marker({
  shape,
  x,
  y,
  r,
  className,
}: {
  shape: Shape;
  x: number;
  y: number;
  r: number;
  className?: string;
}) {
  if (shape === 'failed') {
    const h = r * 1.25;
    return (
      <path
        d={`M${x},${y - h} L${x + h},${y + h * 0.8} L${x - h},${y + h * 0.8} Z`}
        className={className}
      />
    );
  }
  if (shape === 'passed') {
    return (
      <rect
        x={x - r * 0.9}
        y={y - r * 0.9}
        width={r * 1.8}
        height={r * 1.8}
        rx={1}
        className={className}
      />
    );
  }
  return <circle cx={x} cy={y} r={r} className={className} />;
}

export function ClusterMapView({
  doc,
  rows,
  highlight,
  highlightLabel,
  selectedKey,
  onSelect,
}: {
  doc: ClusterMap;
  rows: SimulationRow[];
  /** Keys of the simulations behind the selected obstacle, or null for none selected. */
  highlight: Set<string> | null;
  highlightLabel?: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const id = useId();
  const [cutIndex, setCutIndex] = useState(doc.default_cut ?? 0);
  const [hover, setHover] = useState<number | null>(null);
  const [focusCluster, setFocusCluster] = useState<number | null>(null);
  const cut = doc.cuts[cutIndex] ?? null;
  const rowsByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  // equal scale on both axes (distances on the map mean something), and
  // identical runs fanned out on a small golden-angle spiral so none hides
  const placed = useMemo(() => {
    const xs = doc.points.map((p) => p.x);
    const ys = doc.points.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const scale = Math.min((W - 2 * PAD) / (x1 - x0 || 1), (H - 2 * PAD) / (y1 - y0 || 1));
    const ox = (W - (x1 - x0) * scale) / 2;
    const oy = (H - (y1 - y0) * scale) / 2;
    const seen = new Map<string, number>();
    return doc.points.map((p, i) => {
      const at = `${p.x}|${p.y}`;
      const n = seen.get(at) ?? 0;
      seen.set(at, n + 1);
      const angle = n * 2.39996;
      const spread = n ? 2.5 + 1.6 * Math.sqrt(n) : 0;
      const key = rowKey(p.scenario_id, p.sim_index);
      const row = rowsByKey.get(key);
      return {
        i,
        key,
        point: p,
        row,
        shape: shapeOf(p.failed, p.failure_type),
        aside: Boolean(row && setAsideReason(row)),
        x: ox + (p.x - x0) * scale + Math.cos(angle) * spread,
        y: H - (oy + (p.y - y0) * scale) + Math.sin(angle) * spread,
      };
    });
  }, [doc.points, rowsByKey]);

  const membersOf = (cluster: number) =>
    cut ? placed.filter((d) => cut.assignment[d.i] === cluster) : [];
  const hovered = hover !== null ? placed[hover] : null;
  const faded = (d: (typeof placed)[number]) =>
    (highlight !== null && !highlight.has(d.key)) ||
    (focusCluster !== null && cut !== null && cut.assignment[d.i] !== focusCluster);
  const groups = cut?.groups ?? [];
  const bigGroups = groups.filter((g) => g.size >= 2);
  const singles = groups.filter((g) => g.size < 2);
  const otherCount = groups
    .filter((g) => seriesIndex(g.cluster) === null)
    .reduce((n, g) => n + g.size, 0);
  // draw faded marks first so the ringed ones sit on top
  const order = [...placed].sort((a, b) => Number(!faded(a)) - Number(!faded(b)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {doc.cuts.length > 1 ? (
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-text-muted">
            <span>
              Clusters: <span className="num text-text">{cut?.clusters ?? '-'}</span>
              {cut ? (
                <>
                  {' '}
                  · silhouette <span className="num text-text">{cut.silhouette.toFixed(2)}</span>
                </>
              ) : null}
            </span>
            <input
              type="range"
              min={0}
              max={doc.cuts.length - 1}
              step={1}
              value={cutIndex}
              onChange={(e) => {
                setCutIndex(Number(e.target.value));
                setFocusCluster(null);
              }}
              aria-valuetext={
                cut
                  ? `${cut.clusters} clusters, silhouette ${cut.silhouette.toFixed(2)}`
                  : undefined
              }
              className="w-full max-w-sm accent-[var(--color-human)]"
            />
          </label>
        ) : null}
        {cut ? (
          <p className="max-w-md text-xs text-text-muted">
            {cut.structure}
            {doc.default_cut === cutIndex ? ' (the best-scoring cut).' : '.'}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <figure className="m-0 flex min-w-0 flex-col gap-2">
          <div className="relative">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full rounded-lg bg-surface-sunken"
              role="img"
              aria-labelledby={`${id}-caption`}
              onMouseLeave={() => setHover(null)}
            >
              {order.map((d) => {
                const cluster = cut ? cut.assignment[d.i]! : 0;
                const s = seriesIndex(cluster);
                const fill = d.aside
                  ? 'fill-surface-sunken'
                  : s !== null
                    ? SERIES[s]
                    : 'fill-text-faint';
                const stroke = d.aside
                  ? s !== null
                    ? SERIES_STROKE[s]
                    : 'stroke-text-faint'
                  : 'stroke-surface-raised';
                const ringed = highlight?.has(d.key) || d.key === selectedKey;
                return (
                  <g
                    key={d.key}
                    className={cx(
                      'cursor-pointer transition-opacity duration-fast',
                      faded(d) && 'opacity-20',
                    )}
                    onMouseEnter={() => setHover(d.i)}
                    onClick={() => onSelect(d.key)}
                  >
                    {ringed ? (
                      <circle
                        cx={d.x}
                        cy={d.y}
                        r={d.key === selectedKey ? R + 5 : R + 3}
                        className={cx(
                          'fill-none stroke-text',
                          d.key === selectedKey ? 'stroke-2' : 'stroke-1',
                        )}
                      />
                    ) : null}
                    <Marker
                      shape={d.shape}
                      x={d.x}
                      y={d.y}
                      r={R}
                      className={cx(fill, stroke, 'stroke-[1.5]')}
                    />
                    <circle cx={d.x} cy={d.y} r={R + 5} className="fill-transparent" />
                  </g>
                );
              })}
            </svg>
            {hovered ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 w-64 rounded-lg bg-surface-raised p-2.5 text-xs shadow-[var(--shadow-overlay)]"
                style={{
                  left: `${Math.min(Math.max((hovered.x / W) * 100, 0), 62)}%`,
                  top: `${(hovered.y / H) * 100}%`,
                  transform: 'translate(12px, -50%)',
                }}
              >
                <p className="font-medium text-text">
                  Scenario {hovered.point.scenario_id} · simulation {hovered.point.sim_index}
                </p>
                <p className="text-text-muted">
                  {hovered.row && setAsideReason(hovered.row)
                    ? `set aside: ${setAsideReason(hovered.row)}`
                    : outcomeWords(hovered.row?.label?.outcome ?? hovered.point.failure_type)}
                </p>
                {cut ? (
                  <p className="text-text-muted">cluster {cut.assignment[hovered.i]}</p>
                ) : null}
                {hovered.row ? (
                  <p className="text-text-muted">
                    {['pedestrian', 'dress', 'direction', 'distance', 'fog_density']
                      .map((k) => hovered.row!.csv[k])
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                <p className="mt-1 text-text-faint">
                  {hovered.point.sequence.length} steps · click to open
                </p>
              </div>
            ) : null}
          </div>
          <figcaption id={`${id}-caption`} className="flex flex-col gap-2 text-xs text-text-muted">
            <span>
              {doc.points.length} encounters. Nearby dots unfolded alike (same events in the same
              order); the axes have no units.
              {doc.map.rank_correlation !== null
                ? ` The map keeps ${Math.round(doc.map.rank_correlation * 100)}% of the distance ranking`
                : ''}
              {doc.map.variance_2d !== null
                ? `; its two axes carry ${Math.round(doc.map.variance_2d * 100)}% of the variation.`
                : '.'}
              {highlight !== null && highlightLabel ? ` Ringed: ${highlightLabel}.` : ''}
            </span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
              {groups
                .filter((g) => seriesIndex(g.cluster) !== null)
                .map((g) => (
                  <li key={g.cluster} className="flex items-center gap-1.5">
                    <span
                      className={cx(
                        'inline-block size-2.5 rounded-full',
                        SERIES_BG[seriesIndex(g.cluster)!],
                      )}
                    />
                    cluster {g.cluster} ({g.size})
                  </li>
                ))}
              {otherCount ? (
                <li className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full bg-text-faint" />
                  other clusters ({otherCount})
                </li>
              ) : null}
              {(Object.keys(SHAPE_WORDS) as Shape[]).map((shape) => (
                <li key={shape} className="flex items-center gap-1.5">
                  <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true">
                    <Marker shape={shape} x={7} y={7} r={4} className="fill-text-muted" />
                  </svg>
                  {SHAPE_WORDS[shape]}
                </li>
              ))}
              {placed.some((d) => d.aside) ? (
                <li className="flex items-center gap-1.5">
                  <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true">
                    <Marker
                      shape="failed"
                      x={7}
                      y={7}
                      r={4}
                      className="fill-none stroke-text-muted stroke-[1.5]"
                    />
                  </svg>
                  hollow: set aside, not counted
                </li>
              ) : null}
            </ul>
          </figcaption>
        </figure>

        <div className="flex min-w-0 flex-col gap-2.5" aria-label="Clusters">
          {bigGroups.map((g) => (
            <ClusterCard
              key={`${cutIndex}-${g.cluster}`}
              group={g}
              series={seriesIndex(g.cluster)}
              highlighted={
                highlight ? membersOf(g.cluster).filter((d) => highlight.has(d.key)).length : null
              }
              focused={focusCluster === g.cluster}
              onFocus={(on) => setFocusCluster(on ? g.cluster : null)}
              onOpenMedoid={() => onSelect(rowKey(g.medoid.scenario_id, g.medoid.sim_index))}
            />
          ))}
          {singles.length ? (
            <p className="px-1 text-xs text-text-muted">
              {singles.length} single-run cluster{singles.length === 1 ? '' : 's'} (
              {singles.map((g) => `${g.medoid.scenario_id}/${g.medoid.sim_index}`).join(', ')}):
              runs unlike any other.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const OUTCOME_TONE: Record<string, string> = {
  passed_stalled: 'bg-text-faint',
  passed: 'bg-pass',
};

function ClusterCard({
  group,
  series,
  highlighted,
  focused,
  onFocus,
  onOpenMedoid,
}: {
  group: ClusterGroup;
  series: number | null;
  highlighted: number | null;
  focused: boolean;
  onFocus: (on: boolean) => void;
  onOpenMedoid: () => void;
}) {
  const outcomes = Object.entries(group.outcomes);
  return (
    <article
      className={cx(
        'flex flex-col gap-2 rounded-xl bg-surface-raised p-3 shadow-[0_0.5px_1.5px_rgb(0_0_0/0.08)] transition-shadow duration-fast',
        focused && 'ring-2 ring-border-strong',
      )}
      onMouseEnter={() => onFocus(true)}
      onMouseLeave={() => onFocus(false)}
      aria-label={`Cluster ${group.cluster}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          className={cx(
            'inline-block size-3 rounded-full',
            series !== null ? SERIES_BG[series] : 'bg-text-faint',
          )}
          aria-hidden="true"
        />
        <h4 className="text-sm font-semibold">Cluster {group.cluster}</h4>
        <span className="num text-xs text-text-muted">
          {group.size} runs · {group.failed} failed · {group.scenarios.length} scenarios
        </span>
        {highlighted !== null ? (
          <Chip tone="neutral" className="ml-auto">
            {highlighted} of the ringed
          </Chip>
        ) : null}
      </header>

      <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {outcomes.map(([o, n]) => (
          <span
            key={o}
            className={cx('h-full', OUTCOME_TONE[o] ?? 'bg-fail')}
            style={{ width: `${(n / group.size) * 100}%` }}
          />
        ))}
      </div>
      <p className="text-xs text-text-muted">
        {outcomes
          .map(([o, n]) => `${n} ${outcomeWords(o).replace(/^failed: /, 'failed - ')}`)
          .join('; ')}
      </p>

      {group.over_represented_settings.length ? (
        <div className="flex flex-wrap gap-1">
          {group.over_represented_settings.map((s) => (
            <Chip
              key={`${s.setting}=${s.value}`}
              tone="neutral"
              title="share in this cluster vs all encounters"
            >
              {s.setting} {s.value}: {Math.round(s.in_cluster * 100)}% vs{' '}
              {Math.round(s.overall * 100)}%
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-text-muted">
          Typical run ({group.medoid_sequence.length} steps)
        </p>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] leading-4">
          {foldRepeats(group.medoid_sequence).map(({ step, times }, k) => (
            <li key={k} className="flex items-center gap-1">
              {k ? (
                <span className="text-text-faint" aria-hidden="true">
                  →
                </span>
              ) : null}
              <span
                className={cx(
                  'rounded-md px-1.5 py-0.5',
                  step.some((e) => e.startsWith('safety violated'))
                    ? 'bg-fail-soft text-fail'
                    : step.some((e) => e === 'closest approach')
                      ? 'bg-fill font-medium text-text'
                      : 'bg-fill text-text-muted',
                )}
              >
                {step.join(' + ')}
                {times > 1 ? <span className="num ml-1 text-text-faint">×{times}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <Button size="sm" variant="quiet" onClick={onOpenMedoid}>
          Open the typical run ({group.medoid.scenario_id}/{group.medoid.sim_index})
        </Button>
      </div>
    </article>
  );
}
