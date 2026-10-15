# The study space: four cars x 288 scenarios x 3 repeats

Design and decisions: `docs/paper/experiment_design.md`.

| File | What |
|---|---|
| `../../../scripts/templates/study/study_space.bnf` | the space: 7 factors, 288 scenarios; fixed settings written as literals |
| `R_study_C1.dsl` | the requirement shown to participants: proportional_braking + yolov5s |
| `R_study_C2.dsl` | path_aware_braking + yolov5s |
| `R_study_C3.dsl` | proportional_braking + yolov5m |
| `R_study_C4.dsl` | path_aware_braking + yolov5m |
| `chunks/chunk_<n>.txt` | 48 scenarios each, in enumeration order; offset `48*(n-1)` |

C1-C4 are identical except for the two `performed by` names.

## Before any job

1. Commit and tag the code version; all 24 jobs run from that one version.
2. Laptop check, per car and chunk (all pass on 2026-10-15):
   `sim_env/bin/python -m scripts.redsl.preflight --search list --scenarios infra/hpc/study/chunks/chunk_1.txt < infra/hpc/study/R_study_C1.dsl`
3. Sync the cluster copy (`infra/hpc/README.md`, section 4b) and the job
   script, only when no job is pending or running.

## Submitting

From the cluster's project directory, one job per car and chunk
(`<c>` = 1-4, `<n>` = 1-6, `<offset>` = 0, 48, 96, 144, 192, 240):

```
sbatch --time=05:00:00 --export=ALL,REAL_SEARCH=list,REAL_TRIALS=3,REAL_REQUIREMENT_FILE=infra/hpc/study/R_study_C<c>.dsl,REAL_SCENARIOS=infra/hpc/study/chunks/chunk_<n>.txt,REAL_SCENARIO_OFFSET=<offset> run_real_av.slurm
```

The offset keeps each scenario's number and seed the same in every job and
for every car. The interface's Run panel does not pass an offset yet: it is
right only for chunk 1 (offset 0).

Pilot first: C1, chunk 1, offset 0. Predictions and the gate for the other
23 jobs: `docs/paper/experiment_design.md` §11.
