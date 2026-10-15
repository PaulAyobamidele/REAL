# Study space, first full submission: jobs sharing a node shared one CARLA — 2026-10-15

46 jobs (C1 chunks 2-6, C2-C4 all 12 halves; code study-v2). Outcome by the
scheduler: 36 completed, 8 hit the 2.5-h limit, 2 failed.

## What happened

- Whenever a second job started on a node where one of ours was already
  running, **its CARLA server crashed at start-up**: `LowLevelFatalError ...
  bind: Address already in use`, then a segmentation fault (11 jobs).
- Several of those jobs nevertheless ran all 24 scenarios with no connection
  error. The job script never restarts CARLA, so their client must have
  reached **the other job's CARLA server** (Apptainer shares the node's
  network).
- Every job that was **first** on a shared node logged a flood of `Invalid
  session: no stream available` (millions of lines) and slowed to a crawl:
  two clients were driving one simulated world at once.
- So the per-job ports (study plan 1a.5) do not isolate jobs on one node.
  1a.5 was marked done on the laptop with the cluster check pending; the
  pilot's two halves ran on different nodes, so this is the first real test,
  and it failed.

## Which results can be used

A job is **contaminated** if another of our jobs ran on the same node at any
time while it ran (from the scheduler's node list and start/end times).

- **Contaminated (19), to be re-run:** C1 2a, 2b, 3b, 4b; C2 1b, 4a, 6b;
  C3 1b, 2a, 2b, 3b, 4b, 5a; C4 2a, 3b, 4a, 4b, 6a, 6b.
- **Clean (27):** ran alone on their node for their whole run; all completed
  with 24 of 24 scenarios started. The pilot (C1 1a, 1b) and the top-up are
  clean too.

## Cause (open)

Either CARLA ignores the `-carla-port` flag (and every server binds the same
default ports), or the client does not use the per-job port, or both. Reading
the code does not settle it (the scene sets `param port` before the model, as
Scenic requires). Next: a short diagnostic job that starts two CARLA servers
on one node and lists the ports each actually listens on.

## The 27 clean runs, pulled and analysed (same day)

List: `artifacts/job_logs/study_clean_runs_2026-10-15.txt` (git-ignored; run
ids with car and chunk). Every run: 72 of 72 simulations, no scenario short
of its repeats, none unsimulated; at most 16 attempts for a scenario (limit
30). 1,944 simulations in all. **Partial data** (19 jobs to re-run): no rates
are reported until the matrix is complete. Visible already, to be checked on
the complete data: the path-aware braking cars (C2, C4) fail far more valid
encounters than the proportional ones (C1, C3).
