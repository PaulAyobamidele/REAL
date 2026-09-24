# Failure analysis - run `35acc09e8c224fdc953e3bf82ba57e96`

- Mode: grid | scenarios: 32 | trials per scenario: 5 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street in fog."

## 1. Scope (admissibility)
- 160 simulations in scope, 0 set aside as spurious.
  - No rule matched. Rules file: edit `scripts/analysis/admissibility_rules.json`.

## 2. Overall
- 160 simulations across 32 scenarios; 120 real encounters, 40 where the car never met the pedestrian (not counted as passes).
- 91 of 120 encounters failed (76%).
- Of the 29 passes, **12 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 17 passes drove on normally.
- How they failed: never_detected 1, detected_too_late 70, brake_released 17, braking_insufficient 2, stopped_too_close 1
- Timing (medians over 119 detected encounters): pedestrian first seen at 7.0 m while doing 7.2 m/s; stopping needs 8.2 m at that speed, so 65% of detections came too late; braking lasted 6 steps; still moving at the closest point in 70%; model inference 6.8 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 61 | 72% | 80% | -8% |
| pedestrian | Child | 59 | 80% | 72% | +8% |
| dress | Dark | 60 | 83% | 68% | +15% |
| dress | Light | 60 | 68% | 83% | -15% |
| direction | LR | 59 | 88% | 64% | +24% |
| direction | RL | 61 | 64% | 88% | -24% |
| distance | Long | 57 | 72% | 79% | -7% |
| distance | Short | 63 | 79% | 72% | +7% |
| fog_density | 0 | 61 | 80% | 71% | +9% |
| fog_density | 50 | 59 | 71% | 80% | -9% |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Child, Dark, RL, Short, fog 50 | 3/3 | 1.1 | detected_too_late 2, brake_released 1, no_encounter 2 |
| Adult, Dark, LR, Long, fog 0 | 3/3 | 1.3 | detected_too_late 3, no_encounter 2 |
| Adult, Light, LR, Short, fog 0 | 4/4 | 1.4 | detected_too_late 4, no_encounter 1 |
| Child, Dark, RL, Long, fog 0 | 4/4 | 1.5 | detected_too_late 3, braking_insufficient 1, no_encounter 1 |
| Child, Light, RL, Short, fog 0 | 3/3 | 1.6 | detected_too_late 3, no_encounter 2 |
| Child, Light, LR, Long, fog 0 | 4/4 | 1.6 | detected_too_late 4, no_encounter 1 |
| Adult, Dark, LR, Short, fog 0 | 4/4 | 1.7 | detected_too_late 4, no_encounter 1 |
| Child, Light, LR, Long, fog 50 | 2/2 | 1.8 | detected_too_late 2, no_encounter 3 |

Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.

## 5. Obstacles

### PedestrianSizeTooSmall - not supported
- Condition: `pedestrian = Child`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- A child has a small apparent size in the camera frame, so the detector rarely reaches the confidence needed to brake.
- Evidence: failure rate 80% with vs 72% without (effect +8%, n=59).
- 83% of these failures were perception failures (never detected, or detected too late to stop)

### PedestrianClothingNotVisible - SUPPORTED
- Condition: `dress = Dark`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Low-contrast clothing against the background lowers detection confidence (paper: 'visual saliency' obstacle class).
- Evidence: failure rate 83% with vs 68% without (effect +15%, n=60).
- 72% of these failures were perception failures (never detected, or detected too late to stop)
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **data**: Add low-contrast / cluttered-background pedestrian samples.
  - **model**: Lower the confidence threshold only when other cues agree (risk: more unnecessary braking).
  - **system**: Confidence-aware cautious braking (paper M4).
  - **requirement**: Make the contrast/visibility assumption explicit in the ODD.

### AdverseWeather - not supported
- Condition: `fog_density = 50`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- Fog degrades detection confidence and adds inference latency (paper E4). 50% fog is still a realistic deployment condition.
- Evidence: failure rate 71% with vs 80% without (effect -9%, n=59).
- 64% of these failures were perception failures (never detected, or detected too late to stop)

### DetectionTooLate - SUPPORTED
- Condition: failures of type `detected_too_late`; blocks goal **Detect Pedestrian**; challenges domain property *PedestrianVisible*
- The detector only reaches the confidence bar when the pedestrian is already closer than the distance needed to stop at the approach speed. The pedestrian is visible for seconds before that; the bar (85%) is reached too late for the braking distance.
- Evidence: 70 of 91 encounter failures ended this way (77%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **data**: Fine-tune on distant / small pedestrian instances so confidence rises earlier.
  - **model**: A more sensitive detector, or a lower confidence bar with a second cue (risk: unnecessary braking).
  - **system**: Proportional braking from 30% confidence, full braking above 85% (paper M4) - the car starts slowing while the detector is still unsure.
  - **requirement**: State the approach-speed / minimum detection-distance assumption in the ODD (e.g. assuming "ego_speed <= 5"), or specify a time-to-brake bound.

### BrakingNotLatched - not supported
- Condition: failures of type `brake_released`; blocks goal **Apply Brakes**
- Braking is applied only while the pedestrian is currently detected. When the pedestrian leaves the camera frame (very close, or passing) the car releases the brake and speeds up again before the closest point.
- Evidence: 17 of 91 encounter failures ended this way (19%; bar for support 25%).

### StandoffUnnecessaryStop - SUPPORTED
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 12 of 29 passes ended this way (41%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **model**: Raise the caution threshold only when the pedestrian is stationary and off the road (needs a track, not a per-frame confidence).
  - **system**: Time-box the cautious stop: creep forward / resume when the pedestrian has not moved toward the road for N seconds; distinguish 'pedestrian at kerb' from 'pedestrian crossing'.
  - **requirement**: Add the soft goal explicitly (e.g. 'resume within N s once the path is clear') and state the domain assumption that pedestrians cross only when the vehicle is within/beyond a given distance.

### Candidate(direction=LR) - SUPPORTED
- Condition: `direction = LR`; blocks goal **Pedestrian Safety**
- Failures are 24% more frequent with crossing left-to-right. Not in the obstacle catalogue - needs a human to name or reject it.
- Evidence: failure rate 88% with vs 64% without (effect +24%, n=59).
- 90% of these failures were perception failures (never detected, or detected too late to stop)

## 6. Warnings about the data
- 12 of 29 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (the pedestrian's CrossingBehavior waits for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- 40 simulation(s) were 'no encounter': the car never came within 10 m of the pedestrian and never saw it. They are NOT counted as passes. If this is common, the scenario geometry (random lane / heading) is sending the car away from the pedestrian - fix the template, do not celebrate the passes.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
