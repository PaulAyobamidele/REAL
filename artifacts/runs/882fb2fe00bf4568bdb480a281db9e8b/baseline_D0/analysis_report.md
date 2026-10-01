# Failure analysis - run `882fb2fe00bf4568bdb480a281db9e8b`

> **Assumptions stated AFTER the run: this run ran with R0, which states no assumptions and no soft goals. Here it is re-judged against R0 + the baseline assuming/ensuring lines (docs/examples/R_baseline.dsl). Not the result of a run under the baseline - that is run 2b.**

- Mode: grid | scenarios: 32 | trials per scenario: 5 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street in fog."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`), checked per simulation:
  - `fog_density <= 50` (scenario setting): held 160, broken 0 -> **untested**
  - `initial_separation_m >= 15` (measured in each run): held 152, broken 8 -> **insufficient data** (failure rate when held 3%, when broken 0%, over encounters)
  - `pedestrian_speed_mps <= 3` (measured in each run): not measured in this run, so it set nothing aside
  - Verdicts: load-bearing = failures at least 15 points higher when broken (the requirement depends on it); not load-bearing = within that (a candidate for loosening); untested = never broken (no evidence either way); insufficient data = fewer than 10 encounters on a side. A judgement call, not a significance test.
- Free-text assumptions (not checked automatically): "daylight, dry road"; "pedestrian on foot"
- 152 simulations in scope, 8 set aside as spurious.
  - rule `assumption: initial_separation_m >= 15`: 8 simulations (0 failed) - 8 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 152 simulations across 32 scenarios; 126 real encounters, 26 where the car never met the pedestrian (not counted as passes).
- 4 of 126 encounters failed (3%).
- Of the 122 passes, **113 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 9 passes drove on normally.
- Soft goals stated in the requirement (`ensuring ...`):
  - "vehicle resumes within 10 s once the crossing is clear": not checked automatically yet (roadmap M2.5)
  - "braking is smooth unless an emergency stop is needed": not checked automatically yet (roadmap M2.5)
  - 113 stalled passes are relevant to any progress / resume goal.
- How they failed: detected_too_late 1, brake_released 1, stopped_too_close 2
- Timing (medians over 126 detected encounters): pedestrian first seen at 7.6 m, first brake at 21.2 m while doing 2.0 m/s; stopping needs 5.2 m at that speed, so 1% of detections came too late; braking lasted 90 steps; still moving at the closest point in 30%; model inference 7.1 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 64 | 2% | 5% | -3% |
| pedestrian | Child | 62 | 5% | 2% | +3% |
| dress | Dark | 64 | 3% | 3% | -0% |
| dress | Light | 62 | 3% | 3% | +0% |
| direction | LR | 61 | 7% | 0% | +7% |
| direction | RL | 65 | 0% | 7% | -7% |
| distance | Long | 59 | 2% | 4% | -3% |
| distance | Short | 67 | 4% | 2% | +3% |
| fog_density | 0 | 68 | 3% | 3% | -1% |
| fog_density | 50 | 58 | 3% | 3% | +1% |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Child, Dark, LR, Short, fog 0 | 1/4 | 2.6 | brake_released 1, passed_stalled 3, no_encounter 1 |
| Child, Light, LR, Short, fog 50 | 1/4 | 4.5 | detected_too_late 1, passed_stalled 3, no_encounter 1 |
| Child, Light, LR, Long, fog 0 | 1/4 | 4.8 | stopped_too_close 1, passed_stalled 1 |
| Adult, Dark, LR, Short, fog 50 | 1/5 | 4.8 | stopped_too_close 1, passed_stalled 4 |
| Child, Light, LR, Short, fog 0 | 0/5 | 5.6 | passed_stalled 4 |
| Child, Dark, LR, Long, fog 50 | 0/3 | 6.0 | passed_stalled 2, no_encounter 2 |
| Child, Light, LR, Long, fog 50 | 0/2 | 6.7 | passed_stalled 1, no_encounter 2 |
| Child, Light, RL, Long, fog 50 | 0/4 | 7.2 | passed_stalled 3, no_encounter 1 |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - not supported
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.
- Evidence: failure rate 5% with vs 2% without (effect +3%, n=62).
- Only 33% of these failures were perception failures - the pedestrian was seen in time; look at braking behaviour.

### PedestrianClothingNotVisible - not supported
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).
- Evidence: failure rate 3% with vs 3% without (effect -0%, n=64).
- Only 0% of these failures were perception failures - the pedestrian was seen in time; look at braking behaviour.

### AdverseWeather - not supported
- Condition: `fog_density = 50`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Fog degrades detection confidence and adds inference latency (paper E4). 50% fog is still a realistic deployment condition.
- Evidence: failure rate 3% with vs 3% without (effect +1%, n=58).
- 50% of these failures were perception failures (never detected, or detected too late to stop)

### DetectionTooLate - insufficient data
- Condition: failures of type `detected_too_late`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- The detector only reaches the confidence bar when the pedestrian is already closer than the distance needed to stop at the approach speed. The pedestrian is visible for seconds before that; the bar (85%) is reached too late for the braking distance.
- Evidence: 1 of 4 encounter failures ended this way (25%; bar for support 25%).

### BrakingNotLatched - insufficient data
- Condition: failures of type `brake_released`; blocks goal **Apply Brakes**
- Braking is applied only while the pedestrian is currently detected. When the pedestrian leaves the camera frame (very close, or passing) the car releases the brake and speeds up again before the closest point.
- Evidence: 1 of 4 encounter failures ended this way (25%; bar for support 25%).

### StandoffUnnecessaryStop - SUPPORTED
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 113 of 122 passes ended this way (93%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **model**: Raise the caution threshold only when the pedestrian is stationary and off the road (needs a track, not a per-frame confidence).
  - **system**: Time-box the cautious stop: creep forward / resume when the pedestrian has not moved toward the road for N seconds; distinguish 'pedestrian at kerb' from 'pedestrian crossing'.
  - **requirement**: Add the soft goal explicitly (e.g. 'resume within N s once the path is clear') and state the domain assumption that pedestrians cross only when the vehicle is within/beyond a given distance.
  - **scenario**: Fix the test: let the pedestrian cross on its own schedule (time- or distance-to-crossing-based), not only once the car is within 8 m (CrossingBehavior threshold in scratch.temp) - otherwise a cautious car can never be measured getting past.

## 6. Warnings about the data
- 113 of 122 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (the pedestrian's CrossingBehavior waits for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- 26 simulation(s) were 'no encounter': the car never came within 10 m of the pedestrian and never saw it. They are NOT counted as passes. If this is common, the scenario geometry (random lane / heading) is sending the car away from the pedestrian - fix the template, do not celebrate the passes.
- Failures (3% overall) do not vary with any scenario setting (largest effect 7% < 15%). That pattern points at the scoring or the fixed parts of the scenario (approach speed, confidence bar, braking logic), not at the settings the grammar varies.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
