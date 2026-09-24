import csv
import json
import os

import pytest

from scripts.analysis import telemetry

PARAMS = {"pedestrian": "Child", "dress": "Dark", "direction": "LR",
          "distance": "Long", "fog_density": "50"}


@pytest.fixture
def run(tmp_path):
    telemetry.set_run("run-1", str(tmp_path))
    yield str(tmp_path)
    telemetry.clear()


def test_end_simulation_without_run_is_noop():
    telemetry.clear()
    assert telemetry.end_simulation(rho=1.0, distances=[10], speeds=[1], timestep=0.1) is None


def test_end_simulation_writes_row_and_trace(run):
    telemetry.begin_scenario(3, "phenotype text", PARAMS, pedestrian_blueprint="walker.pedestrian.0013",
                             yolo_model="yolov5s", seed=45)
    telemetry.begin_simulation()
    # model looks at 3 frames: nothing, weak, confident
    telemetry.log_detection(step=1, confidence=0.0, inference_ms=10, ego_speed=7.5, dist_m=20)
    telemetry.log_detection(step=2, confidence=0.5, inference_ms=12, ego_speed=7.5, dist_m=18)
    telemetry.log_detection(step=3, confidence=0.9, inference_ms=14, ego_speed=7.4, dist_m=16)
    telemetry.log_brake(step=4, brake=1.0, ego_speed=7.0, dist_m=15)
    telemetry.log_brake(step=5, brake=1.0, ego_speed=5.0, dist_m=14)

    distances = [20, 18, 16, 15, 14, 13.5, 13.5]
    speeds = [7.5, 7.5, 7.4, 7.0, 5.0, 1.0, 0.0]
    row = telemetry.end_simulation(rho=13.5 - 5, distances=distances, speeds=speeds,
                                   timestep=0.1, termination="terminate when")

    assert row["run_id"] == "run-1"
    assert row["scenario_id"] == 3 and row["sim_index"] == 0
    assert row["pedestrian"] == "Child" and row["fog_density"] == "50"
    assert row["passed"] is True and row["rho"] == 8.5
    assert row["min_distance_m"] == 13.5 and row["min_distance_step"] == 5
    assert row["ego_speed_at_min_distance"] == 1.0
    assert row["steps"] == 7 and row["duration_s"] == pytest.approx(0.7)
    assert row["ego_speed_max"] == 7.5 and row["stopped"] is True
    assert row["frames_seen"] == 3 and row["detection_frames"] == 1
    assert row["max_confidence"] == 0.9
    assert row["first_detection_step"] == 3 and row["first_detection_distance_m"] == 16
    assert row["mean_inference_ms"] == pytest.approx(12.0)
    assert row["first_brake_step"] == 4 and row["brake_steps"] == 2
    assert row["reaction_steps"] == 1

    with open(os.path.join(run, telemetry.CSV_NAME)) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    assert rows[0]["phenotype"] == "phenotype text"
    assert set(rows[0].keys()) == set(telemetry.FIELDS)

    with open(os.path.join(run, telemetry.TRACES_DIR, "3_0.json")) as f:
        trace = json.load(f)
    assert trace["distance_m"] == distances
    assert len(trace["detections"]) == 3 and len(trace["brakes"]) == 2


def test_rows_append_and_sim_index_increments(run):
    telemetry.begin_scenario(0, "p", PARAMS)
    for _ in range(3):
        telemetry.begin_simulation()
        telemetry.end_simulation(rho=-1.0, distances=[4.0], speeds=[3.0], timestep=0.1)
    with open(os.path.join(run, telemetry.CSV_NAME)) as f:
        rows = list(csv.DictReader(f))
    assert [r["sim_index"] for r in rows] == ["0", "1", "2"]
    assert all(r["passed"] == "False" for r in rows)
    assert all(r["first_detection_step"] == "" for r in rows)  # never detected


def test_begin_simulation_discards_stale_events(run):
    telemetry.begin_scenario(0, "p", PARAMS)
    telemetry.begin_simulation()
    telemetry.log_brake(step=1, brake=1.0, ego_speed=1.0, dist_m=1.0)
    telemetry.begin_simulation()  # e.g. previous attempt failed to create
    row = telemetry.end_simulation(rho=1.0, distances=[10], speeds=[1], timestep=0.1)
    assert row["brake_steps"] == 0
