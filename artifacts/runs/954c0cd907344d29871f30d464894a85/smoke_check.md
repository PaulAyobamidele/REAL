# Scene v3 smoke check A — path_aware_braking

Checked 2026-10-13 after a complete pull (simulations.csv with 4 rows, 4 traces,
run_meta.json, scenarios.csv, the job log). 4 scenarios (control; night + wet +
rain + parked car + fog 40; dusk + wet + parked car; fog 70), 1 trial, the
baseline requirement with `performed by "path_aware_braking"`. Ran in parallel
with check B on another node, each with its own ports.

**All 4 simulations ran; the job then failed** on MLflow logging (`log-batch`
→ HTTP 500) after the last scenario: both jobs wrote to the same MLflow
file store at once. No video, `run_meta.json` left at status "running". The
simulation rows and traces are complete.

| scenario | crossed | closest in the lane (m) | first brake (m) | outcome |
|---|---|---|---|---|
| control (day, dry) | yes | 3.3 | 6.5 | failed — detected too late; drove on afterwards |
| night, wet, rain, parked car, fog 40 | no* | 2.1 | never | car drove through without braking |
| dusk, wet, parked car | yes | 4.8 | 11.3 | failed — brake released; drove on afterwards |
| fog 70 (past the assumed 50) | no* | 1.6 | never | car drove through without braking |

\* "not crossed" because the car arrived as the pedestrian stepped into the
lane — the pedestrian was in the lane (closest in-lane distance 2.1 / 1.6 m).
Since the rule change of the same day these are judged as encounters: the
night run is `never_detected`, the fog-70 run `detected_not_braked`.

Reading (one trial each — a lead): path_aware_braking no longer freezes (it
drives on in every run), but it brakes late or not at all — it only reacts to
a person it estimates in the lane, which at night and in thick fog it does not
see in time.
