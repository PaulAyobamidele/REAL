# The engineering story of the REAL tool — what, why, how

*Written 2026-10-08 for Paul (and as raw material for the paper's §3). Each
part says **what** the tool does, **why** it does it, and **how** — with the
file to read. Detailed history and every decision: Notes.md §8.*

---

## 0. The question the tool answers

A machine-learning system (here: a car that brakes for pedestrians using
YOLO) fails in simulation. **What should we change — the data, the model, the
system around it, the requirement, or what we assumed about the world?** The
REAL paper (arXiv:2606.31589) answers this with a loop — identify failures,
analyse them as obstacles, mitigate across layers — but did the analysis by
hand. The tool automates the loop and records every decision.

## 1. The pipeline at a glance

```
requirement (.dsl) → scenario search → simulation on Narval → telemetry
   → judging each run (§5) → obstacles (§7) → human review (§9)
   → next requirement R1 (§9) → next round, linked to the decision (§10)
```

| Stage | Main files |
|---|---|
| Requirement language | `scripts/redsl/grammar.py`, `docs/examples/*.dsl` |
| Search | `scripts/evolve/grid.py` (all scenarios), `scripts/evolve/ge.py` (GE) |
| Scene + execution | `scripts/scenarios/scratch.temp`, `scripts/simulations/util.py`, `infra/hpc/` |
| Telemetry | `scripts/analysis/telemetry.py` → `simulations.csv`, `traces/` |
| Judging | `scripts/analysis/failure_model.py`, `admissibility.py`, `soft_goals.py` |
| Obstacles | `scripts/analysis/obstacles.py` |
| Report / comparison | `scripts/analysis/report.py`, `compare.py`, `grid_check.py` |
| Review / revision | `pages/4_review.py`, `scripts/analysis/review.py`, `decisions.py`, `refine.py` |
| Demo | `scripts/demo.py`, `Dockerfile`, `examples/demo_runs/` |

## 2. The requirement — three things kept apart

**What.** A KAOS-style text naming the goal, the system that performs it
(`performed by`), the scenario, the **domain assumptions** (`assuming`) and
the **soft goals** (`ensuring`).

**Why.** The paper's core relation is *D, S ⊨ R*: given the world behaves as
assumed (D), the system (S) delivers the promise (R). To say whose fault a
failure is, the three must be written down separately. Rounds 1-2 had no D
and no soft goals — so every failure was blamed on the car by default.

**How.** A Lark grammar parses the text; `performed by` selects the braking
behaviour and YOLO weights the simulation runs; `assuming` items are checked
after each run (§5); `ensuring` items are checked as soft goals (§6). An
assumption that names the car (any quantity starting with `ego`) is
**refused** — otherwise one could write "assuming the car drives slowly" and
define every failure away (`admissibility.parse_assumption`).

## 3. Scenario search — grid and GE

**What.** Turns the requirement into many concrete situations to simulate.

**Why two searches.** The **grid** (`old.bnf`, 32 scenarios) runs every
situation equally often — fair, comparable rounds. **GE** (grammatical
evolution, `scene_v2.bnf`, 21,120 scenarios) breeds situations that make the
car fail — it finds hard cases but samples unevenly. The GE grammar
deliberately goes **beyond the stated assumptions** (fog up to 100, cars
starting 10 m away, pedestrians at 4 m/s) so the tool can learn whether the
assumptions matter.

**How.** GRAPE/DEAP evolve strings of the grammar; each string becomes a
Scenic program (`util.build_scenario`). A scenario GE has already simulated
is not simulated again. GE scenarios get a short hash label so they can be
file names.

## 4. Executing a scenario — and making the test trustworthy

**What.** Each scenario is simulated in CARLA, with the car's camera image fed
to YOLO every step and the braking behaviour deciding the brake.

**Why on a cluster.** CARLA and YOLO need a GPU; Narval runs them in an
Apptainer container under Slurm. Our code is overlaid on the container
(`$SCRATCH/real_project/REAL`), so code changes need no image rebuild.

**How the scene is built (scene v2.3).** The pedestrian starts at a kerb,
waits, then walks to a point on the far kerb (steered by position every
step). It steps out when the car is due to arrive ("meet the car") or after
6 s anyway. The car starts 20 m (Short) or 35 m (Long) before the crossing,
on the pedestrian's own lane, facing along it. A run ends 20 m past the
crossing or after 25 s.

**Why it looks like this — five defects found and fixed** (Notes §8.19-8.38):
the pedestrian used to wait until the car was 8 m away (late braking built
in); one crossing direction never crossed; the distance setting did nothing;
the car could start facing away and drive off the road; the pedestrian walked
away from the road (a heading mirrored between Scenic and CARLA); then it
crossed before the car arrived. Each was caught by a short test run and the
video frames. The **laptop check** (`tests/test_scene_compile.py`) now builds
the real scenes on a laptop in 6 s before any cluster time is spent.

**What is recorded every step** (`telemetry.py`): car–pedestrian distance,
car speed, YOLO confidence and inference time, every brake command, the
pedestrian's speed and position across the road, the car's heading against
its lane, and whether it is on the road. From these, per simulation:
closest approach, first detection and first brake (distance, speed),
braking smoothness (peak deceleration, jerk), time-to-collision, whether
and when the car moved on, whether the pedestrian crossed.

## 5. Judging a run: how spurious and admissible failures are told apart

This is the heart of the tool. Every simulation goes through a funnel, in
this order:

**Step 1 — Did the safety rule hold?** The rule is "the car stays more than
5 m from the pedestrian". The monitor computes rho = closest distance − 5 m
(`util.MyMonitor`, signal temporal logic `G safe`). rho > 0 → **pass**;
otherwise → **fail**. Only the pedestrian counts (an early bug measured the
distance to a roadside vending machine).

**Step 2 — Was it a real test at all? (test defects, set aside)**
(`failure_model.classify_failure`, in this order)

| Outcome | Rule | Why set aside |
|---|---|---|
| `left_road` | the car left the drivable area | the test broke, not the car |
| `not_crossed` | the pedestrian never got 1 m past the lane centre | nobody was in the car's path |
| `no_encounter` | passed, never came within 10 m, never saw the pedestrian | the car and pedestrian never met |
| not simulated | the scenario left no row (the simulator rejected every attempt) | no data; listed by name in the report |

These are **never counted as passes or failures** — they are excluded from
every rate and reported separately with a warning. Everything else is a
**real encounter**.

**Step 3 — Was the scenario in the test's intended scope? (rules file)**
`scripts/analysis/admissibility_rules.json` lists out-of-scope settings
(e.g. fog > 80). A matching simulation is set aside, with the rule named. This
is the **[T]** lever: scope decisions about the test, not the requirement.

**Step 4 — Did the world keep the requirement's assumptions? (spurious vs
admissible)** (`admissibility.check_assumptions`) For every machine-readable
`assuming` item and every simulation:

- **held** — the assumption was true in this run;
- **broken** — it was false;
- **not measured** — the quantity was not recorded in this run (never
  counted as held).

Scenario-level assumptions (e.g. `fog_density <= 50`) are checked against the
scenario's settings; run-level ones (e.g. `initial_separation_m >= 15`,
`pedestrian_speed_mps <= 3`) against what was measured in that simulation.

- A failure with **any assumption broken** is **spurious**: the world broke
  the deal; the report names the broken assumption.
- A failure with **every assumption held** (or not measured) is
  **admissible / valid**: it belongs to the car, and it is the only kind that
  feeds the obstacle analysis.
- Free-text assumptions are shown to the reviewer, not checked; refused ones
  are listed as rejected and change nothing.

This is the paper's Φ_valid made concrete: the requirement's own text
decides admissibility, run by run.

**Step 5 — How did a valid failure happen?** (failure type, in this order)
`never_detected` (the car never reacted) → `detected_not_braked` →
`detected_too_late` (first brake closer than the stopping distance
v²/(2·8 m/s²) + 5 m) → `brake_released` (braking stopped before the closest
point) → `braking_insufficient` → `stopped_too_close`. Passes are split into
`passed` and `passed_stalled` (stopped and never moved again — the standoff).

**Worked example.** Requirement assumes `initial_separation_m >= 15`. A
simulation where the car started 12 m away and hit the pedestrian is a
failure, but **spurious** (assumption broken). The same collision from 20 m
away is **valid** — the car's fault — and, if the pedestrian was detected at
6 m while the car needed 8 m to stop, it is typed `detected_too_late`.

## 6. Soft goals — measuring the promise beyond safety

**What.** `ensuring` items such as `resume_within_s <= 10` are checked per
valid encounter: met, missed, or not measured (`soft_goals.py`).

**Why.** Round 2 satisfied safety by never driving on. Without a soft goal the
requirement could not say that was wrong.

**How.** From the speed trace: `resume_within_s` = 0 if the car never stopped,
the seconds until it reached 2 m/s again, or infinity if it never did.
Smoothness (peak deceleration, jerk, skipping the first second and any time
off the road) and time-to-collision are measured; the jerk threshold for
"smooth" is a requirement decision still to make.

## 7. From failures to obstacles

**What.** Valid failures are grouped into named **obstacles** (KAOS: a
condition that stops the goal), each with evidence and a verdict:
supported / not supported / insufficient data (`obstacles.py`).

**Why.** "91 failures" is not actionable; "the pedestrian is detected at 7 m
but the car needs 8 m to stop" is.

**How.** Two kinds of evidence, with the same stated bars throughout
(a judgement call, not a significance test):
- **setting effects** — failure rate with a setting minus without
  (e.g. dark clothing), supported at ≥ 15 points with ≥ 10 encounters on each
  side; strong effects without a catalogue entry become unnamed candidates;
- **failure-type shares** — e.g. DetectionTooLate is supported when
  detected-too-late failures dominate.
Each obstacle carries mitigations per layer: data, model, system,
requirement, scenario.

**Assumption verdicts** use the same bars: for each assumption, failure rate
when held vs broken → **load-bearing** (≥ 15 points more failures when
broken), **not load-bearing**, **untested** (never broken — no evidence to
loosen it), **insufficient data**, **not measured**.

## 8. Comparing rounds — one change at a time

**What.** `compare.py` puts two runs side by side and checks that only the
intended thing changed.

**Why.** Otherwise "failures fell" could come from a changed scene, grammar
or requirement, not the mitigation.

**How.** Every run's `run_meta.json` records the requirement, system under
test, scene, grammar and template checksums, seed and parent run. The
comparison flags every other difference unless it was inspected and allowed
with a written reason. Outcomes are classified per obstacle: resolved,
**masked** (gone only because the situation no longer arises — e.g. round 2's
slower approach), persisting, new, or shifted.

## 9. The human decides; the tool writes it down

**What.** A 5-screen review page (and a terminal version): what we asked →
what happened → what pattern → what you decide → what the requirement
becomes.

**Why.** The paper insists refinement is human-driven; the tool's job is to
make the decision informed and recorded.

**How.** Verdicts per obstacle (accept / rename / reject / defer + a
mitigation), per scope item, and per assumption (keep / tighten / loosen /
drop / add) go into `decisions.json`. `refine.py` turns them into `R1.dsl`
with every change labelled **[S]** car, **[R]** promise, **[D]**
assumptions, **[T]** test, and a diff. Loosening an assumption that was never
broken is flagged as having no evidence. Nothing is applied automatically.

## 10. Traceability and honesty — the engineering habits

- **Provenance**: each run records its parent run and the requirement file
  that the decision produced.
- **Pre-registered predictions** before each run (Notes §8.8, §8.37).
- **GE caveat**: reports on GE runs say sampling was uneven, count each
  scenario once alongside raw rates, mark findings as leads; the **grid
  check** re-runs GE's best and worst scenarios fairly.
- **Results are files**, never only chat; partial or hypothetical results
  carry a banner; original reports are never overwritten (re-judging writes
  to a labelled subfolder, e.g. `baseline_D0/`).
- **Tests**: 160+ automated tests, none needing the simulator; the laptop
  scene check before every cluster run.
- **Demo**: `docker run` reproduces the laptop-side loop on the real rounds
  1-2 in about a minute.

## 11. Where the evidence stands (8 Oct)

Rounds 1-2 (old scene, with caveats); the scene validated by five test runs;
**run 2b and the first GE run are on Narval now**; round 3 (D, S and R
together) follows the review. Timeline: docs/paper/master_plan.md.
