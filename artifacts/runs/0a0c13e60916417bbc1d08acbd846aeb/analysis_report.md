# Failure analysis - run `0a0c13e60916417bbc1d08acbd846aeb`

> Sampling: a chosen list of scenarios (e.g. a grid check of a GE run), each run equally often.
> Safety rule: the 5 m margin applies only while the pedestrian is in the car's path (within 2.5 m of the lane centre); 0 simulation(s) change verdict compared with the margin applied anywhere.

- Mode: list | scenarios: 4 | trials per scenario: 1 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street in fog."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`), checked per simulation:
  - `fog_density <= 50` (scenario setting): held 3, broken 1 -> **insufficient data** (failure rate when held 33%, when broken 0%, over encounters)
  - `initial_separation_m >= 15` (measured in each run): held 4, broken 0 -> **untested**
  - `pedestrian_speed_mps <= 3` (measured in each run): held 4, broken 0 -> **untested**
  - Verdicts: load-bearing = failures at least 15 points higher when broken (the requirement depends on it); not load-bearing = within that (a candidate for loosening); untested = never broken (no evidence either way); insufficient data = fewer than 10 encounters on a side. A judgement call, not a significance test.
- Free-text assumptions (not checked automatically): "daylight, dry road"; "pedestrian on foot"
- 3 simulations in scope, 1 set aside as spurious.
  - rule `assumption: fog_density <= 50`: 1 simulations (0 failed) - 1 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 3 simulations across 3 scenarios; 3 real encounters, 0 where the car never met the pedestrian (not counted as passes).
- 1 of 3 encounters failed (33%).
- Of the 2 passes, **2 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 0 passes drove on normally.
- Soft goals stated in the requirement (`ensuring ...`), over in-scope encounters:
  - `resume_within_s <= 10`: met 1, missed 2
  - "braking is smooth unless an emergency stop is needed": free text, not checked automatically
  - 2 stalled passes are relevant to any progress / resume goal.
- How they failed: brake_released 1
- Timing (medians over 3 detected encounters): pedestrian first seen at 8.7 m, first brake at 17.2 m while doing 5.4 m/s; stopping needs 6.8 m at that speed, so 0% of detections came too late; braking lasted 228 steps; still moving at the closest point in 33%; model inference 7.3 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 2 | 50% | 0% | +50% (few data) |
| pedestrian | Child | 1 | 0% | 50% | -50% (few data) |
| dress | Dark | 1 | 0% | 50% | -50% (few data) |
| dress | Light | 2 | 50% | 0% | +50% (few data) |
| direction | LR | 1 | 0% | 50% | -50% (few data) |
| direction | RL | 2 | 50% | 0% | +50% (few data) |
| fog_density | 0 | 2 | 50% | 0% | +50% (few data) |
| fog_density | 40 | 1 | 0% | 50% | -50% (few data) |
| approach_distance_m | 20.0 | 2 | 0% | 100% | -100% (few data) |
| approach_distance_m | 35.0 | 1 | 100% | 0% | +100% (few data) |
| pedestrian_min_speed_mps | 2.0 | 3 | 33% | n/a | +nan% (few data) |
| crossing_trigger_m | 0.0 | 3 | 33% | n/a | +nan% (few data) |
| sun_altitude_angle | <= 15 | 2 | 50% | 0% | +50% (few data) |
| sun_altitude_angle | > 15 | 1 | 0% | 50% | -50% (few data) |
| wetness | 0.0 | 1 | 0% | 50% | -50% (few data) |
| wetness | 80.0 | 2 | 50% | 0% | +50% (few data) |
| precipitation | 0.0 | 2 | 50% | 0% | +50% (few data) |
| precipitation | 60.0 | 1 | 0% | 50% | -50% (few data) |
| cloudiness | 100.0 | 1 | 0% | 50% | -50% (few data) |
| cloudiness | 50.0 | 2 | 50% | 0% | +50% (few data) |
| occlusion | 0.0 | 1 | 0% | 50% | -50% (few data) |
| occlusion | 1.0 | 2 | 50% | 0% | +50% (few data) |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Adult, Light, RL, fog 0 | 1/1 | 3.7 | brake_released 1 |
| Child, Dark, RL, fog 40 | 0/1 | 10.5 | passed_stalled 1 |
| Adult, Light, LR, fog 0 | 0/1 | 12.3 | passed_stalled 1 |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - insufficient data
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.
- Evidence: failure rate 0% with vs 50% without (effect -50%, n=1).

### PedestrianClothingNotVisible - insufficient data
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).
- Evidence: failure rate 0% with vs 50% without (effect -50%, n=1).

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

### StandoffUnnecessaryStop - insufficient data
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 2 of 2 passes ended this way (100%; bar for support 25%).

## 6. Warnings about the data
- 2 of 2 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (in scene v1 the pedestrian also waited for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- Only 3 encounters - treat rates as rough. 5 trials per scenario gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
