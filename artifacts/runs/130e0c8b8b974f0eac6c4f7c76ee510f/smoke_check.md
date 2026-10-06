# Scene v2 smoke check — job 4354082, run `130e0c8b8b974f0eac6c4f7c76ee510f`

Checked 2026-10-01 against the pass criteria in infra/hpc/README.md ("Scene v2
smoke run"). Complete pull: 32 simulations, 33 traces (incl. the video re-run),
124 frames, best_scenario.mp4, log `artifacts/real-av-carla-4354082.out`.
Job COMPLETED 02:31-03:54 Narval time (1 h 23 min, ~2.6 min per simulation).
Requirement: docs/examples/R_baseline.dsl; proportional_braking + yolov5s;
1 trial per scenario. Numbers from `analysis_report.md` in this folder and the
check script in Notes.md §8.25.

| criterion | result |
|---|---|
| `.out` ends `STATUS: OK`, no Scenic error | **pass** |
| scene-v2 columns filled | **pass** (32/32; `min_ttc_s` 31/32) |
| no-encounter near 0 (was ~25 %) | **pass** — 1 of 32 |
| `distance` changes the scene | **pass** — initial separation median Short 20.0 m, Long 34.9 m |
| both directions cross (video) | **FAIL / not shown** — see below |

## What the video shows (best scenario: Child, Dark, RL, Short, fog 0)

Frame 1: the car on the road, the yellow centre line on its **right**. Frames
8-14: the car steers right over the kerb; from frame 14 on it stands on the
pavement facing front gardens, and the pedestrian is never in view. Probable
cause (not proven): the car starts in a lane whose direction is opposite to the
heading it is given (`following roadDirection from spot`), and
FollowLaneBehavior turns it towards the lane's own direction — off the road.
This may also be what produced the "car drives away" no-encounter runs of
rounds 1-2 (Notes §8.19, item 4).

## Other observations (one trial per scenario — leads, not findings)

- 0 failures in 23 in-scope encounters; 13 stalled passes (the car never moved
  on); `resume_within_s <= 10` met 16 / missed 7.
- The car starts braking at a median 20.3 m — about when it starts, i.e. as soon
  as a person is in view above 30 % confidence — and keeps braking (median 220
  steps). If the scene is sound, the standoff comes from the braking rule, not
  only the old 8 m trigger.
- `pedestrian_speed_mps <= 3` broken in 7 runs: CrossingBehavior speeds the
  pedestrian up to meet the car, so the scene itself makes some pedestrians run.
- Peak deceleration median 21.2 m/s^2 and peak jerk median 214 m/s^3 are
  physically implausible for braking; possibly kerb impacts, possibly the
  spawn transient. Not usable until explained.
- The run is therefore **not** a valid scene-v2 baseline. Fix the car's
  placement and re-run the smoke test before run 2b or any GE run.
