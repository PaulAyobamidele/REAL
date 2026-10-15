# Pilot check: car C1, chunk 1 (scenarios 0-47), 3 repeats — 2026-10-15

Runs: `artifacts/runs/8ee4732cd82f426fa7ac9653c5aa71a5` (half 1a, scenarios
0-23) and `artifacts/runs/0a321e41e4444b86b5824123bfee2350` (half 1b,
scenarios 24-47). Code `study-v1`. Both jobs completed in 1 h 20 min.
Analysis: `scripts.analysis.report` on each run (path-aware safety rule).
Predictions: `docs/paper/experiment_design.md` §11 (written before submission).

## Outcome per prediction

| # | Prediction | Outcome | Verdict |
|---|---|---|---|
| P1 | 144 simulations, none unsimulated; test defects <= 5 % | **142 of 144**: scenarios 41 and 43 have 2 simulations, not 3 (see below). Defects: 2 of 142 (1.4 %), both "pedestrian never entered the lane" (scenario 36); 0 left the road | **fails** (completeness) |
| P2 | each half within 2.5 h, about 1.5 h | 1 h 20 min each | holds |
| P3 | each broken assumption in exactly 48 of 144; none "not measured" | Every verdict matches the scenario's own setting (142 of 142; 0 not measured). Counts: night 48, fog 70 **36**: the prediction's 48 was wrong because chunk 1 holds 12 fog-70 scenarios, not 16 (see "Chunk composition") | holds (the count in the prediction was wrong, not the check) |
| P4 | safety failures <= 10 % of valid encounters | 3 of 68 (4.4 %) | holds |
| P5 | standoffs >= 70 % of passes; resume goal missed in most | 63 of 65 valid passes stalled (97 %); `resume_within_s <= 10` missed in 41 of 68 valid simulations (60 %) | holds |
| P6 (weak) | failures mostly in fog 70 or night | All 3 failures are valid (fog 0, day or dusk) and all on a **wet road** (wetness 80): brake released (scenario 6 twice, scenario 38 once) | not supported |
| P7 | 0 MLflow errors | 0 in both logs | holds |

Trace checks: no simulation left the road; maximum lane offset 0.29 m;
maximum heading off the lane 2.9 deg; the pedestrian crossed in 139 of 142.

## The two missing simulations

Scenarios 41 and 43 (both: crossing right to left, dusk, parked car; dry and
wet road) stopped at 2 of 3. REAL's `falsify` retries a simulation that
returns no result (Scenic could not create or complete it) up to 3 x trials
= 9 attempts; both scenarios used all 9 and got 2. The log does not say why
(VerifAI prints the reason only at verbosity >= 1). The analysis report does
not flag the shortfall: its "not simulated" list holds only scenarios with 0
simulations, so a scenario with fewer than requested is invisible unless
counted.

## Chunk composition (correction)

Each pedestrian x clothing block is 72 scenarios (direction 2 x fog 3 x sun
3 x road 2 x occlusion 2), so the 48-scenario chunks do not align with the
blocks: chunk 1 is the first 48 of the 72 adult-light scenarios (LR all 36,
RL 12), with fog 0/40/70 = 24/12/12. Only the full 288 is balanced. Earlier
text saying each chunk covers every combination was wrong.
