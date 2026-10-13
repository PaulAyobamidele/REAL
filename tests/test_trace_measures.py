"""Glitch-robust measures from traces, and the path-aware safety rule."""

import json
import os

import pandas as pd
import pytest

from scripts.analysis import report, trace_measures as tm
from test_analysis import write_synthetic_run


def test_median_filter_removes_one_step_spikes():
    assert tm.median_filter([0.8, 6.0, 10.9, 0.1, 0.7]) != [0.8, 6.0, 10.9, 0.1, 0.7]
    assert max(tm.median_filter([2.0, 2.0, 11.0, 2.0, 2.0])) == 2.0
    assert max(tm.median_filter([0.8, 6.0, 10.9, 0.1, 0.7])) < 7.0
    assert tm.median_filter([1.0, 2.0]) == [1.0, 2.0]          # too short to filter


def test_path_min_distance_only_counts_steps_in_the_path():
    distances = [20.0, 12.0, 8.0, 3.5]
    laterals = [-2.8, -1.0, 2.0, 3.5]                           # last step: on the far pavement
    assert tm.path_min_distance(distances, laterals) == 8.0
    assert tm.path_min_distance(distances, [4.0] * 4) is None
    assert tm.path_min_distance([], []) is None


def test_measures_replace_spiky_values():
    trace = {"pedestrian_speed": [0.0, 2.0, 2.0, 10.9, 2.0, 2.0],
             "ego_speed": [7.5] * 30, "distance_m": [20.0 - 0.5 * i for i in range(30)],
             "ped_lateral_m": [-3.0] * 30}
    m = tm.measures(trace, 0.1)
    assert m["pedestrian_speed_mps"] == 2.0
    assert m["peak_decel_mps2"] == 0.0
    assert m["path_min_distance_m"] is None


def _run_with_traces(tmp_path, far_pavement_pass):
    """One scenario, one simulation: the car comes within 3.5 m of a pedestrian
    standing on the far pavement (scored a failure by the 5 m-anywhere rule)."""
    write_synthetic_run(str(tmp_path), trials=1)
    sims = tmp_path / "simulations.csv"
    df = pd.read_csv(sims, dtype=str, keep_default_na=False)
    df = df.iloc[:1].copy()
    df.loc[0, ["passed", "rho", "min_distance_m", "timestep_s"]] = ["False", "-1.5", "3.5", "0.1"]
    df.to_csv(sims, index=False)
    sid, idx = df.loc[0, "scenario_id"], df.loc[0, "sim_index"]
    os.makedirs(tmp_path / "traces", exist_ok=True)
    laterals = [-3.0, -1.0, 1.0, 3.6, 3.6, 3.6] if far_pavement_pass else [-3.0, -1.0, 0.2, 0.2, 1.0, 3.6]
    with open(tmp_path / "traces" / f"{sid}_{idx}.json", "w") as f:
        json.dump({"distance_m": [20.0, 14.0, 9.0, 6.0, 3.5, 6.0], "ego_speed": [7.0] * 6,
                   "pedestrian_speed": [0.0, 2.0, 2.0, 2.0, 2.0, 0.0], "ped_lateral_m": laterals}, f)
    return df


def test_path_rule_passes_driving_past_a_pedestrian_on_the_pavement(tmp_path):
    _run_with_traces(tmp_path, far_pavement_pass=True)
    out = tm.apply_safety_rule(tm.add_trace_measures(
        pd.read_csv(tmp_path / "simulations.csv", dtype=str, keep_default_na=False)
        .assign(passed=lambda d: d["passed"].map({"True": True, "False": False})), str(tmp_path)), "path")
    assert out.loc[0, "passed_anywhere"] is False or out.loc[0, "passed_anywhere"] == False  # noqa: E712
    assert out.loc[0, "passed"] == True                                                     # noqa: E712
    assert out.loc[0, "path_min_distance_m"] == 9.0


def test_path_rule_still_fails_a_close_call_in_the_road(tmp_path):
    _run_with_traces(tmp_path, far_pavement_pass=False)
    df = pd.read_csv(tmp_path / "simulations.csv", dtype=str, keep_default_na=False)
    df["passed"] = df["passed"].map({"True": True, "False": False})
    out = tm.apply_safety_rule(tm.add_trace_measures(df, str(tmp_path)), "path")
    assert out.loc[0, "passed"] == False                                                    # noqa: E712
    assert out.loc[0, "failed"]


def test_report_states_the_rule_and_the_other_rule_needs_its_own_folder(tmp_path):
    _run_with_traces(tmp_path, far_pavement_pass=True)
    # the default is the path-aware rule (decided 2026-10-08); the monitor's
    # "anywhere" verdict is the variant that needs its own folder
    assert tm.DEFAULT_SAFETY_RULE == "path"
    with pytest.raises(ValueError, match="safety rule"):
        report.write_report(str(tmp_path), safety_rule="anywhere")
    analysis, md = report.write_report(str(tmp_path))
    assert analysis["safety_rule"] == "path" and analysis["safety_rule_changed"] == 1
    assert "only while the pedestrian is in the car's path" in md
    _, md_anywhere = report.write_report(str(tmp_path), out_dir=str(tmp_path / "anywhere_rule"),
                                         safety_rule="anywhere")
    assert "wherever the pedestrian is" in md_anywhere
    with pytest.raises(ValueError):
        tm.apply_safety_rule(pd.DataFrame({"passed": [True]}), "nowhere")
