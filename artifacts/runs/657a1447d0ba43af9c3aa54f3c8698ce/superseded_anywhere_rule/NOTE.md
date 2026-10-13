# Superseded analysis (kept, not current)

These files are the run's first analysis, made before two corrections and
moved here on 2026-10-08 when the run was re-analysed:

- **Safety rule.** They judge a simulation by the simulator monitor's own
  verdict, the car within 5 m of the pedestrian *anywhere*. That counted a
  car driving past a pedestrian already standing on the far kerb as a
  failure. The rule decided for the project is *path-aware*: a failure only
  when the car comes within 5 m of a pedestrian who is in its lane.
- **Glitch-robust measures.** They predate the median-filtered pedestrian
  speed, so one-step simulator spikes made 10 runs look as if they broke
  `pedestrian_speed_mps <= 3` and set them aside.

The current `analysis_report.json`, `analysis_report.md` and
`cluster_map.json` in the run folder replace them. Do not quote numbers from
this folder.
