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
    "recorded_at",
]

CSV_NAME = "simulations.csv"
TRACES_DIR = "traces"

# Below this speed (m/s) at the end of the run, the car counts as stopped.
STOPPED_SPEED = 0.1

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
                   braking_mode="emergency", yolo_model=None, seed=None):
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


def end_simulation(rho, distances, speeds, timestep, termination="",
                   detection_threshold=0.85):
    """Summarise one finished simulation, append it to simulations.csv and
    dump the full trace. Returns the CSV row (or None if no run is active).

    distances: distance from the ego to the pedestrian at every step (m)
    speeds:    ego speed at every step (m/s); may be shorter than distances
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
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    _append_row(row)
    _write_trace(row, distances, speeds, detections, brakes)

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


def _write_trace(row, distances, speeds, detections, brakes):
    name = f"{row['scenario_id']}_{row['sim_index']}.json"
    path = os.path.join(_state["run_dir"], TRACES_DIR, name)
    with open(path, "w") as f:
        json.dump({
            "summary": row,
            "distance_m": distances,
            "ego_speed": speeds,
            "detections": detections,
            "brakes": brakes,
        }, f, indent=1)
