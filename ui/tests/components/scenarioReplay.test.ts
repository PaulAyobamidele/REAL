import { describe, expect, it } from 'vitest';

import { framesOf, momentsOf } from '@/components/evidence/ScenarioReplay';
import type { Trace } from '@/services/workspace';

const trace = {
  summary: { timestep_s: 0.1 },
  distance_m: [20, 12, 7, 3.6, 6],
  ego_speed: [5, 5, 4, 3, 3],
  ped_lateral_m: [-3, -2, -1, 0, 1],
  detections: [
    { step: 1, confidence: 0.8, in_path_confidence: 0 },
    { step: 2, confidence: 0.9, in_path_confidence: 0.9 },
  ],
  brakes: [{ step: 1, brake: 0.01 }],
} as unknown as Trace;

describe('the scenario replay', () => {
  it('keeps the recorded distance, and counts detections and brakes as the summary does', () => {
    const frames = framesOf(trace);
    for (const f of frames) expect(Math.hypot(f.carX, f.lateral)).toBeCloseTo(f.distance ?? 0, 6);
    expect(frames[3]!.carX).toBeLessThanOrEqual(0); // at the crossing line
    expect(frames[4]!.carX).toBeGreaterThan(0); // past it
    expect(frames.map((f) => f.seen)).toEqual([false, false, true, false, false]); // in the path only
    expect(frames[1]!.braking).toBe(true); // any brake above zero
  });

  it('names the moments that decide the verdict', () => {
    expect(momentsOf(framesOf(trace)).map((m) => m.label)).toEqual([
      'Car brakes at 12.0 m, 5.0 m/s',
      'Detector sees the pedestrian at 7.0 m',
      'Closest: 3.6 m, inside the 5 m margin: failed',
    ]);
  });
});
