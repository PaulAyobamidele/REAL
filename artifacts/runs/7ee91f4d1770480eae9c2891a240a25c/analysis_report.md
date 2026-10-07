# Failure analysis - run `7ee91f4d1770480eae9c2891a240a25c`

> Sampling: balanced grid - every scenario run equally often.

- Mode: grid | scenarios: 32 | trials per scenario: 1 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street in fog."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`), checked per simulation:
  - `fog_density <= 50` (scenario setting): held 30, broken 0 -> **untested**
  - `initial_separation_m >= 15` (measured in each run): held 30, broken 0 -> **untested**
  - `pedestrian_speed_mps <= 3` (measured in each run): held 22, broken 8 -> **insufficient data** (failure rate when held 0%, when broken 0%, over encounters)
  - Verdicts: load-bearing = failures at least 15 points higher when broken (the requirement depends on it); not load-bearing = within that (a candidate for loosening); untested = never broken (no evidence either way); insufficient data = fewer than 10 encounters on a side. A judgement call, not a significance test.
- Free-text assumptions (not checked automatically): "daylight, dry road"; "pedestrian on foot"
- 22 simulations in scope, 8 set aside as spurious.
  - rule `assumption: pedestrian_speed_mps <= 3`: 8 simulations (0 failed) - 8 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 22 simulations across 22 scenarios; 22 real encounters, 0 where the car never met the pedestrian (not counted as passes).
- 0 of 22 encounters failed (0%).
- Of the 22 passes, **7 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 15 passes drove on normally.
- Soft goals stated in the requirement (`ensuring ...`), over in-scope encounters:
  - `resume_within_s <= 10`: met 20, missed 2
  - "braking is smooth unless an emergency stop is needed": free text, not checked automatically
  - 7 stalled passes are relevant to any progress / resume goal.
- Timing (medians over 20 detected encounters): pedestrian first seen at nan m, first brake at 20.0 m while doing 2.0 m/s; stopping needs 5.2 m at that speed, so 0% of detections came too late; braking lasted 46 steps; still moving at the closest point in 70%; model inference 6.9 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 9 | 0% | 0% | +0% (few data) |
| pedestrian | Child | 13 | 0% | 0% | +0% (few data) |
| dress | Dark | 12 | 0% | 0% | +0% |
| dress | Light | 10 | 0% | 0% | +0% |
| direction | LR | 10 | 0% | 0% | +0% |
| direction | RL | 12 | 0% | 0% | +0% |
| distance | Long | 11 | 0% | 0% | +0% |
| distance | Short | 11 | 0% | 0% | +0% |
| fog_density | 0 | 11 | 0% | 0% | +0% |
| fog_density | 50 | 11 | 0% | 0% | +0% |
| approach_distance_m | 20.0 | 11 | 0% | 0% | +0% |
| approach_distance_m | 35.0 | 11 | 0% | 0% | +0% |
| pedestrian_min_speed_mps | 2.0 | 22 | 0% | n/a | +nan% (few data) |
| crossing_trigger_m | 100.0 | 22 | 0% | n/a | +nan% (few data) |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Child, Light, LR, Short, fog 0 | 0/1 | 5.8 | - |
| Child, Light, LR, Long, fog 0 | 0/1 | 5.8 | - |
| Adult, Dark, LR, Long, fog 0 | 0/1 | 6.0 | passed_stalled 1 |
| Child, Light, RL, Short, fog 50 | 0/1 | 6.2 | - |
| Child, Light, RL, Long, fog 0 | 0/1 | 6.4 | - |
| Child, Dark, LR, Long, fog 50 | 0/1 | 9.9 | - |
| Child, Light, RL, Long, fog 50 | 0/1 | 10.0 | - |
| Child, Dark, LR, Short, fog 0 | 0/1 | 10.0 | - |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - insufficient data
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.
- Evidence: failure rate 0% with vs 0% without (effect +0%, n=13).

### PedestrianClothingNotVisible - not supported
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).
- Evidence: failure rate 0% with vs 0% without (effect +0%, n=12).

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
- Evidence: 7 of 22 passes ended this way (32%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **model**: Raise the caution threshold only when the pedestrian is stationary and off the road (needs a track, not a per-frame confidence).
  - **system**: Time-box the cautious stop: creep forward / resume when the pedestrian has not moved toward the road for N seconds; distinguish 'pedestrian at kerb' from 'pedestrian crossing'.
  - **requirement**: Add the soft goal explicitly (e.g. 'resume within N s once the path is clear') and state the domain assumption that pedestrians cross only when the vehicle is within/beyond a given distance.
  - **scenario**: Fix the test: let the pedestrian cross on its own schedule (time- or distance-to-crossing-based), not only once the car is within 8 m (CrossingBehavior threshold in scratch.temp) - otherwise a cautious car can never be measured getting past.

## 6. Warnings about the data
- 7 of 22 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (in scene v1 the pedestrian also waited for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- No encounter failed. Either the car handles all scenarios, or the safety margin / detection threshold is too lenient to expose anything.
- Only 22 encounters - treat rates as rough. 5 trials per scenario gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
