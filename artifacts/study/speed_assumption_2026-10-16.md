# The pedestrian-speed assumption was broken by the system under test — 2026-10-16

## Finding

The study requirement assumed `pedestrian_speed_mps <= 3`. The scene's
"meet the car" behaviour (`CrossToKerb` in `scripts/scenarios/scratch.temp`)
sets the walking speed from the car's: `walk_speed = max(min_speed,
|lateral gap| x car_speed / distance ahead)`. A car that keeps its speed makes
the pedestrian walk faster, past 3 m/s, so the assumption broke **because of
the car's behaviour**, and that car's failures were excused as spurious.

Simulations with speed > 3 m/s (and the raw failures among them) in the
merged rounds, judged against the original requirement:

| Car | speed > 3 m/s | of which failures |
|---|---|---|
| C1 | 42 | 26 |
| C2 | 463 | 455 |
| C3 | 15 | 9 |
| C4 | 443 | 432 |

In most of these the pedestrian was already above 3 m/s before the closest
approach (C2: 408 of 463), so it is the walking behaviour, not a collision
throwing the pedestrian. A domain assumption must hold independently of the
system (D, S |= R); this one did not.

## Decision (study owner, 2026-10-16)

Remove the assumption from the study requirement: `infra/hpc/study/R_study_v2_C1..C4.dsl`
(the originals stay; they are what the runs recorded). Assumptions only judge,
they do not change a simulation, so the rounds are **re-judged, not re-run**:
`artifacts/study/rounds/C<n>/judged_v2/` (the merged-round reports judged
against the original requirement stay in place, unused).

## Results, re-judged (v2 requirement, path-aware safety rule)

| Car | Valid encounters | Failures | Failure rate | Passes that stalled | Resume goal missed | Out of scope | Test defects |
|---|---|---|---|---|---|---|---|
| C1 proportional + yolov5s | 376 | 22 | 5.9 % | 332 of 354 | 251 of 376 | 481 | 7 |
| C2 path-aware + yolov5s | 375 | 349 | 93.1 % | 2 of 26 | 3 of 375 | 481 | 8 |
| C3 proportional + yolov5m | 376 | 6 | 1.6 % | 361 of 370 | 221 of 376 | 481 | 7 |
| C4 path-aware + yolov5m | 375 | 335 | 89.3 % | 1 of 40 | 5 of 375 | 481 | 8 |

Out of scope is now the same for every car (the fog-70 and night scenarios,
480, plus one simulation with the initial separation under 15 m), as the grid
dictates. Proportional braking is safe but freezes; path-aware braking drives
on but fails most valid encounters; the larger detector helps the
proportional car.

For the paper: the tool exposed an assumption that the system itself can
break; the check that caught it (assumption broken far more often for some
cars than others on identical scenarios) is a candidate feature.
