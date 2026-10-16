# Study space: completeness check — 2026-10-16

**Complete.** 288 scenarios x 4 cars = 1,152 cells; every cell has exactly 3
simulations from one run; 3,456 simulations in all. Cell-to-run map:
`artifacts/study/space_manifest.csv` (car, scenario_id, run_id, simulations).

## Which runs make up the space (49)

- C1: the pilot halves (chunk 1a, 1b; study-v1), the top-up (scenarios 41-43;
  study-v2), the 6 clean first-submission halves, 4 re-runs (study-v2.1) and
  1 re-run with the port fix (study-v2.2).
- C2-C4: 12 halves each: clean first-submission runs (study-v2), re-runs
  (study-v2.1) and, for C3 chunk 4b and C4 chunks 6a/6b, re-runs with the port
  fix (study-v2.2).

Code versions differ only in job control (retry limit, liveness check, port
passing), not in how a scenario is simulated or judged; seeds are the global
scenario numbering in every run.

## Rules applied

- C1 scenarios 41 and 43: taken from the top-up (3 each). The pilot's 2 each
  are superseded (retry limit; same seeds, so they are the top-up's first
  samples again). C1 scenario 42: the pilot's 3; the top-up's 3 are a
  repeatability check only.
- The 19 first-submission runs that shared a node (one CARLA and one Redis for
  two jobs: `port_isolation_failure_2026-10-15.md`) are excluded; they stay on
  the cluster, unused.
- Every run in the space ran alone on its node or with the port fix in place.
