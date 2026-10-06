"""Scene v2 (roadmap M2, Notes 8.19): geometry from the grid settings, the
new per-simulation measures, and soft goals checked from them. No CARLA."""

import csv
import math
import os

import pandas as pd
import pytest

from scripts.analysis import report, soft_goals, telemetry
from scripts.simulations import util
from test_analysis import write_synthetic_run
from test_requirement_wiring import PHENOTYPE   # Child, Dark, LR, Long, fog 50

scenic = pytest.importorskip("scenic")
from scenic.syntax.parser import parse_string  # noqa: E402


# --- geometry -------------------------------------------------------------

def test_scene_settings_both_directions_cross_and_distance_matters():
    lr, rl = util.scene_settings("LR", "Short"), util.scene_settings("RL", "Long")
    assert (lr["pedestrian_side"], lr["pedestrian_angle"]) == (-1, -90)   # left kerb, walks right
    assert (rl["pedestrian_side"], rl["pedestrian_angle"]) == (1, 90)     # right kerb, walks left
    assert abs(lr["pedestrian_angle"]) == abs(rl["pedestrian_angle"]) == 90   # both cross
    assert (lr["approach_distance_m"], rl["approach_distance_m"]) == (20, 35)
    assert lr["crossing_trigger_m"] == util.DEFAULT_CROSSING_TRIGGER_M
    assert util.scene_settings("LR", "Short", crossing_trigger_m=8)["crossing_trigger_m"] == 8
    with pytest.raises(ValueError):
        util.scene_settings("UP", "Short")
    with pytest.raises(ValueError):
        util.scene_settings("LR", "Medium")


def test_build_scenario_writes_scene_v2_and_parses():
    code, params = util.build_scenario(PHENOTYPE)
    assert "CROSSING_TRIGGER_M = 100" in code and "APPROACH_DISTANCE_M = 35" in code
    assert "PEDESTRIAN_SIDE = -1" in code and "with heading (spot.heading + (-90 deg))" in code
    assert "facing lane.orientation" in code and "following lane.orientation from spot" in code
    code_lines = [l for l in code.splitlines() if not l.lstrip().startswith("#")]
    assert not any("roadDirection" in l for l in code_lines)   # the off-road cause (Notes 8.25)
    assert 'record (ego.position in network.drivableRegion) as "on_road"' in code
    assert "relative heading of ego from spot" in code
    assert "require ego.lane == lane" in code
    assert 'record pedestrian.speed as "pedestrian_speed"' in code
    assert "THRESHOLD" not in code and "(distance to spot) > 30" not in code
    assert params["approach_distance_m"] == 35 and params["crossing_trigger_m"] == 100
    parse_string(code, "exec", filename="scratch.temp")


def test_simulations_are_long_enough_to_see_moving_on():
    assert util.MAX_STEPS * 0.1 >= 20     # a 10 s resume goal must be observable


# --- motion measures -----------------------------------------------------

DT = 0.1


def _brake_then(resume_after_steps=None, steps=200):
    """7.5 m/s, brakes to 0 over 1 s, waits, then (optionally) speeds up to 4 m/s."""
    speeds = [7.5] * 20 + [7.5 - 0.75 * i for i in range(1, 11)]
    if resume_after_steps is None:
        speeds += [0.0] * (steps - len(speeds))
    else:
        speeds += [0.0] * resume_after_steps + [0.5 * i for i in range(1, 9)]
    distances = [max(1.0, 30 - 0.5 * i) for i in range(len(speeds))]
    return distances, speeds


def test_resume_measured_after_a_stop():
    d, v = _brake_then(resume_after_steps=30)
    m = telemetry.motion_metrics(d, v, [0.0] * 5 + [1.5] * (len(v) - 5), DT)
    assert m["first_stop_step"] == 29 and m["resumed"] is True
    # 0 m/s at step 29, standing to step 59, 2.0 m/s at step 63
    assert m["resume_after_s"] == pytest.approx(3.4) and m["resume_within_s"] == pytest.approx(3.4)
    assert m["peak_decel_mps2"] == pytest.approx(7.5)
    assert m["pedestrian_speed_mps"] == 1.5 and m["crossing_start_distance_m"] == pytest.approx(27.5)
    assert m["min_ttc_s"] is not None and m["min_ttc_s"] > 0


def test_standoff_never_resumes_and_no_stop_is_zero():
    d, v = _brake_then(resume_after_steps=None)
    m = telemetry.motion_metrics(d, v, [], DT)
    assert m["resumed"] is False and math.isinf(m["resume_within_s"])
    assert m["pedestrian_speed_mps"] is None                      # not recorded
    m = telemetry.motion_metrics([20, 19, 18], [7.5, 7.5, 7.5], [], DT)
    assert m["first_stop_step"] is None and m["resume_within_s"] == 0.0


def test_end_simulation_writes_new_columns_and_trace(tmp_path):
    telemetry.set_run("r", str(tmp_path))
    telemetry.begin_scenario(0, "p", {"direction": "LR", "distance": "Short"},
                             scene={"approach_distance_m": 20, "crossing_trigger_m": 100})
    telemetry.begin_simulation()
    d, v = _brake_then(resume_after_steps=10)
    telemetry.end_simulation(rho=1.0, distances=d, speeds=v, timestep=DT,
                             pedestrian_speeds=[1.2] * len(v))
    telemetry.clear()
    row = next(csv.DictReader(open(tmp_path / "simulations.csv")))
    assert row["approach_distance_m"] == "20" and row["resumed"] == "True"
    assert float(row["pedestrian_speed_mps"]) == 1.2
    assert os.path.exists(tmp_path / "traces" / "0_0.json")


# --- soft goals ------------------------------------------------------------

def test_soft_goal_parsing_and_status():
    g = soft_goals.parse_soft_goal("resume_within_s <= 10")
    assert g["kind"] == "checked"
    assert soft_goals.goal_status(g, 3.4) == "met"
    assert soft_goals.goal_status(g, float("inf")) == "missed"      # standoff
    assert soft_goals.goal_status(g, None) == "not_measured"
    assert soft_goals.parse_soft_goal("braking is smooth")["kind"] == "free_text"
    assert soft_goals.parse_soft_goal("comfort > 3")["kind"] == "rejected"


def test_check_soft_goals_over_encounters_only():
    df = pd.DataFrame({"resume_within_s": [0.0, 3.0, float("inf"), float("inf")],
                       "encounter": [True, True, True, False]})
    out = soft_goals.check_soft_goals(df, ["resume_within_s <= 10", "smooth"])
    assert (out[0]["met"], out[0]["missed"], out[0]["not_measured"]) == (2, 1, 0)
    assert out[1]["kind"] == "free_text"


def test_report_on_pre_v2_run_says_not_measured(tmp_path):
    req = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
           'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
           'producing output "flag" in scenario where "fog" ensuring "resume_within_s <= 10"')
    write_synthetic_run(str(tmp_path), trials=1, requirement=req)
    analysis, md = report.write_report(str(tmp_path))
    assert analysis["soft_goals"][0]["kind"] == "checked"
    assert "`resume_within_s <= 10`: not measured in this run" in md


# --- the off-road fix (Notes 8.25) -------------------------------------------

def test_leaving_the_road_is_recorded():
    d, v = _brake_then(resume_after_steps=10)
    road = [True] * 15 + [False] * (len(v) - 15)
    m = telemetry.motion_metrics(d, v, [], DT, on_road=road)
    assert m["left_road"] is True and m["left_road_step"] == 15
    m = telemetry.motion_metrics(d, v, [], DT, on_road=[True] * len(v))
    assert m["left_road"] is False and m["left_road_step"] is None
    assert telemetry.motion_metrics(d, v, [], DT)["left_road"] is None     # not recorded


def test_braking_measures_skip_the_settling_second_and_off_road():
    v = [0.0, 6.0, 0.5, 7.5] + [7.5] * 30                # spawn jolt in the first steps
    d = [30.0 - 0.5 * i for i in range(len(v))]
    m = telemetry.motion_metrics(d, v, [], DT)
    assert m["peak_decel_mps2"] == 0.0                   # the jolt is ignored
    v2 = [7.5] * 20 + [0.0] * 20                          # "stop" caused by hitting the kerb off road
    road = [True] * 18 + [False] * 22
    m = telemetry.motion_metrics([20.0] * 40, v2, [], DT, on_road=road)
    assert m["peak_decel_mps2"] == 0.0


def test_left_road_runs_are_a_test_defect_not_a_pass(tmp_path):
    from scripts.analysis import failure_model
    write_synthetic_run(str(tmp_path), trials=1)
    path = tmp_path / "simulations.csv"
    rows = list(csv.DictReader(open(path)))
    for r in rows[:3]:
        r["left_road"] = "True"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    model = failure_model.build_failure_model(failure_model.load_simulations(str(tmp_path)))
    assert model["n_left_road"] == 3 and model["n_encounters"] <= 29
    assert any("OFF THE ROAD" in w for w in model["warnings"])
    _, md = report.write_report(str(tmp_path))
    assert "where the car left the road (a test defect, excluded)" in md


def test_heading_off_lane_measure():
    assert telemetry.heading_off_lane_deg([], []) is None
    assert telemetry.heading_off_lane_deg([0.0, 0.1], [0.0, 0.0]) == pytest.approx(math.degrees(0.1))
    # wraps around: 359 deg vs 1 deg is 2 deg apart, not 358
    assert telemetry.heading_off_lane_deg([math.radians(359)], [math.radians(1)]) == pytest.approx(2.0)
