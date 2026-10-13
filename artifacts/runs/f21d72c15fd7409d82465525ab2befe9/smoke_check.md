# Scene v2.3 quick check — job 4968144, run `f21d72c15fd7409d82465525ab2befe9`

Checked 2026-10-08. Complete pull: simulations.csv (4 + video re-run),
traces, frames, best_scenario.mp4, log `artifacts/real-av-carla-4968144.out`.
COMPLETED, 14 min 38 s (start 02:32:52 Narval time; resubmitted with a 45-min
limit after job 4966321 was cancelled). `REAL_SEARCH=list`,
`infra/hpc/smoke_scenarios.txt` (Adult, Light, fog 0; LR/RL x Short/Long),
1 trial, `R_baseline.dsl`, proportional_braking + yolov5s.

| scenario | crossed | ped. starts (step) | car then: distance / speed | closest (m) | resumed within 10 s |
|---|---|---|---|---|---|
| LR Short | yes | 63 | 13.0 m / 0.0 m/s | 10.1 | yes (6.9 s) |
| RL Short | yes | 63 | 12.2 m / 0.0 m/s | 11.8 | no (never) |
| LR Long | yes | 63 | 10.0 m / 0.0 m/s | 9.2 | no (never) |
| RL Long | yes | 63 | 8.8 m / 0.0 m/s | 8.2 | no (never) |

Car on the road in all 4; all passed the safety rule (> 5 m).

**Scene mechanics: pass.** The pedestrian waits at the kerb, then crosses
kerb to kerb in both directions; the car stays on its lane; the trigger and
the 6 s timeout work.

**What it shows about the car (one trial each — a lead, not a result):**
proportional braking brakes for any person it sees above 30 % confidence,
so the car **stops 9-13 m short while the pedestrian is still standing on
the kerb** (first brake 14-36 m). The "meet the car" condition therefore never
fires (the stopped car's time to arrive is unbounded) and the pedestrian goes
on the 6 s timeout (step 63 in all runs). Afterwards **3 of 4 cars never move
on** while the pedestrian stands visible on the far kerb — the standoff of
round 2, now measured on a valid scene. With emergency braking (85 % bar,
round 1's system) the car would not stop at the kerb, and the pedestrian
would step out to meet it — the case the trigger was built for.

Test-design note: the pedestrian stops at the far kerb after crossing and
stays in view. A person waiting by the road is realistic, and a car that will
not pass a person standing on the pavement is a genuine weakness of the
braking rule; but the share of standoffs depends on this choice, so the paper
must state it.
