# Experiment design — the pre-computed space and the participant study

Decided 2026-10-15 (decisions in §10). Builds on docs/paper/study_plan.md.
Files: `scripts/templates/study/study_space.bnf`, `infra/hpc/study/`.

## 1. Questions

The study asks: **given the same evidence, where do competent people agree
about what the failures mean and what to change — and where do they diverge?**

- Q1 Do participants identify the dominant problem? Which obstacles are
  accepted, renamed, rejected or deferred, and by how many?
- Q2 For the same obstacle, who fixes **the car** ([S]) and who **narrows
  the promise** ([R]) — or revises the **assumptions** ([D])?
- Q3 Does anyone revise an assumption, and with what evidence?
- Q4 Which obstacles does everyone ignore?
- Q5 What did each participant's decision produce? (the follow-up run: before
  vs after, per person)

Disagreement is a finding: evidence that the decision needs a human.

## 2. The presented requirement

One requirement, shown to everyone: the baseline requirement's goal and tasks,
with the car of round 2 (`proportional_braking` + `yolov5s`).

```
in scenario where "A pedestrian trying to cross the street."
assuming "fog_density <= 50" & "sun_altitude_angle >= 0" & "initial_separation_m >= 15"
       & "pedestrian_speed_mps <= 3" & "pedestrian on foot"
ensuring "resume_within_s <= 10" & "braking is smooth unless an emergency stop is needed"
```

(`infra/hpc/study/R_study_C1.dsl`; C2-C4 differ only in the two
`performed by` names.)

- Two assumptions are deliberately broken by one level each (§3): fog 70
  breaks `fog_density <= 50`, night (sun -10) breaks `sun_altitude_angle >= 0`,
  so the valid / spurious machinery acts on real data and Q3 has two
  assumptions to argue about.
- The scenario sentence uses no steering keywords (checked:
  `extract_constraints` returns nothing); the space is enumerated.

## 3. The scenario space (enumerated, grid)

| Factor | Levels | n |
|---|---|---|
| pedestrian | Adult, Child | 2 |
| clothing | Light, Dark | 2 |
| crossing direction | LR, RL | 2 |
| fog density | 0, 40, **70** (70 breaks `fog_density <= 50`) | 3 |
| time of day (sun altitude) | 60 day, 10 dusk, **−10 night** (breaks `sun_altitude_angle >= 0`) | 3 |
| road | dry (wetness 0), wet (wetness 80) | 2 |
| occlusion | none, parked car | 2 |
| **scenarios** | | **288** |

Held fixed (stated in the dataset README): car start 20 m before the crossing,
pedestrian steps out to meet the car (trigger 0, timeout 6 s), minimum walking
speed 2.0 m/s, no rain, cloudiness 50, Town01, 25 s cap, path-aware safety rule
in the monitor and the analysis. Car start distance is not a factor (fixed at
20 m).

A flat grammar (`scripts/templates/study/study_space.bnf`; the fixed settings
are literals in it, so every row records them) enumerated in a fixed order:
288 checked. Scenario *k* always has number *k* and seed `random_seed + k`, in
every job and for every car (`REAL_SCENARIO_OFFSET`, §5), so each scenario is a
**paired** comparison across cars.

## 4. Cars and repeats

| Car | Braking | Detector |
|---|---|---|
| C1 (shown) | proportional_braking | yolov5s |
| C2 | path_aware_braking | yolov5s |
| C3 | proportional_braking | yolov5m |
| C4 | path_aware_braking | yolov5m |

- **3 repeats** per scenario per car: CARLA is not deterministic with the same
  seeds, and one borderline scenario flipped between two identical runs
  (end-to-end check, 2026-10-14) — one trial does not settle a case.
- Total: 288 x 3 x 4 = **3,456 simulations**.

**Why four cars:** the car-side mitigations offered in the review are exactly
C2-C4 (a different braking rule, a larger detector, or both). A participant who
chooses one of them gets a follow-up that **already exists, run with the same
scenarios and seeds** — instant, comparable, and honest if labelled as
pre-computed. The car-side mitigations offered in study mode are restricted
to these four cars; a decision outside them (another module, a scene change)
is recorded in decisions.json but not run. How each participant's decision is
run is the study owner's (§8).

## 5. Compute and execution

- Cost estimate (from the runs so far: ~2 min start-up per scenario + ~0.6 min
  per simulation): ~3.8 min per scenario per car → **~18 GPU-h per car, ~73
  GPU-h in all**.
- Execution: per car, 6 jobs of 48 scenarios (list mode, ~3 h each, 5-h limit)
  → 24 jobs, run in parallel (per-job ports and MLflow stores), submitted in
  batches; wall-clock 1-2 days at current queue priority.
- Jobs are **half-chunks** of 24 scenarios (`chunk_<n>a/b.txt`, ~1.5 h, 2.5-h
  limit, offsets 0, 24, ..., 264): 48 jobs, the same total GPU time; short
  jobs start sooner at our fair-share (decided 2026-10-15, after a 5-h job
  waited behind ~800 pending GPU jobs).
- Chunks: `infra/hpc/study/chunks/chunk_<n>.txt`, 48 scenarios each in
  enumeration order. A pedestrian x clothing block is 72 scenarios, so chunks
  do not align with blocks and are **not** balanced (chunk 1: adult, light,
  the first 48 of 72; fog 0/40/70 = 24/12/12); only the full 288 is
  (corrected 2026-10-15). Chunk *n* is submitted with
  `REAL_SCENARIO_OFFSET=48*(n-1)` (0, 48, 96, 144, 192, 240).
- Fixed protocol: one tagged code version for all 24 jobs, the same seeds,
  3 repeats; a code change after the pilot means re-running what ran before it.
- Every job goes through the tool's checks (cluster copy, laptop scene check,
  modules) — submitted from the Run panel or by hand with the same command.
- Integrity: a completeness matrix (288 scenarios x 3 repeats x 4 cars);
  missing cells re-submitted; test defects (left road, pedestrian never in the
  lane, not simulated) listed per cell; the dataset is complete only when every
  cell has 3 valid simulations or a stated reason.
- Pilot first: one 48-scenario job for C1 checked end to end before the rest.

## 6. The dataset

`examples/study_space/` (or a Zenodo archive): per car a run folder (run_meta,
simulations.csv, scenarios.csv, traces, one video per scenario on repeat 1 if
storage allows), the presented requirement, the grammar, a README with schema
and the fixed settings, and the analysis re-computable from the traces with
either safety rule.

## 7. The study session

- **Participants:** ~10, with software-engineering, ML or automotive
  background. Recruitment and ethics: deferred by the study owner (§10).
- **Session (~60-75 min, the same for everyone):**
  1. consent and background questions (5 min);
  2. fixed briefing script and a 10-min guided tour on a training round
     (rounds 1-2, not the study round);
  3. the task (40-50 min): review the study round (C1 on the 288-scenario space)
     in study mode — labelled as pre-computed, the tool's verdicts hidden —
     decide each obstacle (accept / rename / reject / defer + reason + a
     mitigation for each accepted one), rule on each assumption, approve or edit
     the revised requirement, and sign;
  4. three closing questions (useful? clear? would you use it?) (5 min).
- **Controls:** the same screens, material and instructions for everyone; no
  coaching; questions answered but logged (the researcher types them into the
  session log); no hint of which obstacle matters.
- **Recorded per participant** (study/<participant_id>/): decisions.json,
  an append-only interaction log (every verdict and change, reasons, evidence
  opened, time per screen and per decision, questions), R0/R1/diff. Participant
  IDs only; the name key stays outside the repository.
- **Signing gate:** the revised requirement must parse and be executable as
  written (modules exist, quantities known, scenes build), or it cannot be signed.

## 8. Follow-up per participant

Classify each participant's changes: [S] car → the matching pre-computed car
(C2-C4); how it is run is the study owner's (§10); [D] / [R] only → re-judged on the
laptop from C1's traces; [T] → noted, not run. Then a before/after comparison
per participant (compare.py), checking that only that participant's changes
differ. The researcher analyses across participants.

## 9. Order of work

1. ✅ Decisions (§10).
2. ✅ Study requirement + study grammar + 4 car requirement files + 6 chunks;
   laptop check (all 288 scenes build; all 4 cars' modules exist). Pilot job
   (C1, chunk 1): predictions §11, command `infra/hpc/study/README.md`.
3. The remaining 23 jobs; completeness; dataset.
4. Study mode in the interface (study_plan 1b) against the C1 run.
5. Pilot session with one participant; fix; then the sessions.
6. Follow-ups and before/after per participant.

## 10. Decisions (2026-10-15)

1. Night is out of scope too: `sun_altitude_angle >= 0` added (a second
   deliberate break).
2. Car start distance is not a factor: fixed at 20 m (288 scenarios).
3. Follow-ups: the study owner runs each participant's decision; how is
   settled later. The four cars are pre-computed regardless (C1 first, then
   C2-C4 as the follow-ups for car-side decisions).
4. Ethics: deferred.
5. One car per run: C1-C4 are four separate runs over the same 288 scenarios
   and seeds; a run never mixes cars.
6. Car-side mitigations in study mode are restricted to C2-C4; other decisions
   are recorded, not run.
7. Completeness gate (§5) and a pilot before the remaining 23 jobs.

## 11. Pilot — pre-registered predictions (written 2026-10-15, before submission)

Pilot: C1 (proportional_braking + yolov5s), chunk 1 (48 scenarios: adult,
light clothing; the first 48 of that block's 72, see §5),
3 repeats = 144 simulations, submitted as two jobs of 24 scenarios (halves
1a, offset 0, and 1b, offset 24), 2.5-h limit each.

| # | Prediction | Basis |
|---|---|---|
| P1 | 144 simulations recorded (72 per half), none unsimulated; test defects (left road, never in the lane) <= 5 % | scene v3 smokes; run 2b (0 defects) |
| P2 | Each half finishes within 2.5 h; about 1.5 h (24 x ~3.8 min) | timing of runs so far |
| P3 | `fog_density <= 50` broken in exactly 48 of 144, `sun_altitude_angle >= 0` in exactly 48; neither "not measured" | grammar levels |

(The predictions were written for one 48-scenario job; the split changes only
P2's time and the number of jobs, not what is predicted.)
| P4 | Few safety failures: <= 10 % of encounters | proportional braking: 1.9 % in 2b; safe in all 4 v3 smokes |
| P5 | Standoffs dominate: >= 70 % of passes; `resume_within_s <= 10` missed in most simulations | 2b: 147 of 155 passes; v3 smokes froze 3 of 4 |
| P6 (weak) | Any safety failures sit mostly in fog 70 or night | the detector's known weakness |
| P7 | 0 MLflow errors | §8.49 fix |

Gate for the remaining 23 jobs: P1-P3 and P7 hold, and the per-step traces
show a normal crossing at every level (pedestrian reaches the lane, car stays
on the road and in its lane; videos are recorded only for the run's worst
scenario, not per scenario). P4-P6 are findings, not gates.

**Outcome (2026-10-15, `artifacts/study/pilot_check_2026-10-15.md`):** P2, P4,
P5, P7 hold; P3 holds as a check (every verdict matches its scenario's
setting) but its count was wrong (fog 70 is 12 of chunk 1's 48 scenarios,
not 16); P6 not supported (all 3 failures valid, all on a wet road); **P1
fails**: 142 of 144, scenarios 41 and 43 hit the 9-attempt retry limit with 2
simulations each, and the report did not flag it. The gate is not passed
until that is fixed.
