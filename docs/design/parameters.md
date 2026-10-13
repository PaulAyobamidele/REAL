# Scenario parameters — inventory (study plan task 1a.1)

What the simulator lets a requirement vary for the pedestrian-crossing scene,
and how each parameter is handled. Rule: a parameter is exposed only together
with a telemetry column, an assumption quantity (world parameters only) and a
scenario keyword — otherwise it is a blind spot.

**World** parameters describe the environment and may appear in `assuming`.
**System** parameters describe the car under test; they are chosen with
`performed by` and are refused as assumptions.

## Weather — passed to `carla.WeatherParameters` (CARLA 0.9.13)

| Parameter | Range | Today | Kind |
|---|---|---|---|
| `fog_density` | 0-100 | varied (0/50; GE 0-100) | world |
| `fog_distance` | m | fixed (CARLA default) | world |
| `sun_altitude_angle` | -90..90 (below 0 = night) | **exposed** (default 60) | world — time of day |
| `sun_azimuth_angle` | 0-360 | **exposed** (default 80) | world |
| `cloudiness` | 0-100 | **exposed** (default 50) | world |
| `precipitation` | 0-100 | **exposed** (default 0) | world — rain |
| `precipitation_deposits` | 0-100 | **set equal to `wetness`** | world — puddles |
| `wetness` | 0-100 | **exposed** (default 0) | world — wet road |
| `wind_intensity` | 0-100 | default | world |

## Pedestrian

| Parameter | Values | Today | Kind |
|---|---|---|---|
| `pedestrian` | Adult / Child | varied | world |
| `dress` | Light / Dark | varied | world |
| `direction` | LR / RL | varied | world |
| `pedestrian_min_speed_mps` | 1-4 | varied in GE | world |
| `crossing_trigger_m` | 0 = meet the car; > 0 m | varied in GE | world |

## Scene

| Parameter | Values | Today | Kind |
|---|---|---|---|
| `approach_distance_m` / `distance` | 10-50 m / Short, Long | varied | world (start position) |
| `occlusion` | 0 / 1: a parked car on the pedestrian's kerb, 6 m before the crossing point, 3 m from the lane centre | **exposed** (default 0) | world — new object |
| map / location | Town01 lanes away from intersections | random lane | world |

## System under test

| Parameter | Values | Kind |
|---|---|---|
| braking module | emergency_braking, proportional_braking, path_aware_braking (brakes only for a person estimated in the lane, then drives on); unknown names refused | system |
| detector | yolov5s, yolov5m, fine_tune, few_shot (+ YOLO26 once loaded); names without weights refused | system |
| cruising speed (`EGO_SPEED` 7.5 m/s) | fixed | system — not assumable |

## Status (task 1a.2)

Exposed end to end: scene template (`scratch.temp`), scene builder
(`util.world_settings`, defaults = the values of every earlier run),
telemetry columns (`telemetry.SCENE_COLUMNS`), assumption quantities
(`admissibility.QUANTITIES`), effects table (`failure_model.PARAMS`, bands
at the midpoint), scenario keywords (`constraints.CONTROLLED_VOCAB`: night,
dusk, dawn, daytime, sunny, wet, puddle, dry, rain, parked, hidden, occluded).
Negative values (night) are read in scenarios and assumptions. Live-tool
grammar: `scripts/templates/v3/scene_v3.bnf`. Not exposed yet: `fog_distance`,
`wind_intensity`, map location.
