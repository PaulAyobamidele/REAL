# Demo runs

Two real REAL rounds, run on the Narval cluster (CARLA 0.9.13, YOLOv5s,
NVIDIA A100) on 2026-09-23, used by `python -m scripts.demo`:

| Folder | Round | System under test | Simulations |
|---|---|---|---|
| `35acc09e8c224fdc953e3bf82ba57e96` | 1 | emergency braking + yolov5s (Slurm job 3830258) | 32 scenarios x 5 |
| `882fb2fe00bf4568bdb480a281db9e8b` | 2 | proportional braking + yolov5s (Slurm job 3843349) | 32 scenarios x 5 |

Each folder holds what the run itself produced: `run_meta.json`,
`simulations.csv` (one row per simulation), `scenarios.csv`, `traces/` (per
simulation time series), and the recorded video of the worst scenario.
Raw camera frames and every analysis output are left out — the demo
regenerates the analysis in its own output folder and never writes here.

Caveat (Notes.md §8.19): both rounds used the first version of the test
scene, which had known defects (a fixed 8 m crossing trigger, one crossing
direction that did not cross, a distance setting with no effect). They are
shipped because they are real runs with real results, and because finding
those defects is part of what the tool is for.

`review_answers.json` is the scripted human review the demo replays for
round 2. It is labelled as scripted in the decisions it produces; on the
review page every answer can be changed.
