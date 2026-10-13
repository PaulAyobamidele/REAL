# Run 2b — job 4972493, run `657a1447d0ba43af9c3aa54f3c8698ce`: first reading

Checked 2026-10-08 after a complete pull (160 simulations + video re-run,
161 traces, frames, best_scenario.mp4, log `artifacts/real-av-carla-4972493.out`).
COMPLETED, 1 h 55 min 46 s (start 03:50:31 Narval time). Round-2 system
(proportional_braking + yolov5s), scene v2.3, `R_baseline.dsl`, `old.bnf`
32 x 5, seed 42, parent `882fb2fe…`. Report: `analysis_report.md` here
(analysis code as in the working tree on 2026-10-08).

## Is it a valid test? Yes

- car on the road in all 160; no no-encounter runs; every scenario simulated;
- pedestrian did not cross in 4 of 160 (2.5 %, all RL Long) — test defects, set aside.

## What the report says (before the checks below)

- 0 of 146 in-scope encounters failed; 10 simulations set aside as spurious
  (`pedestrian_speed_mps <= 3` broken, all 10 failed) → that assumption
  "load-bearing" (0 % vs 100 %).
- **145 of 146 passes stalled** (car stopped and not moving at the 25 s
  limit); `resume_within_s <= 10` met 43, missed 103; 53 resumed at some point.
- First brake median 16.7 m; pedestrian first detected (> 85 %) at 9.6 m.
- StandoffUnnecessaryStop supported; DetectionTooLate and BrakingNotLatched
  insufficient data; the setting-based obstacles not supported.

## What the traces show — two measurement problems, one scoring problem

All 12 simulations scored as failures (rho ≤ 0, closest approach < 5 m),
inspected step by step (pedestrian position across the road at the closest
point):

| kind | count | what happened |
|---|---|---|
| pedestrian already across, standing on the far kerb | **9** | the car drives on past at 4-5 m/s, 2.8-3.8 m from the pedestrian, who is ~3-3.7 m from the lane centre on the pavement. Scored a failure only because the safety rule is a 5 m radius around the pedestrian wherever they are. |
| pedestrian in the road (lateral 0.3 m) at the closest point | **1** | simulation 26_0: closest approach 3.1 m, typed detected_too_late — the only genuine near-miss in the run |
| pedestrian never crossed | 2 | test defects (already excluded) |

1. **The safety rule penalises driving past a pedestrian on the pavement.**
   "Stay more than 5 m from the pedestrian" (the monitor's rho) treats a
   person waiting on the far kerb, ~3.5 m from the car's path, as a hazard. A
   car that resumes after the crossing therefore "fails", and a car that
   never resumes "passes" (stalled). This is a requirement-level question:
   the safety goal's operational definition is underspecified — an [R]
   refinement for the review (e.g. the 5 m margin applies while the
   pedestrian is in or entering the car's path).
2. **The pedestrian's top speed is contaminated by one-step simulator
   spikes** (e.g. 0.8 → 6.0 → 10.9 → 0.1 m/s as the car passes; 18 such steps
   in the whole run). The 10 "spurious" failures were flagged because of these
   spikes, so the "load-bearing" verdict for `pedestrian_speed_mps <= 3` is an
   **artefact — not a finding**. The speed measure must ignore single-step spikes.
3. **Deceleration and jerk are not plausible** (median peak deceleration
   33.8 m/s², jerk 309 m/s³): the same kind of step artefacts in the car's
   speed series. Smoothness numbers are not usable until the measure is made
   robust.

## Reading that holds

- The scene works: the car meets a crossing pedestrian in every situation.
- With proportional braking the car **never came within 5 m of a pedestrian
  who was in its path, except once** (26_0).
- **The standoff is the dominant behaviour**: the car brakes for any visible
  person (first brake ~17 m) and, by the 25 s limit, 145 of 146 cars are
  stopped; 103 never resumed within 10 s of stopping. That is the car's real
  weakness on a valid scene.

All three problems can be fixed on the laptop and 2b re-judged from its
traces (they hold every step) — no new simulation needed. Until then, no
number from this run goes into the paper except the validity checks above.

## Re-judged from the traces (same day)

`scripts/analysis/trace_measures.py`: pedestrian speed and the car's speed
are median-filtered over 5 steps (0.5 s) before peaks are taken (removes
glitches of up to two steps); the safety margin can apply anywhere (the
monitor's rule) or only while the pedestrian is within 2.5 m of the lane
centre ("path"). Two labelled subfolders; this folder's own report is kept.

| | `robust_measures/` (5 m anywhere) | `path_aware/` (5 m in the path) |
|---|---|---|
| in scope / spurious | 159 / 1 | 159 / 1 |
| valid encounters failed | 9 of 155 (6 %) | **3 of 155 (2 %)** |
| stalled passes | 145 | 145 |
| `resume_within_s <= 10` met / missed | 52 / 103 | 52 / 103 |

- `pedestrian_speed_mps <= 3`: broken in **1** run (3.7 m/s sustained —
  genuine, set aside as spurious) instead of 10; verdict insufficient data.
  The earlier "load-bearing" was the glitch artefact.
- Path rule: the 3 failures are genuine close calls with the pedestrian in
  the car's path (closest in-path distance 3.0, 4.0, 4.9 m; braking released).
  The 6 others under the anywhere rule were the car driving past a pedestrian
  on the far pavement.
- Peak deceleration / jerk do **not** change with the filter (median 33.8
  m/s², ~310 m/s³): not glitches but how abruptly the simulated car stops at
  low speed. Comparable between rounds; not realistic absolute values.
