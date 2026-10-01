# Domain assumptions: baseline, per-assumption failure analysis, revision

Status: agreed 2026-09-30 (Paul). Step 1 (analysis side) in progress; steps 2-4 later.
Why: the REAL loop adapts the car (S), the promise (R) **and** the domain
assumptions (D). Until now D existed only as an empty slot: R0 for rounds 1-2
stated no assumptions, so every failure was "valid" by construction and the
paper's valid/spurious split (Phi_valid) never ran on real data.

## The distinction that keeps it honest

A **domain assumption** is about the world the car drives in - the pedestrian,
the weather, the road, where things start - never about the car. "The
pedestrian walks at <= 3 m/s" is a domain assumption; "the car detects the
pedestrian at >= 8 m" is not (it is the behaviour under test). A broken
assumption is the world's doing; a failure with every assumption holding is
the car's. Assumptions about the car (e.g. `ego_speed`) are rejected by the
parser of assumptions with a message, not silently accepted - otherwise
failures could be defined away by narrowing the car's own behaviour.

## Syntax (unchanged grammar)

```
assuming "fog_density <= 50" & "initial_separation_m >= 15" & "pedestrian_speed_mps <= 3" & "daylight, dry road"
```

Each item is one of:

| kind | example | checked how |
|---|---|---|
| scenario assumption | `fog_density <= 50` | against the grid setting of each scenario |
| run assumption | `initial_separation_m >= 15` | against a quantity measured in each simulation (telemetry / traces) |
| free text | `"daylight, dry road"` | not checked; shown to the human |
| rejected | `ego_speed <= 5` (about the car), `sun_angle > 3` (unknown) | flagged in the report, not used |

Operators: `<= < >= > == !=`. The vocabulary of quantities
(`scripts/analysis/admissibility.py::QUANTITIES`):

| quantity | level | unit | source | available |
|---|---|---|---|---|
| `fog_density` | scenario | % | grid | yes |
| `pedestrian`, `dress`, `direction`, `distance` | scenario | - | grid | yes |
| `initial_separation_m` | run | m | trace `distance_m[0]` | yes (rounds 1-2 traces) |
| `pedestrian_speed_mps` | run | m/s | template recording | **not yet** (step 2) |
| `crossing_start_distance_m` | run | m | template recording | **not yet** (step 2) |

An assumption whose quantity is not measured in a run is reported as "not
measured", never as held.

## Baseline D0 (loose on purpose)

`docs/examples/R_baseline.dsl` (to be written in roadmap M1.7; carries D0 **and** baseline soft goals in `ensuring`, per the 2026-10-01 supervisor meeting) = R0 plus

```
assuming "fog_density <= 50" & "initial_separation_m >= 15" & "pedestrian_speed_mps <= 3"
       & "daylight, dry road" & "pedestrian on foot"
```

Covers the whole grid and ordinary walking. In rounds 1-2 only 6 / 8 of 160
simulations start closer than 15 m. Rounds 1-2 may be re-analysed against D0,
labelled **"D0 stated after the run"**, written to a subfolder
(`artifacts/runs/<run>/baseline_D0/`); R0 itself is never rewritten.

## Failure analysis per assumption

Per simulation: held / broken / not measured for every checkable assumption;
spurious if any is broken (the report names which). Real requirement
violations are the failures with every assumption holding.

Per assumption (over true encounters): times broken, failure rate when held vs
broken, and a verdict:

- **load-bearing** - failures >= 15 points more frequent when broken (the
  requirement depends on it)
- **not load-bearing** - within +-15 points (a candidate for loosening)
- **fewer failures when broken** - <= -15 points (worth a look: the
  assumption may be pointing the wrong way)
- **insufficient data** - broken or held in fewer than 10 encounters
- **untested** - never broken in this run (no evidence either way; loosening
  it has no support)
- **not measured** - the quantity is not recorded

Same bars as the rest of the analysis (15 points, 10 per side): a stated
judgement call, not a significance test.

## Revision (D0 -> D1)

Each assumption becomes a review item: **keep / tighten / loosen / drop**
(tighten and loosen need the new text), and the reviewer can **add**
assumptions. `refine.py` writes them as `[D]` changes:

| verdict | assumption was in R0 | assumption was stated after the run |
|---|---|---|
| keep | no change | added to R1 |
| tighten / loosen | replaced in R1 | new text added to R1 |
| drop | removed from R1 | nothing |
| added | added | added |

Loosening an assumption whose verdict was "untested" is flagged in
`requirement_diff.md` as having no evidence behind it.

## Steps

1. Analysis side (this doc's scope): vocabulary, per-simulation checks, trace-derived
   `initial_separation_m`, the report section, review items (CLI + page),
   refiner, `R_baseline.dsl`, re-analysis of rounds 1-2 "after the fact". Tests.
2. Template recordings (`pedestrian_speed_mps`, `crossing_start_distance_m`) in
   `scratch.temp` + `telemetry.py`, together with the 8 m trigger /
   no-encounter / dead-`distance` fixes.
3. Run 2b under D0.
4. Round 3.
