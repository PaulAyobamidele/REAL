> **HYPOTHETICAL BOUND - NOT THE PROJECT'S CLAIM.** Round 1 re-analysed with an invented
> `assuming "fog_density < 50"` clause added to the requirement text (not a rules file), purely to
> exercise the valid/spurious path through the clause itself on real data at zero simulator cost.
> The project's honest bound is `fog_density <= 50` (everything in scope). Do not quote any rate from this file.

# Failure analysis - run `35acc09e8c224fdc953e3bf82ba57e96`

- Mode: grid | scenarios: 32 | trials per scenario: 5 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street in fog."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`): fog_density < 50
- 80 simulations in scope, 80 set aside as spurious.
  - rule `assumption: fog_density < 50`: 80 simulations (42 failed) - 16 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 80 simulations across 16 scenarios; 61 real encounters, 19 where the car never met the pedestrian (not counted as passes).
- 49 of 61 encounters failed (80%).
- Of the 12 passes, **3 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 9 passes drove on normally.
- How they failed: never_detected 1, detected_too_late 43, brake_released 2, braking_insufficient 2, stopped_too_close 1
- Timing (medians over 60 detected encounters): pedestrian first seen at 6.4 m, first brake at 6.4 m while doing 7.2 m/s; stopping needs 8.2 m at that speed, so 77% of detections came too late; braking lasted 4 steps; still moving at the closest point in 75%; model inference 6.9 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 30 | 73% | 87% | -14% |
| pedestrian | Child | 31 | 87% | 73% | +14% |
| dress | Dark | 30 | 87% | 74% | +12% |
| dress | Light | 31 | 74% | 87% | -12% |
| direction | LR | 31 | 90% | 70% | +20% |
| direction | RL | 30 | 70% | 90% | -20% |
| distance | Long | 31 | 81% | 80% | +1% |
| distance | Short | 30 | 80% | 81% | -1% |
| fog_density | 0 | 61 | 80% | n/a | +nan% (few data) |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Adult, Dark, LR, Long, fog 0 | 3/3 | 1.3 | detected_too_late 3, no_encounter 2 |
| Adult, Light, LR, Short, fog 0 | 4/4 | 1.4 | detected_too_late 4, no_encounter 1 |
| Child, Dark, RL, Long, fog 0 | 4/4 | 1.5 | detected_too_late 3, braking_insufficient 1, no_encounter 1 |
| Child, Light, RL, Short, fog 0 | 3/3 | 1.6 | detected_too_late 3, no_encounter 2 |
| Child, Light, LR, Long, fog 0 | 4/4 | 1.6 | detected_too_late 4, no_encounter 1 |
| Adult, Dark, LR, Short, fog 0 | 4/4 | 1.7 | detected_too_late 4, no_encounter 1 |
| Child, Dark, LR, Long, fog 0 | 4/4 | 1.9 | never_detected 1, detected_too_late 3, no_encounter 1 |
| Child, Dark, RL, Short, fog 0 | 3/3 | 2.7 | detected_too_late 1, braking_insufficient 1, stopped_too_close 1, no_encounter 2 |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - not supported
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.
- Evidence: failure rate 87% with vs 73% without (effect +14%, n=31).
- 89% of these failures were perception failures (never detected, or detected too late to stop)

### PedestrianClothingNotVisible - not supported
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).
- Evidence: failure rate 87% with vs 74% without (effect +12%, n=30).
- 81% of these failures were perception failures (never detected, or detected too late to stop)

### AdverseWeather - insufficient data
- Condition: `fog_density = 50`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Fog degrades detection confidence and adds inference latency (paper E4). 50% fog is still a realistic deployment condition.

### DetectionTooLate - SUPPORTED
- Condition: failures of type `detected_too_late`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- The detector only reaches the confidence bar when the pedestrian is already closer than the distance needed to stop at the approach speed. The pedestrian is visible for seconds before that; the bar (85%) is reached too late for the braking distance.
- Evidence: 43 of 49 encounter failures ended this way (88%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **data**: Fine-tune on distant / small pedestrian instances so confidence rises earlier.
  - **model**: A more sensitive detector, or a lower confidence bar with a second cue (risk: unnecessary braking).
  - **system**: Proportional braking from 30% confidence, full braking above 85% (paper M4) - the car starts slowing while the detector is still unsure.
  - **requirement**: State the approach-speed / minimum detection-distance assumption in the ODD (e.g. assuming "ego_speed <= 5"), or specify a time-to-brake bound.
  - **scenario**: The approach speed (EGO_SPEED = 7.5 m/s) and spawn distance are fixed constants of scratch.temp, not grammar parameters - the grid cannot vary them. Consider making speed a scenario parameter.

### BrakingNotLatched - not supported
- Condition: failures of type `brake_released`; blocks goal **Apply Brakes**
- Braking is applied only while the pedestrian is currently detected. When the pedestrian leaves the camera frame (very close, or passing) the car releases the brake and speeds up again before the closest point.
- Evidence: 2 of 49 encounter failures ended this way (4%; bar for support 25%).

### StandoffUnnecessaryStop - SUPPORTED
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 3 of 12 passes ended this way (25%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **model**: Raise the caution threshold only when the pedestrian is stationary and off the road (needs a track, not a per-frame confidence).
  - **system**: Time-box the cautious stop: creep forward / resume when the pedestrian has not moved toward the road for N seconds; distinguish 'pedestrian at kerb' from 'pedestrian crossing'.
  - **requirement**: Add the soft goal explicitly (e.g. 'resume within N s once the path is clear') and state the domain assumption that pedestrians cross only when the vehicle is within/beyond a given distance.
  - **scenario**: Fix the test: let the pedestrian cross on its own schedule (time- or distance-to-crossing-based), not only once the car is within 8 m (CrossingBehavior threshold in scratch.temp) - otherwise a cautious car can never be measured getting past.

### Candidate(direction=LR) - SUPPORTED
- Condition: `direction = LR`; blocks goal **Pedestrian Safety**
- Failures are 20% more frequent with crossing left-to-right. Not in the obstacle catalogue - needs a human to name or reject it.
- Evidence: failure rate 90% with vs 70% without (effect +20%, n=31).
- 100% of these failures were perception failures (never detected, or detected too late to stop)

## 6. Warnings about the data
- 3 of 12 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (the pedestrian's CrossingBehavior waits for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- 19 simulation(s) were 'no encounter': the car never came within 10 m of the pedestrian and never saw it. They are NOT counted as passes. If this is common, the scenario geometry (random lane / heading) is sending the car away from the pedestrian - fix the template, do not celebrate the passes.
- Only 61 encounters - treat rates as rough. 5 trials per scenario gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
