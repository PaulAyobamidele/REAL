# Scene v3 smoke check B — proportional_braking (comparison)

Checked 2026-10-13 after a complete pull (4 simulations + video re-run,
traces, frames, best_scenario.mp4, the job log). Same 4 scenarios as check A,
baseline requirement (`proportional_braking`). Completed (one MLflow 500
error in the log, recovered).

| scenario | crossed | closest in the lane (m) | first brake (m) | outcome |
|---|---|---|---|---|
| control (day, dry) | yes | 12.3 | 17.2 | passed — stalled (never drove on) |
| night, wet, rain, parked car, fog 40 | yes | 10.5 | 13.1 | passed — stalled |
| dusk, wet, parked car | yes | 4.8 | 24.3 | failed — brake released; drove on |
| fog 70 | yes | 6.3 | 9.5 | passed — stalled |

Video (dusk, wet, parked car): dusk light, wet road with reflections and
puddles, the parked car on the pedestrian's kerb, the pedestrian crossing in
front of it — scene v3's weather and occlusion work in CARLA.

Reading (one trial each): proportional braking stays safe in 3 of 4 but
freezes (standoff); path_aware_braking (check A) drives on but fails safety.
A trade-off between safety and progress — the shift of failure mode the
REAL paper predicts for mitigations.
