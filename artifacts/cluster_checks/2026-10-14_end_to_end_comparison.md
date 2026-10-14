# End-to-end check of Run test (study-plan task 1a.6), 2026-10-14

Same requirement (R_baseline), same 4-scenario list (infra/hpc/smoke/scenarios_v3.txt),
1 run per scenario, 45-minute limit - once by hand, once from the interface.

| | by hand | from the interface |
|---|---|---|
| run | 0a0c13e60916417bbc1d08acbd846aeb | 82e6a075e02746fab0d89e0525d81358 |
| submit line | `sbatch --time=00:45:00 --export=ALL,REAL_SEARCH=list,REAL_SCENARIOS=infra/hpc/smoke/scenarios_v3.txt,REAL_TRIALS=1,REAL_REQUIREMENT_FILE=docs/examples/R_baseline.dsl run_real_av.slurm` | `sbatch --parsable --time=00:45:00 --export=ALL,REAL_REQUIREMENT_FILE=requirements/R_baseline_ui.dsl,REAL_SEARCH=list,REAL_TRIALS=1,REAL_SCENARIOS=infra/hpc/smoke/scenarios_v3.txt run_real_av.slurm` |
| queue wait / run time | 51 min / 34 min | 51 min / 15 min |
| ended | COMPLETED, STATUS OK | COMPLETED, STATUS OK |

**Same:** the files in the run folder (run_meta.json, scenarios.csv, simulations.csv,
traces/, frames/, best_scenario.*, job_log.out, analysis_report.*, cluster_map.json);
in run_meta.json: mode, n_scenarios, trials_per_scenario, seed, scene, grammar and
template sha256, scenario_source, system_under_test (proportional_braking, yolov5s),
constraints, status; the requirement's goal tree (the texts differ only in comment
lines: loading a .dsl into the editor drops comments); 5 simulations each (4 + the
best-of-run video), seeds 42-45, nothing "not simulated"; the analysis (path rule).

**Different, as expected:** run id, timestamps, requirement_source (the saved copy
`requirements/R_baseline_ui.dsl`), and the interface run's `partial/` folder - two
partial reports written while it ran (after 2 of 4, after 4 of 4), labelled PARTIAL.

**Different, worth knowing:** the measured values. Same seeds, but CARLA is not
deterministic. Robustness (path rule) per scenario, hand vs interface:
7.25 / 7.74, 5.51 / 3.99, **-0.22 / +0.03**, 1.32 / 1.32. Scenario 3 failed by hand
and passed (by 3 cm) from the interface: a borderline case one trial cannot settle.
