"""Per-simulation telemetry for failure analysis (pipeline stage 6 input).

The GE/grid search only ever needed a pass/fail count per scenario. Failure
analysis needs to know *what happened* in each individual simulation: how
close the car got to the pedestrian, whether/when the perception model saw
the pedestrian and how confident it was, when the car started braking, how
fast it was going. This module collects those facts while a simulation runs
and writes them out as soon as it ends, so a job that dies halfway still
leaves usable data behind.

Layout under the run directory (settings.artifacts_dir/runs/<run_id>/):

    simulations.csv        one row per simulation (see FIELDS)
    traces/<scenario>_<sim>.json   full time series + raw events for that simulation

Everything here is plain Python with no Scenic/CARLA dependency, so the
scenario template (scripts/scenarios/scratch.temp) can import it and call
log_detection()/log_brake() from inside the running simulation, and the
monitor in scripts/simulations/util.py can call end_simulation() afterwards.
Module-level state is fine because simulations run strictly one at a time
(Scenic's signal.alarm timeouts already force the whole pipeline onto the
main thread - see api_app.py).
"""

import csv
import math
import json
import os
from datetime import datetime, timezone

FIELDS = [
    "run_id", "scenario_id", "sim_index", "phenotype",
    "pedestrian", "dress", "direction", "distance", "fog_density",
    "pedestrian_blueprint", "braking_mode", "yolo_model", "seed",
    # outcome
    "passed", "rho", "min_distance_m", "min_distance_step",
    "ego_speed_at_min_distance", "steps", "timestep_s", "duration_s",
    "termination",
    # ego
    "ego_speed_max", "ego_speed_final", "stopped",
    # perception
    "frames_seen", "detection_frames", "max_confidence",
    "first_detection_step", "first_detection_conf",
    "first_detection_distance_m", "ego_speed_at_first_detection",
    "mean_inference_ms",
    # braking
    "first_brake_step", "first_brake_distance_m", "ego_speed_at_first_brake",
    "brake_steps", "reaction_steps",
    # scene v2 (roadmap M2): the scene's settings, the pedestrian, and the
    # soft-goal measures (smoothness, time-to-collision, moving on again)
    "approach_distance_m", "crossing_trigger_m", "pedestrian_min_speed_mps",
    "pedestrian_speed_mps", "crossing_start_distance_m",
    "peak_decel_mps2", "peak_jerk_mps3", "min_ttc_s",
    "first_stop_step", "resumed", "resume_after_s", "resume_within_s",
    "left_road", "left_road_step",
    "max_heading_off_lane_deg", "max_lane_offset_m",
    "ped_lateral_start_m", "ped_lateral_end_m", "crossed",
    "recorded_at",
]

CSV_NAME = "simulations.csv"
TRACES_DIR = "traces"

# Below this speed (m/s) at the end of the run, the car counts as stopped.
STOPPED_SPEED = 0.1
# After a stop, the car counts as having moved on again at this speed (m/s).
RESUME_SPEED = 2.0
# The pedestrian counts as walking above this speed (m/s).
WALKING_SPEED = 0.2
# Steps ignored at the start of a run for deceleration / jerk: the car is
# dropped into the world and settles (1 s at 0.1 s per step).
SETTLE_STEPS = 10


def motion_metrics(distances, speeds, pedestrian_speeds, timestep, on_road=None):
    """Soft-goal and pedestrian measures from the per-step series. Pure
    function (unit-tested). None where the series do not allow it.

    peak_decel_mps2   largest drop in ego speed per second
    peak_jerk_mps3    largest change of acceleration per second (smoothness)
    min_ttc_s         smallest distance / closing speed while closing in
    first_stop_step   first step the car is below STOPPED_SPEED
    resumed           after that stop, did it reach RESUME_SPEED again
    resume_after_s    seconds from the stop to RESUME_SPEED
    resume_within_s   0 if it never stopped, resume_after_s if it moved on,
                      inf if it stopped and never moved on (standoff)
    pedestrian_speed_mps        the pedestrian's top speed
    crossing_start_distance_m   car-pedestrian distance when the pedestrian started walking
    left_road / left_road_step  the car left the drivable area (a test defect, not a pass)

    Deceleration and jerk skip the first SETTLE_STEPS and any step off the road.
    """
    out = dict.fromkeys(("peak_decel_mps2", "peak_jerk_mps3", "min_ttc_s", "first_stop_step",
                         "resumed", "resume_after_s", "resume_within_s",
                         "pedestrian_speed_mps", "crossing_start_distance_m",
                         "left_road", "left_road_step"))
    dt = timestep
    on_road = list(on_road or [])
    if on_road:
        off = next((i for i, v in enumerate(on_road) if not v), None)
        out["left_road"] = off is not None
        out["left_road_step"] = off
    if pedestrian_speeds:
        out["pedestrian_speed_mps"] = max(pedestrian_speeds)
        start = next((i for i, v in enumerate(pedestrian_speeds) if v > WALKING_SPEED), None)
        if start is not None and start < len(distances):
            out["crossing_start_distance_m"] = distances[start]
    if speeds:
        stop = next((i for i, v in enumerate(speeds) if v < STOPPED_SPEED), None)
        # a car that is stopped at the very first step has not "stopped" yet
        if stop == 0:
            moving = next((i for i, v in enumerate(speeds) if v >= STOPPED_SPEED), None)
            stop = next((i for i, v in enumerate(speeds) if moving is not None and i > moving
                         and v < STOPPED_SPEED), None)
        out["first_stop_step"] = stop
        if stop is None:
            out["resumed"], out["resume_within_s"] = False, 0.0
        else:
            again = next((i for i in range(stop, len(speeds)) if speeds[i] >= RESUME_SPEED), None)
            out["resumed"] = again is not None
            if again is not None and dt:
                out["resume_after_s"] = (again - stop) * dt
                out["resume_within_s"] = out["resume_after_s"]
            elif again is None:
                out["resume_within_s"] = float("inf")
    if not dt:
        return out
    usable = [i for i in range(SETTLE_STEPS, len(speeds))
              if not on_road or (i < len(on_road) and on_road[i])]
    accel = {i: (speeds[i + 1] - speeds[i]) / dt for i in usable if i + 1 in usable}
    if accel:
        out["peak_decel_mps2"] = max(0.0, -min(accel.values()))
        jerks = [abs(accel[i + 1] - accel[i]) / dt for i in accel if i + 1 in accel]
        if jerks:
            out["peak_jerk_mps3"] = max(jerks)
    ttcs = []
    for i in range(len(distances) - 1):
        closing = (distances[i] - distances[i + 1]) / dt
        if closing > 0.1:
            ttcs.append(distances[i + 1] / closing)
    out["min_ttc_s"] = min(ttcs) if ttcs else None
    return out

_state = {
    "run_id": None,
    "run_dir": None,
    "scenario": None,   # dict set by begin_scenario()
    "sim_index": 0,
    "detections": [],
    "brakes": [],
}


def set_run(run_id, run_dir):
    """Point telemetry at a run directory. Call once per GE/grid run."""
    _state["run_id"] = run_id
    _state["run_dir"] = run_dir
    _state["scenario"] = None
    _state["sim_index"] = 0
    os.makedirs(os.path.join(run_dir, TRACES_DIR), exist_ok=True)


def clear():
    """Forget the current run (mainly for tests)."""
    _state.update(run_id=None, run_dir=None, scenario=None, sim_index=0,
                  detections=[], brakes=[])


def begin_scenario(scenario_id, phenotype, params, pedestrian_blueprint=None,
                   braking_mode="emergency", yolo_model=None, seed=None, scene=None):
    """Record which scenario the next simulations belong to.

    `params` is the {pedestrian, dress, direction, distance, fog_density}
    dict parsed from the phenotype string.
    """
    _state["scenario"] = {
        "scenario_id": scenario_id,
        "phenotype": phenotype,
        "pedestrian": params.get("pedestrian"),
        "dress": params.get("dress"),
        "direction": params.get("direction"),
        "distance": params.get("distance"),
        "fog_density": params.get("fog_density"),
        "pedestrian_blueprint": pedestrian_blueprint,
        "braking_mode": braking_mode,
        "yolo_model": yolo_model,
        "seed": seed,
        **{k: (scene or {}).get(k) for k in ("approach_distance_m", "crossing_trigger_m",
                                             "pedestrian_min_speed_mps")},
    }
    _state["sim_index"] = 0


def begin_simulation():
    """Reset the per-simulation event buffers. Call right before each simulation."""
    _state["detections"] = []
    _state["brakes"] = []


# NB: the keyword is `dist_m`, not `distance` - `distance` is a Scenic operator
# keyword and these two functions are called from inside a .scenic template.
def log_detection(step, confidence, inference_ms, ego_speed, dist_m):
    """Called from the scenario template on every camera frame the model looks at."""
    _state["detections"].append({
        "step": int(step),
        "confidence": float(confidence),
        "inference_ms": float(inference_ms),
        "ego_speed": float(ego_speed),
        "distance": float(dist_m),
    })


def log_brake(step, brake, ego_speed, dist_m):
    """Called from the scenario template on every step the car is braking."""
    _state["brakes"].append({
        "step": int(step),
        "brake": float(brake),
        "ego_speed": float(ego_speed),
        "distance": float(dist_m),
    })


def heading_off_lane_deg(ego_headings, lane_headings):
    """Largest angle (degrees, 0-180) between the car's heading and the lane's
    heading over the run; None if not recorded."""
    pairs = list(zip(ego_headings or [], lane_headings or []))
    if not pairs:
        return None
    return max(abs(math.degrees((e - l + math.pi) % (2 * math.pi) - math.pi)) for e, l in pairs)


# The pedestrian has crossed once it is this far past the lane centre on the
# side opposite to where it started (m).
CROSSED_PAST_CENTRE_M = 1.0


def crossing(ped_laterals):
    """(start, end, crossed) from the pedestrian's lateral positions (m from
    the lane centre). crossed = it reached CROSSED_PAST_CENTRE_M beyond the
    centre on the far side; None when not recorded (runs before scene v2.2)."""
    xs = list(ped_laterals or [])
    if not xs:
        return None, None, None
    start = xs[0]
    side = 1 if start >= 0 else -1
    crossed = any(x * side <= -CROSSED_PAST_CENTRE_M for x in xs)
    return start, xs[-1], crossed


def end_simulation(rho, distances, speeds, timestep, termination="",
                   detection_threshold=0.85, pedestrian_speeds=None, on_road=None,
                   ego_headings=None, lane_headings=None, lane_offsets=None,
                   ped_laterals=None):
    """Summarise one finished simulation, append it to simulations.csv and
    dump the full trace. Returns the CSV row (or None if no run is active).

    distances: distance from the ego to the pedestrian at every step (m)
    speeds:    ego speed at every step (m/s); may be shorter than distances
    pedestrian_speeds: pedestrian speed at every step (m/s); scene v2 only
    """
    if _state["run_dir"] is None:
        return None

    scenario = _state["scenario"] or {}
    sim_index = _state["sim_index"]
    _state["sim_index"] += 1

    detections = _state["detections"]
    brakes = _state["brakes"]
    distances = [float(d) for d in distances]
    speeds = [float(s) for s in speeds]
    pedestrian_speeds = [float(s) for s in pedestrian_speeds or []]

    steps = len(distances)
    if distances:
        min_distance_step = min(range(steps), key=distances.__getitem__)
        min_distance = distances[min_distance_step]
    else:
        min_distance_step, min_distance = None, None

    def speed_at(step):
        if step is None or not speeds:
            return None
        return speeds[min(step, len(speeds) - 1)]

    detected = [d for d in detections if d["confidence"] > detection_threshold]
    first_detection = detected[0] if detected else None
    first_brake = brakes[0] if brakes else None

    reaction_steps = None
    if first_detection and first_brake:
        reaction_steps = first_brake["step"] - first_detection["step"]

    row = {
        "run_id": _state["run_id"],
        "scenario_id": scenario.get("scenario_id"),
        "sim_index": sim_index,
        "phenotype": scenario.get("phenotype"),
        "pedestrian": scenario.get("pedestrian"),
        "dress": scenario.get("dress"),
        "direction": scenario.get("direction"),
        "distance": scenario.get("distance"),
        "fog_density": scenario.get("fog_density"),
        "pedestrian_blueprint": scenario.get("pedestrian_blueprint"),
        "braking_mode": scenario.get("braking_mode"),
        "yolo_model": scenario.get("yolo_model"),
        "seed": scenario.get("seed"),
        "passed": (rho is not None and rho > 0),
        "rho": rho,
        "min_distance_m": min_distance,
        "min_distance_step": min_distance_step,
        "ego_speed_at_min_distance": speed_at(min_distance_step),
        "steps": steps,
        "timestep_s": timestep,
        "duration_s": steps * timestep if timestep else None,
        "termination": termination,
        "ego_speed_max": max(speeds) if speeds else None,
        "ego_speed_final": speeds[-1] if speeds else None,
        "stopped": (speeds[-1] < STOPPED_SPEED) if speeds else None,
        "frames_seen": len(detections),
        "detection_frames": len(detected),
        "max_confidence": max((d["confidence"] for d in detections), default=None),
        "first_detection_step": first_detection["step"] if first_detection else None,
        "first_detection_conf": first_detection["confidence"] if first_detection else None,
        "first_detection_distance_m": first_detection["distance"] if first_detection else None,
        "ego_speed_at_first_detection": first_detection["ego_speed"] if first_detection else None,
        "mean_inference_ms": (sum(d["inference_ms"] for d in detections) / len(detections))
                             if detections else None,
        "first_brake_step": first_brake["step"] if first_brake else None,
        "first_brake_distance_m": first_brake["distance"] if first_brake else None,
        "ego_speed_at_first_brake": first_brake["ego_speed"] if first_brake else None,
        "brake_steps": len(brakes),
        "reaction_steps": reaction_steps,
        "approach_distance_m": scenario.get("approach_distance_m"),
        "crossing_trigger_m": scenario.get("crossing_trigger_m"),
        "pedestrian_min_speed_mps": scenario.get("pedestrian_min_speed_mps"),
        **motion_metrics(distances, speeds, pedestrian_speeds, timestep, on_road),
        "max_heading_off_lane_deg": heading_off_lane_deg(ego_headings, lane_headings),
        "max_lane_offset_m": max(lane_offsets) if lane_offsets else None,
        **dict(zip(("ped_lateral_start_m", "ped_lateral_end_m", "crossed"), crossing(ped_laterals))),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    _append_row(row)
    _write_trace(row, distances, speeds, detections, brakes, pedestrian_speeds,
                 {"on_road": list(on_road or []), "ego_heading": list(ego_headings or []),
                  "lane_heading": list(lane_headings or []), "lane_offset_m": list(lane_offsets or []),
                  "ped_lateral_m": list(ped_laterals or [])})

    _state["detections"] = []
    _state["brakes"] = []
    return row


def csv_path(run_dir=None):
    return os.path.join(run_dir or _state["run_dir"], CSV_NAME)


def _append_row(row):
    path = csv_path()
    new_file = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        if new_file:
            writer.writeheader()
        writer.writerow(row)


def _write_trace(row, distances, speeds, detections, brakes, pedestrian_speeds=None, extra=None):
    name = f"{row['scenario_id']}_{row['sim_index']}.json"
    path = os.path.join(_state["run_dir"], TRACES_DIR, name)
    with open(path, "w") as f:
        json.dump({
            "summary": row,
            "distance_m": distances,
            "ego_speed": speeds,
            "pedestrian_speed": pedestrian_speeds or [],
            **(extra or {}),
            "detections": detections,
            "brakes": brakes,
        }, f, indent=1)
