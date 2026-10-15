# Failure analysis - run `8ee4732cd82f426fa7ac9653c5aa71a5`

> Sampling: a chosen list of scenarios (e.g. a grid check of a GE run), each run equally often.
> Safety rule: the 5 m margin applies only while the pedestrian is in the car's path (within 2.5 m of the lane centre); 7 simulation(s) change verdict compared with the margin applied anywhere.

- Mode: list | scenarios: 24 | trials per scenario: 3 | seed: 42
- Requirement goal under test: **Detect Pedestrian** performed by `yolov5s`; scenario clause: "A pedestrian trying to cross the street."

## 1. Scope (admissibility)
- Assumptions stated in the requirement (`assuming ...`), checked per simulation:
  - `fog_density <= 50` (scenario setting): held 72, broken 0 -> **untested**
  - `sun_altitude_angle >= 0` (scenario setting): held 48, broken 24 -> **not load-bearing** (failure rate when held 4%, when broken 0%, over encounters)
  - `initial_separation_m >= 15` (measured in each run): held 72, broken 0 -> **untested**
  - `pedestrian_speed_mps <= 3` (measured in each run): held 72, broken 0 -> **untested**
  - Verdicts: load-bearing = failures at least 15 points higher when broken (the requirement depends on it); not load-bearing = within that (a candidate for loosening); untested = never broken (no evidence either way); insufficient data = fewer than 10 encounters on a side. A judgement call, not a significance test.
- Free-text assumptions (not checked automatically): "pedestrian on foot"
- 48 simulations in scope, 24 set aside as spurious.
  - rule `assumption: sun_altitude_angle >= 0`: 24 simulations (0 failed) - 8 scenarios. For the human: state this limit in the requirement, or drop the rule if the scenario is realistic.

## 2. Overall
- 48 simulations across 16 scenarios; 48 real encounters, 0 where the car never met the pedestrian (not counted as passes).
- 2 of 48 encounters failed (4%).
- Of the 46 passes, **44 were stalled**: the car stopped short and never moved again (standoff; counts as a pass for the safety rule, but the progress soft goal failed). 2 passes drove on normally.
- Soft goals stated in the requirement (`ensuring ...`), over in-scope encounters:
  - `resume_within_s <= 10`: met 25, missed 23
  - "braking is smooth unless an emergency stop is needed": free text, not checked automatically
  - 44 stalled passes are relevant to any progress / resume goal.
- How they failed: brake_released 2
- Timing (medians over 48 detected encounters): pedestrian first seen at 9.7 m, first brake at 16.7 m while doing 4.5 m/s; stopping needs 6.3 m at that speed, so 0% of detections came too late; braking lasted 232 steps; still moving at the closest point in 8%; model inference 6.9 ms/frame.

## 3. Which settings go with failure

| setting | value | n | failure rate | others | effect |
|---|---|---|---|---|---|
| pedestrian | Adult | 48 | 4% | n/a | +nan% (few data) |
| dress | Light | 48 | 4% | n/a | +nan% (few data) |
| direction | LR | 48 | 4% | n/a | +nan% (few data) |
| fog_density | 0 | 24 | 8% | 0% | +8% |
| fog_density | 40 | 24 | 0% | 8% | -8% |
| approach_distance_m | 20.0 | 48 | 4% | n/a | +nan% (few data) |
| pedestrian_min_speed_mps | 2.0 | 48 | 4% | n/a | +nan% (few data) |
| crossing_trigger_m | 0.0 | 48 | 4% | n/a | +nan% (few data) |
| sun_altitude_angle | 10.0 | 24 | 8% | 0% | +8% |
| sun_altitude_angle | 60.0 | 24 | 0% | 8% | -8% |
| wetness | 0.0 | 24 | 0% | 8% | -8% |
| wetness | 80.0 | 24 | 8% | 0% | +8% |
| precipitation | 0.0 | 48 | 4% | n/a | +nan% (few data) |
| cloudiness | 50.0 | 48 | 4% | n/a | +nan% (few data) |
| occlusion | 0.0 | 24 | 8% | 0% | +8% |
| occlusion | 1.0 | 24 | 0% | 8% | -8% |

*effect* = failure rate with this value minus failure rate with the other value(s). Effects under 15% are treated as noise.

## 4. Worst scenarios

| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |
|---|---|---|---|
| Adult, Light, LR, fog 0 | 2/3 | 3.6 | brake_released 2, passed_stalled 1 |
| Adult, Light, LR, fog 0 | 0/3 | 3.5 | passed_stalled 2 |
| Adult, Light, LR, fog 0 | 0/3 | 3.9 | passed_stalled 2 |
| Adult, Light, LR, fog 0 | 0/3 | 6.8 | passed_stalled 3 |
| Adult, Light, LR, fog 40 | 0/3 | 6.9 | passed_stalled 3 |
| Adult, Light, LR, fog 40 | 0/3 | 7.3 | passed_stalled 3 |
| Adult, Light, LR, fog 0 | 0/3 | 7.5 | passed_stalled 3 |
| Adult, Light, LR, fog 0 | 0/3 | 7.5 | passed_stalled 3 |

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
- Evidence: 0 of 2 encounter failures ended this way (0%; bar for support 25%).

### BrakingNotLatched - insufficient data
- Condition: failures of type `brake_released`; blocks goal **Apply Brakes**
- Braking is applied only while the pedestrian is currently detected. When the pedestrian leaves the camera frame (very close, or passing) the car releases the brake and speeds up again before the closest point.
- Evidence: 2 of 2 encounter failures ended this way (100%; bar for support 25%).

### StandoffUnnecessaryStop - SUPPORTED
- Condition: passes of type `passed_stalled`; blocks soft goal **Smooth Braking / Progress**; challenges domain property *PedestrianCrossesWhenSafe*
- The safety goal holds, but the car stops well short of the crossing and never resumes: the pedestrian waits for the car, the car waits for the pedestrian. The paper's soft goal (SmoothBraking / making progress) fails where the safety goal now succeeds - the mitigation shifted the failure mode.
- Evidence: 44 of 46 passes ended this way (96%; bar for support 25%).
- Candidate mitigations (paper Sec. IV-C), for the human to choose from:
  - **model**: Raise the caution threshold only when the pedestrian is stationary and off the road (needs a track, not a per-frame confidence).
  - **system**: Time-box the cautious stop: creep forward / resume when the pedestrian has not moved toward the road for N seconds; distinguish 'pedestrian at kerb' from 'pedestrian crossing'.
  - **requirement**: Add the soft goal explicitly (e.g. 'resume within N s once the path is clear') and state the domain assumption that pedestrians cross only when the vehicle is within/beyond a given distance.
  - **scenario**: Fix the test: let the pedestrian cross on its own schedule (time- or distance-to-crossing-based), not only once the car is within 8 m (CrossingBehavior threshold in scratch.temp) - otherwise a cautious car can never be measured getting past.

## 6. Warnings about the data
- 44 of 46 passes were 'stalled': the car braked to a standstill and never moved again before the time limit. The safety rule held, but the car did not get past the crossing - a standoff (in scene v1 the pedestrian also waited for the car to come within 8 m). Read the pass rate with this in mind; it is the paper's 'mitigation shifts the failure mode' effect.
- Failures (4% overall) do not vary with any scenario setting (largest effect 8% < 15%). That pattern points at the scoring or the fixed parts of the scenario (approach speed, confidence bar, braking logic), not at the settings the grammar varies.
- Only 48 encounters - treat rates as rough. 5 trials per scenario gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.

## 7. For the human
- Confirm, rename or reject each obstacle above.
- Decide for each spurious group: is that scenario really out of scope? If yes, write the limit into the requirement; if no, remove the rule.
- Pick a mitigation per confirmed obstacle; the requirement-level ones become the proposed requirement change (stage 8).
