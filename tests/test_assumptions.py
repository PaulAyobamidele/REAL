"""Domain-assumption vocabulary and classification (roadmap M1.1-1.2,
docs/design/domain_assumptions.md). No CARLA needed."""

from scripts.analysis import admissibility
from scripts.analysis.admissibility import parse_assumption


def test_quantities_match_design_table():
    assert set(admissibility.QUANTITIES) == {
        "fog_density", "pedestrian", "dress", "direction", "distance",
        "initial_separation_m", "pedestrian_speed_mps", "crossing_start_distance_m",
    }
    for q in admissibility.QUANTITIES.values():
        assert q["level"] in ("scenario", "run")
        assert isinstance(q["available"], bool)


def test_grid_setting_is_scenario_assumption():
    item = parse_assumption("fog_density <= 50")
    assert (item["kind"], item["quantity"], item["op"], item["value"]) == \
        ("scenario", "fog_density", "<=", "50")
    assert item["message"] == ""


def test_categorical_grid_setting():
    assert parse_assumption("pedestrian == Adult")["kind"] == "scenario"


def test_measured_quantity_is_run_assumption():
    item = parse_assumption("initial_separation_m >= 15")
    assert item["kind"] == "run" and item["message"] == ""


def test_unrecorded_quantity_is_flagged_not_measured():
    item = parse_assumption("pedestrian_speed_mps <= 3")
    assert item["kind"] == "run"
    assert "not measured" in item["message"]


def test_assumption_about_the_car_is_rejected():
    for text in ("ego_speed <= 5", "ego_speed_max < 8"):
        item = parse_assumption(text)
        assert item["kind"] == "rejected"
        assert "about the car" in item["message"]


def test_unknown_quantity_is_rejected():
    item = parse_assumption("sun_angle > 3")
    assert item["kind"] == "rejected"
    assert "unknown quantity" in item["message"]


def test_free_text_and_list():
    items = admissibility.parse_assumptions(["daylight, dry road", " fog_density <= 50 "])
    assert items[0]["kind"] == "free_text" and items[0]["quantity"] is None
    assert items[1]["text"] == "fog_density <= 50"
    assert admissibility.parse_assumptions(None) == []


# --- M1.3: per-simulation checks ------------------------------------------

import json
import os

import pandas as pd

from scripts.analysis import report
from test_analysis import write_synthetic_run


def _df(**cols):
    df = pd.DataFrame(cols)
    df["admissible"] = True
    df["spurious_reason"] = ""
    return df


def test_status_held_broken_not_measured():
    fog = parse_assumption("fog_density <= 30")
    assert admissibility.assumption_status(fog, "0") == "held"
    assert admissibility.assumption_status(fog, "50") == "broken"
    assert admissibility.assumption_status(fog, "") == "not_measured"
    assert admissibility.assumption_status(fog, float("nan")) == "not_measured"
    speed = parse_assumption("pedestrian_speed_mps <= 3")   # not recorded yet
    assert admissibility.assumption_status(speed, 1.0) == "not_measured"


def test_only_broken_sets_aside_and_reason_is_named():
    df = _df(fog_density=["0", "50", "50"], initial_separation_m=[20.0, 10.0, float("nan")])
    df.loc[2, "admissible"] = False
    df.loc[2, "spurious_reason"] = "extreme_fog"             # from the rules file
    items = admissibility.parse_assumptions(
        ["initial_separation_m >= 15", "pedestrian_speed_mps <= 3", "daylight"])
    out, summary = admissibility.check_assumptions(df, items)
    assert list(out["assumption::initial_separation_m >= 15"]) == ["held", "broken", "not_measured"]
    assert list(out["admissible"]) == [True, False, False]
    assert out.loc[1, "spurious_reason"] == "assumption: initial_separation_m >= 15"
    assert out.loc[2, "spurious_reason"] == "extreme_fog"   # not measured adds nothing
    sep, speed, free = summary
    assert (sep["held"], sep["broken"], sep["not_measured"]) == (1, 1, 1)
    assert speed["broken"] == 0 and speed["not_measured"] == 3
    assert free["kind"] == "free_text"


def test_assumption_about_the_car_sets_nothing_aside():
    df = _df(ego_speed=[9.0, 9.0])
    out, summary = admissibility.check_assumptions(
        df, admissibility.parse_assumptions(["ego_speed <= 5"]))
    assert out["admissible"].all()
    assert summary[0]["kind"] == "rejected"


def test_initial_separation_read_from_trace(tmp_path):
    os.makedirs(tmp_path / "traces")
    with open(tmp_path / "traces" / "3_1.json", "w") as f:
        json.dump({"distance_m": [12.5, 12.0]}, f)
    df = pd.DataFrame({"scenario_id": ["3", "3"], "sim_index": ["1", "2"]})
    out = admissibility.add_run_quantities(df, str(tmp_path))
    assert out.loc[0, "initial_separation_m"] == 12.5
    assert pd.isna(out.loc[1, "initial_separation_m"])        # no trace -> not measured


def test_report_lists_each_assumption(tmp_path):
    req = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
           'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
           'producing output "flag" in scenario where "fog" assuming "fog_density < 50" '
           '& "initial_separation_m >= 15" & "ego_speed <= 5"')
    write_synthetic_run(str(tmp_path), trials=2, requirement=req)
    analysis, md = report.write_report(str(tmp_path))
    adm = analysis["admissibility"]
    assert adm["n_spurious"] == 32                            # only fog; car item ignored
    kinds = {a["text"]: a["kind"] for a in adm["assumptions"]}
    assert kinds == {"fog_density < 50": "scenario", "initial_separation_m >= 15": "run",
                     "ego_speed <= 5": "rejected"}
    assert "held 32, broken 32" in md
    assert "`initial_separation_m >= 15` (measured in each run): not measured" in md
    assert "REJECTED" in md


def test_report_says_when_no_assumptions(tmp_path):
    write_synthetic_run(str(tmp_path), trials=1)
    _, md = report.write_report(str(tmp_path))
    assert "states no domain assumptions" in md


# --- M1.4: per-assumption verdicts and soft goals ---------------------------

def _verdict(held_fail, held_n, broken_fail, broken_n, text="initial_separation_m >= 15"):
    statuses = ["held"] * held_n + ["broken"] * broken_n
    failed = [i < held_fail for i in range(held_n)] + [i < broken_fail for i in range(broken_n)]
    df = pd.DataFrame({f"assumption::{text}": statuses, "failed": failed,
                       "encounter": [True] * len(statuses)})
    summary = [{"text": text, "kind": "run", "quantity": "initial_separation_m", "message": ""}]
    return admissibility.assumption_verdicts(df, summary)[0]


def test_verdict_load_bearing_and_reverse():
    assert _verdict(2, 20, 15, 20)["verdict"] == "load-bearing"            # 10% -> 75%
    assert _verdict(15, 20, 2, 20)["verdict"] == "fewer failures when broken"
    v = _verdict(10, 20, 11, 20)
    assert v["verdict"] == "not load-bearing" and v["enc_broken"] == 20
    assert abs(v["rate_held"] - 0.5) < 1e-9


def test_verdict_untested_insufficient_not_measured():
    assert _verdict(5, 20, 0, 0)["verdict"] == "untested"
    assert _verdict(5, 20, 3, 5)["verdict"] == "insufficient data"
    assert _verdict(0, 0, 0, 0)["verdict"] == "not measured"


def test_verdict_ignores_no_encounter_rows_and_free_text():
    df = pd.DataFrame({"assumption::fog_density <= 50": ["held", "broken"],
                       "failed": [False, True], "encounter": [True, False]})
    out = admissibility.assumption_verdicts(df, [
        {"text": "fog_density <= 50", "kind": "scenario", "quantity": "fog_density", "message": ""},
        {"text": "daylight", "kind": "free_text", "quantity": None, "message": ""}])
    assert out[0]["enc_broken"] == 0 and out[0]["verdict"] == "untested"
    assert out[1]["verdict"] is None


def test_report_shows_verdict_and_soft_goals(tmp_path):
    req = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
           'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
           'producing output "flag" in scenario where "fog" assuming "fog_density < 50" '
           'ensuring "vehicle resumes within 10 s"')
    write_synthetic_run(str(tmp_path), trials=2, requirement=req)
    analysis, md = report.write_report(str(tmp_path))
    fog = analysis["admissibility"]["assumptions"][0]
    assert fog["verdict"] in ("load-bearing", "not load-bearing", "fewer failures when broken")
    assert f"-> **{fog['verdict']}**" in md
    assert "A judgement call, not a significance test." in md
    assert analysis["requirement"]["soft_goals"] == ["vehicle resumes within 10 s"]
    assert '"vehicle resumes within 10 s": not checked automatically yet' in md


def test_report_says_when_no_soft_goals(tmp_path):
    req = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
           'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
           'producing output "flag" in scenario where "fog"')
    write_synthetic_run(str(tmp_path), trials=1, requirement=req)
    _, md = report.write_report(str(tmp_path))
    assert "states no soft goals" in md
