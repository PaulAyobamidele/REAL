# Scene v2.1 smoke check — job 4779526, run `7ee91f4d1770480eae9c2891a240a25c`

Checked 2026-10-06. Complete pull: simulations.csv (30 simulations + the video
re-run), 31 traces, 46 frames, best_scenario.mp4, log
`artifacts/real-av-carla-4779526.out`. Job COMPLETED (1 h 21 min) on
2026-10-06 (start 07:19:45 Narval time). Requirement docs/examples/R_baseline.dsl;
proportional_braking + yolov5s; 1 trial per scenario. Report: analysis_report.md here.

| criterion | result |
|---|---|
| `STATUS: OK`, scene builds on Narval | **pass** (the compile error of job 4385790 is gone) |
| car stays on the road | **pass** — `left_road` False in all 30 recorded runs |
| no-encounter near 0 | **pass** — 0 |
| `distance` changes the scene | **pass** — initial separation Short 20.0 m, Long 35.3 m |
| every scenario simulated | **FAIL** — scenarios 23 and 27 (both Child, Dark, RL: #23 Short, fog 50; #27 Long, fog 0 — corrected 2026-10-07 from the report's listing) logged "no simulation could be created in 3 attempts" (CARLA spawn; "destroy an actor that is already dead") and left **no row** — silently |
| **pedestrian crosses the road** | **FAIL** — video (Adult, Light, LR, Short): the pedestrian starts at the left edge of the road and walks/runs **left, away from the road**, across the pavement (zoomed frames 1-17). Nobody is in the road. |

## What follows

- **No outcome number of this run is usable**: 0 failures in 30 encounters
  and 7 standoffs reflect a pedestrian who never enters the road.
- The car does not leave the road any more, and drives on (frame 40).
- One run (scenario 0) drifts 11.6 m from its lane *after* passing the
  crossing point, into the next lane: the lane-offset measure is relative to
  the original lane — harmless, still on the road.
- The car's speed trace stop-starts (e.g. 2.0 → 0 → 0.1 → 1.4 → 2.6 → 0 → 1.9 m/s)
  as proportional braking switches on and off with the detector's confidence;
  that is what produces the extreme deceleration values (median 21.6 m/s²,
  max 53 m/s²) — a lead about the braking rule, to be re-checked on a valid scene.
- Braking starts at a median 20.0 m, i.e. as soon as the car starts.

## Cause of the wrong walking direction (open)

In Scenic the pedestrian is placed at the left kerb facing across the road
(the laptop check, tests/test_scene_compile.py, confirms this), and the
position is right in CARLA (it starts on the left). The walking direction is
mirrored somewhere between Scenic and CARLA; the vendored conversions
(`setWalkingDirection`, `scenicToCarlaVector3D`, `carlaToScenicOrientation`)
look mutually consistent on reading, so the exact cause is not identified.
Fix proposed: steer the pedestrian towards a target point on the far kerb by
position each step (no dependence on the heading round trip), and record the
pedestrian's lateral position so every run says whether it crossed.
