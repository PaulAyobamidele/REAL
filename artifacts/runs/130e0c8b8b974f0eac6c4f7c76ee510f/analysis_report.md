# Failure analysis - run `130e0c8b8b974f0eac6c4f7c76ee510f`

> Sampling: balanced grid - every scenario run equally often.

- Mode: grid | scenarios: 32 | trials per scenario: 1 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street in fog."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`), checked per simulation:
  - `fog_density <= 50` (scenario setting): held 32, broken 0 -> **untested**
  - `initial_separation_m >= 15` (measured in each run): held 31, broken 1 -> **insufficient data** (failure rate when held 3%, when broken 100%, over encounters)
  - `pedestrian_speed_mps <= 3` (measured in each run): held 25, broken 7 -> **insufficient data** (failure rate when held 4%, when broken 14%, over encounters)
  - Verdicts: load-bearing = failures at least 15 points higher when broken (the requirement depends on it); not load-bearing = within that (a candidate for loosening); untested = never broken (no evidence either way); insufficient data = fewer than 10 encounters on a side. A judgement call, not a significance test.
- Free-text assumptions (not checked automatically): "daylight, dry road"; "pedestrian on foot"
- 24 simulations in scope, 8 set aside as spurious.
  - rule `assumption: initial_separation_m >= 15`: 1 simulations (1 failed) - 1 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `assumption: pedestrian_speed_mps <= 3`: 7 simulations (1 failed) - 7 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 24 simulations across 24 scenarios; 23 real encounters, 1 where the car never met the pedestrian (not counted as passes).
- 0 of 23 encounters failed (0%).
- Of the 23 passes, **13 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 10 passes drove on normally.
- Soft goals stated in the requirement (`ensuring ...`), over in-scope encounters:
  - `resume_within_s <= 10`: met 16, missed 7
  - "braking is smooth unless an emergency stop is needed": free text, not checked automatically
  - 13 stalled passes are relevant to any progress / resume goal.
- Timing (medians over 22 detected encounters): pedestrian first seen at 13.8 m, first brake at 20.3 m while doing 4.7 m/s; stopping needs 6.4 m at that speed, so 0% of detections came too late; braking lasted 220 steps; still moving at the closest point in 45%; model inference 7.1 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 11 | 0% | 0% | +0% |
| pedestrian | Child | 12 | 0% | 0% | +0% |
| dress | Dark | 11 | 0% | 0% | +0% |
| dress | Light | 12 | 0% | 0% | +0% |
| direction | LR | 12 | 0% | 0% | +0% |
| direction | RL | 11 | 0% | 0% | +0% |
| distance | Long | 11 | 0% | 0% | +0% |
| distance | Short | 12 | 0% | 0% | +0% |
| fog_density | 0 | 12 | 0% | 0% | +0% |
| fog_density | 50 | 11 | 0% | 0% | +0% |
| approach_distance_m | 20.0 | 12 | 0% | 0% | +0% |
| approach_distance_m | 35.0 | 11 | 0% | 0% | +0% |
| crossing_trigger_m | 100.0 | 23 | 0% | n/a | +nan% (few data) |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Child, Light, RL, Short, fog 50 | 0/1 | 6.2 | - |
| Child, Dark, RL, Long, fog 0 | 0/1 | 9.3 | passed_stalled 1 |
| Child, Dark, LR, Long, fog 50 | 0/1 | 9.9 | - |
| Adult, Light, RL, Short, fog 0 | 0/1 | 10.2 | - |
| Adult, Dark, RL, Long, fog 0 | 0/1 | 10.2 | passed_stalled 1 |
| Adult, Dark, LR, Long, fog 0 | 0/1 | 10.9 | passed_stalled 1 |
| Child, Light, RL, Short, fog 0 | 0/1 | 11.7 | - |
| Child, Light, LR, Long, fog 0 | 0/1 | 11.8 | - |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - not supported
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.
- Evidence: failure rate 0% with vs 0% without (effect +0%, n=12).

### PedestrianClothingNotVisible - not supported
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).
- Evidence: failure rate 0% with vs 0% without (effect +0%, n=11).

### AdverseWeather - not supported
- Condition: `fog_density = 50`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Fog degrades detection confidence and adds inference latency (paper E4). 50% fog is still a realistic deployment condition.
- Evidence: failure rate 0% with vs 0% without (effect +0%, n=11).

### DetectionTooLate - insufficient data
- Condition: failures of type `detected_too_late`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- The detector only reaches the confidence bar when the pedestrian is already closer than the distance needed to stop at the approach speed. The pedestrian is visible for seconds before that; the bar (85%) is reached too late for the braking distance.
- Evidence: 0 of 0 encounter failures ended this way (n/a; bar for support 25%).

### BrakingNotLatched - insufficient data
- Condition: failures of type `brake_released`; blocks goal **Apply Brakes**
- Braking is applied only while the pedestrian is currently detected. When the pedestrian leaves the camera frame (very close, or passing) the car releases the brake and speeds up again before the closest point.
- Evidence: 0 of 0 encounter failures ended this way (n/a; bar for support 25%).

### StandoffUnnecessaryStop - SUPPORTED
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 13 of 23 passes ended this way (57%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **model**: Raise the caution threshold only when the pedestrian is stationary and off the road (needs a track, not a per-frame confidence).
  - **system**: Time-box the cautious stop: creep forward / resume when the pedestrian has not moved toward the road for N seconds; distinguish 'pedestrian at kerb' from 'pedestrian crossing'.
  - **requirement**: Add the soft goal explicitly (e.g. 'resume within N s once the path is clear') and state the domain assumption that pedestrians cross only when the vehicle is within/beyond a given distance.
  - **scenario**: Fix the test: let the pedestrian cross on its own schedule (time- or distance-to-crossing-based), not only once the car is within 8 m (CrossingBehavior threshold in scratch.temp) - otherwise a cautious car can never be measured getting past.

## 6. Warnings about the data
- 13 of 23 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (in scene v1 the pedestrian also waited for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- 1 simulation(s) were 'no encounter': the car never came within 10 m of the pedestrian and never saw it. They are NOT counted as passes. If this is common, the scenario geometry (random lane / heading) is sending the car away from the pedestrian - fix the template, do not celebrate the passes.
- No encounter failed. Either the car handles all scenarios, or the safety margin / detection threshold is too lenient to expose anything.
- Only 23 encounters - treat rates as rough. 5 trials per scenario gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
