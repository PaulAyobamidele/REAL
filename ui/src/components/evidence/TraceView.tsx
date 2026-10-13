import { useId, useMemo, useRef, useState } from 'react';

import { FileName } from '@/components/ui/Section';
import type { Trace } from '@/services/workspace';
import { displayNumber } from '@/utils/format';

/**
 * One simulation's time series, as small multiples sharing the step axis:
 * distance to the pedestrian, the car's speed, and the detector's
 * confidence (with the detection bar). Brake events are marked on the speed
 * panel. One axis per panel, thin lines, a hover crosshair with the values
 * at that step, and a table view of the same numbers.
 */
interface Panel {
  key: string;
  title: string;
  unit: string;
  values: (number | null)[];
  min?: number;
  max?: number;
  reference?: { value: number; label: string };
}

const WIDTH = 640;
const PANEL_HEIGHT = 110;
const MARGIN = { top: 18, right: 12, bottom: 20, left: 44 };

function extent(values: (number | null)[], min?: number, max?: number): [number, number] {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  let lo = min ?? (nums.length ? Math.min(...nums) : 0);
  let hi = max ?? (nums.length ? Math.max(...nums) : 1);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  return [Math.min(lo, 0), hi];
}

function ticks(lo: number, hi: number, count = 3): number[] {
  const step = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(step || 1));
  const nice = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= step) ?? magnitude;
  const out: number[] = [];
  for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice)
    out.push(Number(v.toFixed(6)));
  return out;
}

export function TraceView({
  trace,
  file,
  timestep,
}: {
  trace: Trace;
  file: string;
  timestep: number | null;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const steps = Math.max(trace.distance_m.length, trace.ego_speed.length);
  const confidence = useMemo(() => {
    const out: (number | null)[] = Array.from({ length: steps }, () => null);
    for (const d of trace.detections) if (d.step >= 0 && d.step < steps) out[d.step] = d.confidence;
    return out;
  }, [trace.detections, steps]);
  const brakeSteps = useMemo(
    () => new Set(trace.brakes.filter((b) => (b.brake ?? 0) > 0).map((b) => b.step)),
    [trace.brakes],
  );

  const panels: Panel[] = [
    {
      key: 'distance',
      title: 'Distance to the pedestrian',
      unit: 'm',
      values: trace.distance_m,
      min: 0,
    },
    { key: 'speed', title: 'Car speed', unit: 'm/s', values: trace.ego_speed, min: 0 },
    {
      key: 'confidence',
      title: 'Detector confidence',
      unit: '',
      values: confidence,
      min: 0,
      max: 1,
      reference: { value: 0.85, label: 'detection bar 0.85' },
    },
  ];
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const x = (step: number) => MARGIN.left + (steps > 1 ? (step / (steps - 1)) * plotWidth : 0);
  const totalHeight = panels.length * PANEL_HEIGHT + MARGIN.bottom;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const step = Math.round(((px - MARGIN.left) / plotWidth) * (steps - 1));
    setHover(step >= 0 && step < steps ? step : null);
  };

  if (!steps) {
    return <p className="text-sm text-text-muted">The trace has no time series.</p>;
  }

  const hoverValues =
    hover === null
      ? null
      : panels.map((p) => ({ title: p.title, unit: p.unit, value: p.values[hover] ?? null }));

  return (
    <figure className="flex flex-col gap-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${totalHeight}`}
        className="w-full select-none"
        role="img"
        aria-labelledby={`${id}-title`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <title id={`${id}-title`}>
          Time series of one simulation: distance to the pedestrian, car speed and detector
          confidence over {steps} steps
        </title>
        {panels.map((panel, pi) => {
          const top = pi * PANEL_HEIGHT + MARGIN.top;
          const h = PANEL_HEIGHT - MARGIN.top - 6;
          const [lo, hi] = extent(panel.values, panel.min, panel.max);
          const y = (v: number) => top + h - ((v - lo) / (hi - lo)) * h;
          let d = '';
          panel.values.forEach((v, i) => {
            if (v === null || !Number.isFinite(v)) {
              d += ' ';
              return;
            }
            d += `${d.endsWith(' ') || d === '' ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          });
          return (
            <g key={panel.key}>
              <text x={MARGIN.left} y={top - 6} className="fill-text-muted" fontSize={11}>
                {panel.title}
                {panel.unit ? ` (${panel.unit})` : ''}
              </text>
              {ticks(lo, hi).map((t) => (
                <g key={t}>
                  <line
                    x1={MARGIN.left}
                    x2={WIDTH - MARGIN.right}
                    y1={y(t)}
                    y2={y(t)}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                  <text
                    x={MARGIN.left - 6}
                    y={y(t) + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    className="fill-text-faint tabular"
                  >
                    {displayNumber(t, 1)}
                  </text>
                </g>
              ))}
              {panel.reference ? (
                <g>
                  <line
                    x1={MARGIN.left}
                    x2={WIDTH - MARGIN.right}
                    y1={y(panel.reference.value)}
                    y2={y(panel.reference.value)}
                    className="stroke-text-faint"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={WIDTH - MARGIN.right}
                    y={y(panel.reference.value) - 3}
                    textAnchor="end"
                    fontSize={10}
                    className="fill-text-faint"
                  >
                    {panel.reference.label}
                  </text>
                </g>
              ) : null}
              <path
                d={d.trim()}
                fill="none"
                className="stroke-human"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {panel.key === 'speed'
                ? [...brakeSteps].map((s) => {
                    const v = panel.values[s];
                    if (v === null || v === undefined) return null;
                    return (
                      <rect
                        key={s}
                        x={x(s) - 3}
                        y={y(v) - 3}
                        width={6}
                        height={6}
                        className="fill-text-muted"
                        aria-hidden="true"
                      />
                    );
                  })
                : null}
              {hover !== null &&
              panel.values[hover] !== null &&
              panel.values[hover] !== undefined ? (
                <circle
                  cx={x(hover)}
                  cy={y(panel.values[hover] as number)}
                  r={4}
                  className="fill-human stroke-surface"
                  strokeWidth={2}
                />
              ) : null}
            </g>
          );
        })}
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={MARGIN.top - 12}
            y2={totalHeight - MARGIN.bottom}
            className="stroke-text-faint"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        ) : null}
        {ticks(0, steps - 1, 5).map((t) => (
          <text
            key={t}
            x={x(t)}
            y={totalHeight - 6}
            textAnchor="middle"
            fontSize={10}
            className="fill-text-faint tabular"
          >
            {timestep ? `${(t * timestep).toFixed(1)} s` : `step ${t}`}
          </text>
        ))}
      </svg>
      <div
        className="flex min-h-[1.5rem] flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted"
        aria-live="polite"
      >
        {hoverValues ? (
          <>
            <span className="tabular">
              step {hover}
              {timestep ? ` (${((hover ?? 0) * timestep).toFixed(1)} s)` : ''}
            </span>
            {hoverValues.map((v) => (
              <span key={v.title} className="tabular">
                {v.title.toLowerCase()}: {displayNumber(v.value, 2)}
                {v.unit ? ` ${v.unit}` : ''}
              </span>
            ))}
            {brakeSteps.has(hover ?? -1) ? <span>braking</span> : null}
          </>
        ) : (
          <span>
            Move the pointer over the chart for the values at a step. Squares on the speed panel
            mark braking.
          </span>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span>
          Trace file: <FileName>{file}</FileName>
        </span>
        <button
          type="button"
          className="text-human underline"
          onClick={() => setShowTable((s) => !s)}
          aria-expanded={showTable}
        >
          {showTable ? 'Hide table' : 'Show as table'}
        </button>
      </figcaption>
      {showTable ? (
        <div className="max-h-64 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs tabular">
            <thead className="sticky top-0 bg-surface-sunken">
              <tr>
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  step
                </th>
                {panels.map((p) => (
                  <th key={p.key} scope="col" className="px-2 py-1 text-right font-medium">
                    {p.title}
                    {p.unit ? ` (${p.unit})` : ''}
                  </th>
                ))}
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  braking
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: steps }, (_, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-0.5">{i}</td>
                  {panels.map((p) => (
                    <td key={p.key} className="px-2 py-0.5 text-right">
                      {displayNumber(p.values[i] ?? null, 2)}
                    </td>
                  ))}
                  <td className="px-2 py-0.5">{brakeSteps.has(i) ? 'yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
