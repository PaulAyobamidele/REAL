# Round comparison: `35acc09e8c224fdc953e3bf82ba57e96` -> `882fb2fe00bf4568bdb480a281db9e8b`

## 1. One variable?
- `system_under_test.braking_mode`: `emergency_braking` -> `proportional_braking`
- `template_sha256`: `497527fe36991f675652f5aca5b96c66ec6601ba37b52a2bd82af2ecd89242d9` -> `89a952d0b417f83d9da8580ec29483afdd0103b5185d60ecf581719c7da7b53a`  (allowed: round-1 template fetched from Narval and diffed 2026-09-23: only the <ego_behavior> block and the perceive() cache differ (Notes.md 8.8))
- OK: only the system under test differs (plus the allowed, justified differences above).

## 2. Comparable metric: failure rate over true encounters

| | round A | round B | change |
|---|---|---|---|
| simulations | 160 | 160 | |
| no-encounter (car never met the pedestrian; excluded) | 40 | 32 | |
| true encounters | 120 | 128 | |
| failures | 91 | 4 | |
| **failure rate (encounters)** | **76%** | **3%** | -73% |
| passes that drove on normally | 17 | 11 | |
| passes that stalled (standoff; soft goal failed) | 12 | 113 | |
| set aside as spurious | 0 | 0 | |

## 3. How the failures happened

| failure type | round A | round B | change in share |
|---|---|---|---|
| never_detected | 1 (1%) | 0 (0%) | -1% |
| detected_not_braked | 0 (0%) | 0 (0%) | +0% |
| detected_too_late | 70 (77%) | 1 (25%) | -52% |
| brake_released | 17 (19%) | 1 (25%) | +6% |
| braking_insufficient | 2 (2%) | 0 (0%) | -2% |
| stopped_too_close | 1 (1%) | 2 (50%) | +49% |

## 4. Timing (medians over detected encounters)

| | round A | round B |
|---|---|---|
| first detection distance (m) | 7.0 | 7.6 |
| speed at first brake (m/s) | 7.2 | 2.0 |
| stopping distance needed (m) | 8.2 | 5.2 |
| detections too late | 65% | 1% |
| brake steps | 6.0 | 90.0 |
| still moving at closest point | 70% | 31% |

## 5. Obstacle verdicts

| obstacle | round A | round B |
|---|---|---|
| AdverseWeather | not_supported | not_supported |
| BrakingNotLatched | not_supported | insufficient_data  **changed** |
| Candidate(direction=LR) | supported | -  **changed** |
| DetectionTooLate | supported | insufficient_data  **changed** |
| PedestrianClothingNotVisible | supported | not_supported  **changed** |
| PedestrianSizeTooSmall | not_supported | not_supported |
| StandoffUnnecessaryStop | supported | supported |

Check these numbers against the prediction written down *before* round B ran (Notes.md).
