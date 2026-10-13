# Failure analysis - run `884d675262764ed99ce280ea064b72fd`

> **Path-aware safety rule (5 m margin only while the pedestrian is in the car's path); the run folder's own report uses the margin anywhere. Which rule the requirement means is a decision for the review ([R]).**

> Sampling: GE search - scenarios were bred towards failure, not sampled evenly. Failure rates are not population rates, and setting effects and supported obstacles are leads to confirm on balanced repeats (python -m scripts.analysis.grid_check <this run>), not findings. 7 distinct scenarios; the most repeated ran 1 times.
> Safety rule: the 5 m margin applies only while the pedestrian is in the car's path (within 2.5 m of the lane centre); 4 simulation(s) change verdict compared with the margin applied anywhere.

- Mode: ge | scenarios: ? | trials per scenario: ? | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street in fog."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`), checked per simulation:
  - `fog_density <= 50` (scenario setting): held 9, broken 14 -> **insufficient data** (failure rate when held 0%, when broken 0%, over encounters)
  - `initial_separation_m >= 15` (measured in each run): held 22, broken 1 -> **insufficient data** (failure rate when held 0%, when broken 0%, over encounters)
  - `pedestrian_speed_mps <= 3` (measured in each run): held 15, broken 8 -> **insufficient data** (failure rate when held 0%, when broken 0%, over encounters)
  - Verdicts: load-bearing = failures at least 15 points higher when broken (the requirement depends on it); not load-bearing = within that (a candidate for loosening); untested = never broken (no evidence either way); insufficient data = fewer than 10 encounters on a side. A judgement call, not a significance test.
- Free-text assumptions (not checked automatically): "daylight, dry road"; "pedestrian on foot"
- 7 simulations in scope, 16 set aside as spurious.
  - rule `assumption: fog_density <= 50`: 3 simulations (0 failed) - 3 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `assumption: fog_density <= 50, assumption: pedestrian_speed_mps <= 3`: 4 simulations (0 failed) - 4 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `assumption: initial_separation_m >= 15`: 1 simulations (0 failed) - 1 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `assumption: pedestrian_speed_mps <= 3`: 1 simulations (0 failed) - 1 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `extreme_fog, assumption: fog_density <= 50`: 4 simulations (0 failed) - 4 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.
  - rule `extreme_fog, assumption: fog_density <= 50, assumption: pedestrian_speed_mps <= 3`: 3 simulations (0 failed) - 3 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 7 simulations across 7 scenarios; 7 real encounters, 0 where the car never met the pedestrian (not counted as passes).
- 0 of 7 encounters failed (0%); with every distinct scenario counted once: 0%.
- Of the 7 passes, **7 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 0 passes drove on normally.
- Soft goals stated in the requirement (`ensuring ...`), over in-scope encounters:
  - `resume_within_s <= 10`: met 6, missed 1
  - "braking is smooth unless an emergency stop is needed": free text, not checked automatically
  - 7 stalled passes are relevant to any progress / resume goal.
- Timing (medians over 7 detected encounters): pedestrian first seen at 8.6 m, first brake at 20.1 m while doing 2.0 m/s; stopping needs 5.2 m at that speed, so 0% of detections came too late; braking lasted 226 steps; still moving at the closest point in 0%; model inference 7.2 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect | effect, each scenario once |
|---|---|---|---|---|---|---|
| pedestrian | Adult | 4 | 0% | 0% | +0% (few data) | +0% |
| pedestrian | Child | 3 | 0% | 0% | +0% (few data) | +0% |
| dress | Dark | 3 | 0% | 0% | +0% (few data) | +0% |
| dress | Light | 4 | 0% | 0% | +0% (few data) | +0% |
| direction | LR | 6 | 0% | 0% | +0% (few data) | +0% |
| direction | RL | 1 | 0% | 0% | +0% (few data) | +0% |
| fog_density | <= 50 | 7 | 0% | n/a | +nan% (few data) | n/a |
| approach_distance_m | <= 25 | 4 | 0% | 0% | +0% (few data) | +0% |
| approach_distance_m | > 25 | 3 | 0% | 0% | +0% (few data) | +0% |
| pedestrian_min_speed_mps | <= 2 | 4 | 0% | 0% | +0% (few data) | +0% |
| pedestrian_min_speed_mps | > 2 | 3 | 0% | 0% | +0% (few data) | +0% |
| crossing_trigger_m | <= 20 | 3 | 0% | 0% | +0% (few data) | +0% |
| crossing_trigger_m | > 20 | 4 | 0% | 0% | +0% (few data) | +0% |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Adult, Dark, LR, fog 30 | 0/1 | 7.5 | passed_stalled 1 |
| Adult, Light, LR, fog 0 | 0/1 | 7.6 | passed_stalled 1 |
| Adult, Light, LR, fog 30 | 0/1 | 7.6 | passed_stalled 1 |
| Adult, Light, LR, fog 20 | 0/1 | 8.3 | passed_stalled 1 |
| Child, Dark, LR, fog 10 | 0/1 | 8.5 | passed_stalled 1 |
| Child, Dark, LR, fog 40 | 0/1 | 9.9 | passed_stalled 1 |
| Child, Light, RL, fog 40 | 0/1 | 10.5 | passed_stalled 1 |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - insufficient data
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.
- Evidence: failure rate 0% with vs 0% without (effect +0%, n=3).

### PedestrianClothingNotVisible - insufficient data
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).
- Evidence: failure rate 0% with vs 0% without (effect +0%, n=3).

### AdverseWeather - insufficient data
- Condition: `fog_density = 50`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Fog degrades detection confidence and adds inference latency (paper E4). 50% fog is still a realistic deployment condition.

### DetectionTooLate - insufficient data
- Condition: failures of type `detected_too_late`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- The detector only reaches the confidence bar when the pedestrian is already closer than the distance needed to stop at the approach speed. The pedestrian is visible for seconds before that; the bar (85%) is reached too late for the braking distance.
- Evidence: 0 of 0 encounter failures ended this way (n/a; bar for support 25%).

### BrakingNotLatched - insufficient data
- Condition: failures of type `brake_released`; blocks goal **Apply Brakes**
- Braking is applied only while the pedestrian is currently detected. When the pedestrian leaves the camera frame (very close, or passing) the car releases the brake and speeds up again before the closest point.
- Evidence: 0 of 0 encounter failures ended this way (n/a; bar for support 25%).

### StandoffUnnecessaryStop - insufficient data
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 7 of 7 passes ended this way (100%; bar for support 25%).

## 6. Warnings about the data
- 7 of 7 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (in scene v1 the pedestrian also waited for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- No encounter failed. Either the car handles all scenarios, or the safety margin / detection threshold is too lenient to expose anything.
- Only 7 encounters - treat rates as rough. 5 trials per scenario gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
