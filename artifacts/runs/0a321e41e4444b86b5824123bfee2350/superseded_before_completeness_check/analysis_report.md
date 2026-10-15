# Failure analysis - run `0a321e41e4444b86b5824123bfee2350`

> Sampling: a chosen list of scenarios (e.g. a grid check of a GE run), each run equally often.
> Safety rule: the 5 m margin applies only while the pedestrian is in the car's path (within 2.5 m of the lane centre); 5 simulation(s) change verdict compared with the margin applied anywhere.

- Mode: list | scenarios: 24 | trials per scenario: 3 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`), checked per simulation:
  - `fog_density <= 50` (scenario setting): held 34, broken 36 -> **not load-bearing** (failure rate when held 3%, when broken 0%, over encounters)
  - `sun_altitude_angle >= 0` (scenario setting): held 46, broken 24 -> **not load-bearing** (failure rate when held 2%, when broken 0%, over encounters)
  - `initial_separation_m >= 15` (measured in each run): held 70, broken 0 -> **untested**
  - `pedestrian_speed_mps <= 3` (measured in each run): held 69, broken 1 -> **insufficient data** (failure rate when held 1%, when broken 0%, over encounters)
  - Verdicts: load-bearing = failures at least 15 points higher when broken (the requirement depends on it); not load-bearing = within that (a candidate for loosening); untested = never broken (no evidence either way); insufficient data = fewer than 10 encounters on a side. A judgement call, not a significance test.
- Free-text assumptions (not checked automatically): "pedestrian on foot"
- 22 simulations in scope, 48 set aside as spurious.
  - rule `assumption: fog_density <= 50`: 23 simulations (0 failed) - 8 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `assumption: fog_density <= 50, assumption: pedestrian_speed_mps <= 3`: 1 simulations (0 failed) - 1 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `assumption: fog_density <= 50, assumption: sun_altitude_angle >= 0`: 12 simulations (0 failed) - 4 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `assumption: sun_altitude_angle >= 0`: 12 simulations (0 failed) - 4 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 22 simulations across 8 scenarios; 20 real encounters, 0 where the car never met the pedestrian (not counted as passes), **2 where the pedestrian never crossed (a test defect, excluded)**.
- 1 of 20 encounters failed (5%).
- Of the 19 passes, **19 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 0 passes drove on normally.
- Soft goals stated in the requirement (`ensuring ...`), over in-scope encounters:
  - `resume_within_s <= 10`: met 2, missed 18
  - "braking is smooth unless an emergency stop is needed": free text, not checked automatically
  - 19 stalled passes are relevant to any progress / resume goal.
- How they failed: brake_released 1
- Timing (medians over 20 detected encounters): pedestrian first seen at 9.7 m, first brake at 15.8 m while doing 5.0 m/s; stopping needs 6.5 m at that speed, so 0% of detections came too late; braking lasted 236 steps; still moving at the closest point in 10%; model inference 7.2 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 20 | 5% | n/a | +nan% (few data) |
| dress | Light | 20 | 5% | n/a | +nan% (few data) |
| direction | RL | 20 | 5% | n/a | +nan% (few data) |
| fog_density | 0 | 20 | 5% | n/a | +nan% (few data) |
| approach_distance_m | 20.0 | 20 | 5% | n/a | +nan% (few data) |
| pedestrian_min_speed_mps | 2.0 | 20 | 5% | n/a | +nan% (few data) |
| crossing_trigger_m | 0.0 | 20 | 5% | n/a | +nan% (few data) |
| sun_altitude_angle | 10.0 | 10 | 0% | 10% | -10% |
| sun_altitude_angle | 60.0 | 10 | 10% | 0% | +10% |
| wetness | 0.0 | 9 | 0% | 9% | -9% (few data) |
| wetness | 80.0 | 11 | 9% | 0% | +9% (few data) |
| precipitation | 0.0 | 20 | 5% | n/a | +nan% (few data) |
| cloudiness | 50.0 | 20 | 5% | n/a | +nan% (few data) |
| occlusion | 0.0 | 10 | 10% | 0% | +10% |
| occlusion | 1.0 | 10 | 0% | 10% | -10% |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Adult, Light, RL, fog 0 | 1/3 | 3.6 | brake_released 1, passed_stalled 2 |
| Adult, Light, RL, fog 0 | 0/3 | 7.9 | passed_stalled 3 |
| Adult, Light, RL, fog 0 | 0/2 | 8.2 | passed_stalled 2 |
| Adult, Light, RL, fog 0 | 0/3 | 8.4 | passed_stalled 3 |
| Adult, Light, RL, fog 0 | 0/1 | 8.4 | passed_stalled 1 |
| Adult, Light, RL, fog 0 | 0/3 | 11.4 | passed_stalled 3 |
| Adult, Light, RL, fog 0 | 0/3 | 12.1 | passed_stalled 3 |
| Adult, Light, RL, fog 0 | 0/2 | 14.0 | passed_stalled 2 |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - insufficient data
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.

### PedestrianClothingNotVisible - insufficient data
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).

### AdverseWeather - insufficient data
- Condition: `fog_density = 50`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Fog degrades detection confidence and adds inference latency (paper E4). 50% fog is still a realistic deployment condition.

### DetectionTooLate - insufficient data
- Condition: failures of type `detected_too_late`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- The detector only reaches the confidence bar when the pedestrian is already closer than the distance needed to stop at the approach speed. The pedestrian is visible for seconds before that; the bar (85%) is reached too late for the braking distance.
- Evidence: 0 of 1 encounter failures ended this way (0%; bar for support 25%).

### BrakingNotLatched - insufficient data
- Condition: failures of type `brake_released`; blocks goal **Apply Brakes**
- Braking is applied only while the pedestrian is currently detected. When the pedestrian leaves the camera frame (very close, or passing) the car releases the brake and speeds up again before the closest point.
- Evidence: 1 of 1 encounter failures ended this way (100%; bar for support 25%).

### StandoffUnnecessaryStop - SUPPORTED
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 19 of 19 passes ended this way (100%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **model**: Raise the caution threshold only when the pedestrian is stationary and off the road (needs a track, not a per-frame confidence).
  - **system**: Time-box the cautious stop: creep forward / resume when the pedestrian has not moved toward the road for N seconds; distinguish 'pedestrian at kerb' from 'pedestrian crossing'.
  - **requirement**: Add the soft goal explicitly (e.g. 'resume within N s once the path is clear') and state the domain assumption that pedestrians cross only when the vehicle is within/beyond a given distance.
  - **scenario**: Fix the test: let the pedestrian cross on its own schedule (time- or distance-to-crossing-based), not only once the car is within 8 m (CrossingBehavior threshold in scratch.temp) - otherwise a cautious car can never be measured getting past.

## 6. Warnings about the data
- 2 simulation(s) where the PEDESTRIAN NEVER CROSSED the road. Nobody was in the car's path, so these say nothing about the car: excluded from every rate. A defect of the test scene - fix it before reading anything else in this report.
- 19 of 19 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (in scene v1 the pedestrian also waited for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- Failures (5% overall) do not vary with any scenario setting (largest effect 10% < 15%). That pattern points at the scoring or the fixed parts of the scenario (approach speed, confidence bar, braking logic), not at the settings the grammar varies.
- Only 20 encounters - treat rates as rough. 5 trials per scenario gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
