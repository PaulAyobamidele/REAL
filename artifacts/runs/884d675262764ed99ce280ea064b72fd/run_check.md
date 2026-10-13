# First GE run — run `884d675262764ed99ce280ea064b72fd`: first reading

Checked 2026-10-08 after a complete pull (simulations.csv, 24 traces incl. the
video re-run, frames, best_scenario.mp4, generations.csv, the job log).
COMPLETED in 1 h 16 min. GE over `v2/scene_v2.bnf` (21,120 scenarios),
population 12, 4 generations, 1 trial per new scenario, `R_baseline.dsl`,
proportional_braking + yolov5s. Reports: `analysis_report.md` (safety margin
anywhere — the rule GE's fitness used) and `path_aware/analysis_report.md`.

## The search worked as a search

- 23 distinct scenarios simulated (repeats reused, not re-simulated).
- Average pass rate per generation: 92 % → 75 % → 75 % → 58 % → 42 % — GE
  steered towards scenarios scored as failures.
- It went beyond the baseline assumptions as designed: 16 of 23 simulations
  break at least one (fog > 50 in 14, a sustained pedestrian speed > 3 m/s in
  8, a start closer than 15 m in 1) — the broken-assumption cases rounds 1-2
  never produced.

## But what it found were scoring artefacts, not car failures

- Margin anywhere (GE's fitness): 4 failures, **all among the spurious runs**
  (fog > 50 and/or a fast pedestrian); 0 of the 7 in-scope encounters failed.
- **Path-aware rule: 0 failures at all.** Every simulation GE scored as a
  failure was the car coming within 5 m of a pedestrian who was *not* in its
  path (the far-pavement case found in run 2b).
- So GE optimised the monitor's 5 m-anywhere rule — it **bred scenarios that
  exploit the flaw in the safety rule**, not the car's weaknesses. A textbook
  case of a search exploiting its oracle; it says nothing yet about where the
  car fails.
- All 7 in-scope encounters stalled (the standoff again); assumption verdicts
  all "insufficient data" (too few runs on each side).

## Consequences

- The GE grid check is not worth running on this run: GE's "worst" scenarios
  are artefacts of the rule.
- Before GE (or round 3) produces evidence about the car, the **monitor
  itself** (the fitness and the pass/fail written on the cluster) must use the
  safety rule the requirement means — the path-aware rule if the review
  chooses it. The re-judge on the laptop fixes reports; only the monitor
  fixes what GE searches for.
