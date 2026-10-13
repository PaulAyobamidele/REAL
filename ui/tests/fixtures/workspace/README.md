# Test fixtures: a real workspace

Two real rounds from the project's demo bundle (`examples/demo_runs/`), as
`python -m scripts.demo` writes them: round 1 (emergency braking) and round 2
(proportional braking), run on CARLA on 2026-09-23. Round 2 carries the
version-2 analysis report, the scripted demo review (`decisions.json`, marked
as scripted) and the derived `R0.dsl` / `R1.dsl` / `requirement_diff.md`.
Only two trace files are kept; the video and frames are left out.

These are real results, used so the tests load what the interface will
load. Do not edit them by hand; regenerate with the demo.
