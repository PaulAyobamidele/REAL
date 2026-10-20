import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Trace } from '@/services/workspace';
import { cx } from '@/utils/format';

/** The monitor's rule (scripts/simulations/util.py SAFETY_MARGIN_M): centre to centre, metres. */
export const SAFETY_MARGIN_M = 5;
/**
 * "Seen" and "braking" as the run's summary counts them (scripts/analysis/
 * telemetry.py): the pedestrian detected in the car's path (in-path
 * confidence, where the trace has it), and any brake command above zero.
 */
const SEEN = 0.5;

interface Frame {
  step: number;
  t: number;
  distance: number | null;
  lateral: number;
  /** car centre along the road, metres; the pedestrian's crossing line is at 0 */
  carX: number;
  speed: number | null;
  seen: boolean;
  braking: boolean;
}

/**
 * The run's frames from its trace. Distances are the recorded ones; the car
 * is placed on the road so that its distance to the pedestrian is exactly the
 * recorded distance (in front of the crossing line until the closest
 * longitudinal point, past it after).
 */
export function framesOf(trace: Trace): Frame[] {
  const summary = (trace.summary ?? {}) as Record<string, unknown>;
  const dt = typeof summary.timestep_s === 'number' ? summary.timestep_s : 0.1;
  const lateral = ((trace as Record<string, unknown>).ped_lateral_m ?? []) as (number | null)[];
  const inPath = trace.detections.some((d) => 'in_path_confidence' in d);
  const seen = new Map(
    trace.detections.map((d) => [
      d.step,
      ((inPath ? (d as { in_path_confidence?: number | null }).in_path_confidence : d.confidence) ??
        0) >= SEEN,
    ]),
  );
  const braking = new Map(trace.brakes.map((b) => [b.step, (b.brake ?? 0) > 0]));
  const gaps = trace.distance_m.map((d, i) =>
    d === null ? null : Math.sqrt(Math.max(d * d - (lateral[i] ?? 0) ** 2, 0)),
  );
  let closest = 0;
  gaps.forEach((g, i) => {
    if (g !== null && g < (gaps[closest] ?? Infinity)) closest = i;
  });
  return trace.distance_m.map((d, i) => ({
    step: i,
    t: i * dt,
    distance: d,
    lateral: lateral[i] ?? lateral[0] ?? 0,
    carX: gaps[i] === null ? NaN : i <= closest ? -gaps[i]! : gaps[i]!,
    speed: trace.ego_speed[i] ?? null,
    seen: seen.get(i) ?? false,
    braking: braking.get(i) ?? false,
  }));
}

export interface Moment {
  step: number;
  label: string;
  tone: 'seen' | 'brake' | 'fail' | 'pass' | 'neutral';
}

/** The moments worth jumping to: first seen, first brake, closest approach. */
export function momentsOf(frames: Frame[]): Moment[] {
  const out: Moment[] = [];
  const seen = frames.find((f) => f.seen);
  if (seen)
    out.push({
      step: seen.step,
      label: `Detector sees the pedestrian at ${fmt(seen.distance)} m`,
      tone: 'seen',
    });
  else out.push({ step: 0, label: 'The detector never sees the pedestrian', tone: 'neutral' });
  const brake = frames.find((f) => f.braking);
  if (brake)
    out.push({
      step: brake.step,
      label: `Car brakes at ${fmt(brake.distance)} m, ${fmt(brake.speed)} m/s`,
      tone: 'brake',
    });
  let min = frames[0];
  for (const f of frames)
    if (f.distance !== null && (min?.distance == null || f.distance < min.distance)) min = f;
  if (min && min.distance !== null)
    out.push({
      step: min.step,
      label:
        min.distance < SAFETY_MARGIN_M
          ? `Closest: ${fmt(min.distance)} m, inside the ${SAFETY_MARGIN_M} m margin: failed`
          : `Closest: ${fmt(min.distance)} m, outside the ${SAFETY_MARGIN_M} m margin: passed`,
      tone: min.distance < SAFETY_MARGIN_M ? 'fail' : 'pass',
    });
  return out.sort((a, b) => a.step - b.step);
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '?' : n.toFixed(1);
}

const PX = 15; // pixels per metre
const VIEW = { x0: -26, x1: 16, y0: -7, y1: 7 };

/**
 * One run, seen from above and replayed from its trace: the road, the car
 * (brake lights when braking, a cone when the detector sees the
 * pedestrian), the pedestrian with the 5 m safety margin around them (red
 * when the car is inside it), and a timeline with the moments that decide
 * the verdict. Play, pause, scrub, or jump to a moment.
 */
export function ScenarioReplay({ trace }: { trace: Trace }) {
  const frames = useMemo(() => framesOf(trace), [trace]);
  const moments = useMemo(() => momentsOf(frames), [frames]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setStep((s) => {
        if (s >= last) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 100);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, last]);

  const f = frames[Math.min(step, last)];
  if (!f) return <p className="text-sm text-text-muted">This trace has no steps to replay.</p>;
  const inside = f.distance !== null && f.distance < SAFETY_MARGIN_M;
  const X = (m: number) => (m - VIEW.x0) * PX;
  const Y = (m: number) => (VIEW.y1 - m) * PX;
  const W = (VIEW.x1 - VIEW.x0) * PX;
  const H = (VIEW.y1 - VIEW.y0) * PX;
  const carX = Number.isFinite(f.carX) ? f.carX : VIEW.x0;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border bg-[#f3f3e4]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Replay at ${f.t.toFixed(1)} s: distance ${fmt(f.distance)} m${inside ? ', inside the safety margin' : ''}${f.seen ? ', pedestrian detected' : ''}${f.braking ? ', braking' : ''}`}
        >
          {/* pavements and road */}
          <rect x={0} y={0} width={W} height={H} fill="#e6e4d2" />
          <rect x={0} y={Y(3.6)} width={W} height={7.2 * PX} fill="#4a4f5a" />
          <line
            x1={0}
            x2={W}
            y1={Y(0)}
            y2={Y(0)}
            stroke="#e8e8e8"
            strokeDasharray="14 12"
            strokeWidth={1.2}
          />
          {/* the crossing line */}
          {[-3, -1.8, -0.6, 0.6, 1.8, 3].map((y) => (
            <rect
              key={y}
              x={X(-1)}
              y={Y(y + 0.4)}
              width={2 * PX}
              height={0.8 * PX}
              fill="#ffffff"
              opacity={0.25}
            />
          ))}
          {/* the safety margin around the pedestrian */}
          <circle
            cx={X(0)}
            cy={Y(f.lateral)}
            r={SAFETY_MARGIN_M * PX}
            fill={inside ? 'rgb(173 31 7 / 0.22)' : 'rgb(255 255 255 / 0.06)'}
            stroke={inside ? '#ad1f07' : '#ffffff'}
            strokeDasharray="6 5"
            strokeWidth={inside ? 2 : 1.2}
          />
          {/* the detector's view, when it sees the pedestrian */}
          {f.seen ? (
            <polygon
              points={`${X(carX + 2.25)},${Y(0.6)} ${X(carX + 2.25)},${Y(-0.6)} ${X(0)},${Y(f.lateral - 0.9)} ${X(0)},${Y(f.lateral + 0.9)}`}
              fill="rgb(158 178 0 / 0.45)"
            />
          ) : null}
          {/* the car, heading right */}
          <g transform={`translate(${X(carX)} ${Y(0)})`}>
            <rect
              x={-2.25 * PX}
              y={-0.95 * PX}
              width={4.5 * PX}
              height={1.9 * PX}
              rx={5}
              fill="#172033"
            />
            <rect
              x={0.6 * PX}
              y={-0.75 * PX}
              width={1.2 * PX}
              height={1.5 * PX}
              rx={3}
              fill="#8fa3bf"
            />
            <rect
              x={-2.25 * PX}
              y={-0.85 * PX}
              width={4}
              height={0.5 * PX}
              fill={f.braking ? '#ff3b1f' : '#5b1a10'}
            />
            <rect
              x={-2.25 * PX}
              y={0.35 * PX}
              width={4}
              height={0.5 * PX}
              fill={f.braking ? '#ff3b1f' : '#5b1a10'}
            />
          </g>
          {/* the pedestrian */}
          <circle
            cx={X(0)}
            cy={Y(f.lateral)}
            r={0.45 * PX}
            fill="#610000"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          {/* distance read-out */}
          <text x={10} y={18} className="fill-white text-[12px] font-semibold">
            {f.t.toFixed(1)} s · {fmt(f.distance)} m · {fmt(f.speed)} m/s
          </text>
        </svg>
      </div>
      <p className="text-xs text-text-muted">
        A schematic drawing, not camera footage: it is drawn from this run’s recorded CARLA trace
        (the measured distance to the pedestrian, the pedestrian’s position across the road, the
        car’s speed, the detector’s in-path detections and the brake commands, every 0.1 s).
      </p>
      {/* status chips: what is happening at this moment */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip on={f.seen} tone="seen">
          detector sees the pedestrian
        </Chip>
        <Chip on={f.braking} tone="brake">
          braking
        </Chip>
        <Chip on={inside} tone="fail">
          inside the {SAFETY_MARGIN_M} m safety margin
        </Chip>
      </div>
      {/* timeline */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (step >= last) setStep(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? 'Pause the replay' : 'Play the replay'}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-primary text-action-primary-text hover:brightness-105"
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </button>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={last}
            value={step}
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.target.value));
            }}
            aria-label="Time in the run"
            className="w-full accent-[#172033]"
          />
          {moments.map((m) => (
            <span
              key={`${m.step}-${m.tone}`}
              aria-hidden="true"
              className={cx('pointer-events-none absolute -top-1 h-2 w-0.5', TONE_BG[m.tone])}
              style={{ left: `${(m.step / Math.max(last, 1)) * 100}%` }}
            />
          ))}
        </div>
        <span className="num w-12 text-right text-xs text-text-muted">{f.t.toFixed(1)} s</span>
      </div>
      <ol className="flex flex-col gap-1 text-sm" aria-label="Moments in this run">
        {moments.map((m) => (
          <li key={`${m.step}-${m.tone}`}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setStep(m.step);
              }}
              className={cx(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-fill',
                step === m.step && 'bg-fill',
              )}
            >
              <span
                aria-hidden="true"
                className={cx('size-2.5 shrink-0 rounded-full', TONE_BG[m.tone])}
              />
              <span className="num w-12 text-xs text-text-muted">
                {frames[m.step]?.t.toFixed(1)} s
              </span>
              <span className={m.tone === 'fail' ? 'font-semibold text-fail' : 'text-text'}>
                {m.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TONE_BG: Record<Moment['tone'], string> = {
  seen: 'bg-action-primary',
  brake: 'bg-[#ff3b1f]',
  fail: 'bg-fail',
  pass: 'bg-text',
  neutral: 'bg-text-faint',
};

function Chip({
  on,
  tone,
  children,
}: {
  on: boolean;
  tone: 'seen' | 'brake' | 'fail';
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition-colors duration-fast',
        on
          ? tone === 'fail'
            ? 'border-fail bg-fail-soft font-semibold text-fail'
            : 'border-text bg-surface-raised font-semibold text-text'
          : 'border-border text-text-faint',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('size-2 rounded-full', on ? TONE_BG[tone] : 'bg-fill-strong')}
      />
      {children}
    </span>
  );
}
