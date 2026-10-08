# Scene v2.2 quick check — job 4885691, run `a9bd6134ab3c40d885039341d7f59f6c`

Checked 2026-10-07. Complete pull: simulations.csv (4 + video re-run), traces,
124 frames, best_scenario.mp4, log `artifacts/real-av-carla-4885691.out`.
COMPLETED, 14 min 32 s (start 08:20:57 Narval time). `REAL_SEARCH=list` with
`infra/hpc/smoke_scenarios.txt` (Adult, Light, fog 0; LR/RL x Short/Long),
1 trial each, `R_baseline.dsl`, proportional_braking + yolov5s.

| scenario | crossed | lateral start → end (m) | closest approach (m) | car on road |
|---|---|---|---|---|
| LR Short | **yes** | −2.8 → +3.9 | 8.0 | yes |
| RL Short | **yes** | +3.2 → −4.2 | 12.7 | yes |
| LR Long | **yes** | −3.1 → +3.9 | 6.8 | yes |
| RL Long | **yes** | +3.3 → −4.1 | 21.6 | yes |

**The crossing works in both directions** (CrossToKerb, Notes §8.32): the
pedestrian goes from one kerb to the other within ~2 s and stops there.
Video frames 1-8 agree (the figure moves from the left of the road to the right).

**New design problem — no real conflict.** With the default trigger (100 m =
step out at once) and a walking speed of 2.0 m/s, the pedestrian is across
the road about 2 s after the start, before the car (20 or 35 m away, slowing
as soon as it sees a person) reaches the crossing point. All 4 "passes" mean
the road was empty when the car arrived, not that the car coped. The speed
matching only ever speeds the pedestrian up (as in CrossingBehavior), so it
cannot delay the crossing. Every run also hit the 25 s limit (the car stopped
or crawled): the standoff/stop-start behaviour of proportional braking again.

Not usable as results. Next: make the pedestrian step out when the car is
close enough that their paths actually meet (a trigger tied to the car's
time to reach the crossing point, with a timeout so a stopped car cannot
freeze the pedestrian), then the full 32-scenario smoke run.
