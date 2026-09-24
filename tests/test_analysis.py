"""Laptop-side failure analysis (scripts/analysis/*) on a made-up
simulations.csv - no simulator involved."""

import csv
import json
import os

import pytest

from scripts.analysis import admissibility, failure_model, obstacles, report, telemetry
from scripts.evolve.grid import enumerate_phenotypes
from real_config import settings

OLD_BNF = os.path.join(settings.grammar_base_dir, "old", "old.bnf")


def _row(scenario_id, sim_index, params, phenotype, passed, kind):
    """One simulations.csv row in telemetry.FIELDS order. `kind` shapes the
    perception/braking columns so classify_failure() has something to read."""
    row = {f: "" for f in telemetry.FIELDS}
    row.update(run_id="r", scenario_id=scenario_id, sim_index=sim_index, phenotype=phenotype,
               steps=60, timestep_s=0.1, duration_s=6.0, ego_speed_max=7.5, ego_speed_final=7.0,
               termination="termination condition on line 111", **params)
    row["passed"] = passed
    if passed and kind == "no_encounter":
        # car never came near: no detection, min distance far beyond 10 m
        row.update(rho=13.0, min_distance_m=18.0, ego_speed_at_min_distance=7.0, stopped=False,
                   frames_seen=40, detection_frames=0, max_confidence=0.1, brake_steps=0)
    elif passed and kind == "passed_stalled":
        # braked to a standstill 12 m away and sat there until the time limit
        row.update(rho=7.0, min_distance_m=12.0, ego_speed_at_min_distance=0.0, stopped=True,
                   frames_seen=100, detection_frames=60, max_confidence=0.9, brake_steps=85,
                   first_brake_distance_m=20.0, ego_speed_at_first_brake=4.0,
                   first_brake_step=12, min_distance_step=30, ego_speed_final=0.0, steps=101,
                   termination="reached time limit (100 steps)")
    elif passed:
        row.update(rho=6.0, min_distance_m=11.0, ego_speed_at_min_distance=0.0, stopped=True,
                   frames_seen=40, detection_frames=12, max_confidence=0.93, brake_steps=20,
                   first_brake_distance_m=15.0, ego_speed_at_first_brake=7.0,
                   first_brake_step=10, min_distance_step=40)
    elif kind == "never_detected":
        row.update(rho=-3.5, min_distance_m=1.5, ego_speed_at_min_distance=7.4, stopped=False,
                   frames_seen=40, detection_frames=0, max_confidence=0.41, brake_steps=0)
    elif kind == "detected_not_braked":
        row.update(rho=-3.0, min_distance_m=2.0, ego_speed_at_min_distance=7.4, stopped=False,
                   frames_seen=40, detection_frames=4, max_confidence=0.9, brake_steps=0)
    elif kind == "detected_too_late":
        # seen at 6 m doing 7.4 m/s: needs 7.4^2/16 + 5 = 8.4 m -> too late
        row.update(rho=-2.5, min_distance_m=2.5, ego_speed_at_min_distance=4.0, stopped=False,
                   frames_seen=40, detection_frames=3, max_confidence=0.9, brake_steps=3,
                   first_brake_distance_m=6.0, ego_speed_at_first_brake=7.4,
                   first_brake_step=20, min_distance_step=24)
    elif kind == "brake_released":
        # seen in time (12 m) but braked only 2 of the 15 steps to the closest point
        row.update(rho=-1.0, min_distance_m=4.0, ego_speed_at_min_distance=3.2, stopped=False,
                   frames_seen=40, detection_frames=3, max_confidence=0.88, brake_steps=2,
                   first_brake_distance_m=12.0, ego_speed_at_first_brake=7.0,
                   first_brake_step=10, min_distance_step=25)
    elif kind == "braking_insufficient":
        row.update(rho=-1.0, min_distance_m=4.0, ego_speed_at_min_distance=3.2, stopped=False,
                   frames_seen=40, detection_frames=6, max_confidence=0.88, brake_steps=15,
                   first_brake_distance_m=12.0, ego_speed_at_first_brake=7.0,
                   first_brake_step=10, min_distance_step=25)
    elif kind == "stopped_too_close":
        row.update(rho=-0.5, min_distance_m=4.5, ego_speed_at_min_distance=0.0, stopped=True,
                   frames_seen=40, detection_frames=5, max_confidence=0.9, brake_steps=15,
                   first_brake_distance_m=12.0, ego_speed_at_first_brake=7.0,
                   first_brake_step=10, min_distance_step=25)
    return row


def write_synthetic_run(run_dir, trials=5, child_fail_rate=1.0, adult_fail_rate=0.0,
                        fog_extra=0.0, requirement=None, adult_kind="brake_released",
                        no_encounter_per_scenario=0):
    """32 scenarios x trials. Children fail (never detected) at child_fail_rate,
    adults at adult_fail_rate (`adult_kind`); fog adds fog_extra. The last
    `no_encounter_per_scenario` passes of each scenario are no-encounter rows."""
    os.makedirs(run_dir, exist_ok=True)
    rows = []
    for sid, (params, phenotype) in enumerate(enumerate_phenotypes(OLD_BNF)):
        base = child_fail_rate if params["pedestrian"] == "Child" else adult_fail_rate
        rate = min(1.0, base + (fog_extra if params["fog_density"] == "50" else 0.0))
        n_fail = round(rate * trials)
        for i in range(trials):
            failed = i < n_fail
            kind = "never_detected" if params["pedestrian"] == "Child" else adult_kind
            if not failed and i >= trials - no_encounter_per_scenario:
                kind = "no_encounter"
            rows.append(_row(sid, i, params, phenotype, not failed, kind))
    with open(os.path.join(run_dir, "simulations.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=telemetry.FIELDS)
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(run_dir, "run_meta.json"), "w") as f:
        json.dump({"run_id": "r", "mode": "grid", "n_scenarios": 32, "trials_per_scenario": trials,
                   "seed": 42, "requirement": requirement}, f)
    return rows


# ---------------------------------------------------------------- admissibility

def test_default_rules_keep_all_32_in_scope():
    rules = admissibility.load_rules()
    for params, _ in enumerate_phenotypes(OLD_BNF):
        ok, matched = admissibility.classify(params, rules)
        assert ok and matched == []


def test_rule_ops_numeric_and_string():
    fog = {"name": "fog", "param": "fog_density", "op": ">=", "value": 50}
    child = {"name": "kids", "param": "pedestrian", "op": "in", "value": ["Child"]}
    assert admissibility.rule_matches(fog, {"fog_density": "50"})
    assert not admissibility.rule_matches(fog, {"fog_density": "0"})
    assert admissibility.rule_matches(child, {"pedestrian": "Child"})
    assert not admissibility.rule_matches(child, {"pedestrian": "Adult"})
    assert not admissibility.rule_matches(fog, {})  # unknown param never matches
    ok, matched = admissibility.classify({"fog_density": "50", "pedestrian": "Child"}, [fog, child])
    assert not ok and matched == ["fog", "kids"]


def test_rules_from_assumptions_invert_and_keep_free_text():
    rules, free = admissibility.rules_from_assumptions(
        ["fog_density <= 50", "pedestrian == Adult", "daylight only"])
    assert free == ["daylight only"]
    assert [(r["param"], r["op"], r["value"]) for r in rules] == [
        ("fog_density", ">", "50"), ("pedestrian", "!=", "Adult")]
    assert all(r["source"] == "requirement" for r in rules)
    # fog 50 is still IN scope under "<= 50"; a Child is out under "== Adult"
    ok, matched = admissibility.classify({"fog_density": "50", "pedestrian": "Adult"}, rules)
    assert ok and matched == []
    ok, matched = admissibility.classify({"fog_density": "50", "pedestrian": "Child"}, rules)
    assert not ok and matched == ["assumption: pedestrian == Adult"]
    assert admissibility.rules_from_assumptions(None) == ([], [])


def test_report_uses_requirement_assumptions(tmp_path):
    req = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
           'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
           'producing output "flag" in scenario where "fog" assuming "fog_density < 50" & "daylight"')
    write_synthetic_run(str(tmp_path), trials=2, requirement=req)
    analysis, md = report.write_report(str(tmp_path))
    assert analysis["requirement"]["assumptions"] == ["fog_density < 50", "daylight"]
    assert analysis["admissibility"]["n_spurious"] == 32      # every fog=50 simulation
    assert analysis["admissibility"]["free_text_assumptions"] == ["daylight"]
    assert "Assumptions stated in the requirement" in md and "fog_density < 50" in md
    assert '"daylight"' in md


def test_load_rules_rejects_malformed(tmp_path):
    p = tmp_path / "rules.json"
    p.write_text(json.dumps({"rules": [{"name": "x", "param": "fog_density"}]}))
    with pytest.raises(ValueError):
        admissibility.load_rules(str(p))


# ---------------------------------------------------------------- failure model

def test_load_and_classify(tmp_path):
    write_synthetic_run(str(tmp_path), trials=2, child_fail_rate=1.0, adult_fail_rate=0.5)
    df = failure_model.load_simulations(str(tmp_path))
    assert len(df) == 64
    assert df["passed"].isin([True, False]).all()
    assert df["min_distance_m"].dtype.kind == "f"
    df = failure_model.add_failure_types(df)
    counts = failure_model.failure_type_counts(df)
    assert counts["never_detected"] == 32          # all child sims
    assert counts["brake_released"] == 16          # half the adult sims
    assert counts["stopped_too_close"] == 0


def test_classify_every_outcome():
    p = {"pedestrian": "Adult", "dress": "Light", "direction": "LR", "distance": "Short", "fog_density": "0"}
    for kind in failure_model.FAILURE_TYPES:
        assert failure_model.classify_failure(_row(0, 0, p, "x", False, kind)) == kind, kind
    assert failure_model.classify_failure(_row(0, 0, p, "x", True, "passed")) == "passed"
    assert failure_model.classify_failure(_row(0, 0, p, "x", True, "no_encounter")) == "no_encounter"
    assert failure_model.classify_failure(_row(0, 0, p, "x", True, "passed_stalled")) == "passed_stalled"
    # proportional braking: the car slowed and stopped 12 m away on low confidence,
    # never crossing the 0.85 'detected' bar - that IS an encounter, not a no-encounter
    r = _row(0, 0, p, "x", True, "passed_stalled")
    r["detection_frames"] = 0
    assert failure_model.classify_failure(r) == "passed_stalled"
    r["termination"] = "termination condition"; r["ego_speed_final"] = 7.0
    assert failure_model.classify_failure(r) == "passed"
    # ...and a failure after braking on low confidence is a braking failure, not 'never detected'
    f = _row(0, 0, p, "x", False, "brake_released"); f["detection_frames"] = 0
    assert failure_model.classify_failure(f) == "brake_released"


def test_stalled_passes_are_counted_separately(tmp_path):
    write_synthetic_run(str(tmp_path), trials=4, child_fail_rate=0.0, adult_fail_rate=0.0)
    df = failure_model.load_simulations(str(tmp_path))
    # make every Child pass a stalled one
    kids = df["pedestrian"] == "Child"
    df.loc[kids, "termination"] = "reached time limit (100 steps)"
    df.loc[kids, "ego_speed_final"] = 0.0
    model = failure_model.build_failure_model(df)
    assert model["failure_rate"] == 0.0                      # safety rule held everywhere
    assert model["passes"] == 128
    assert model["passed_stalled"] == 64 and model["passed_clean"] == 64
    assert any("stalled" in w for w in model["warnings"])
    results = {o["id"]: o for o in obstacles.assess_obstacles(df, model)}
    assert results["StandoffUnnecessaryStop"]["verdict"] == "supported"
    assert results["StandoffUnnecessaryStop"]["evidence"]["share"] == pytest.approx(0.5)
    kid_row = next(r for r in model["by_scenario"] if r["pedestrian"] == "Child")
    assert kid_row["passed_stalled"] == 4 and kid_row["failures"] == 0
    assert failure_model.stopping_distance(7.4) == pytest.approx(7.4 ** 2 / 16 + 5)


def test_no_encounter_rows_are_excluded_from_rates(tmp_path):
    # adults: 2 fail, 1 real pass, 2 no-encounter per scenario; children: all fail
    write_synthetic_run(str(tmp_path), trials=5, child_fail_rate=1.0, adult_fail_rate=0.4,
                        no_encounter_per_scenario=2)
    df = failure_model.load_simulations(str(tmp_path))
    model = failure_model.build_failure_model(df)
    assert model["n_simulations"] == 160
    assert model["n_no_encounter"] == 32          # 16 adult scenarios x 2
    assert model["n_encounters"] == 128
    by = {(r["param"], r["value"]): r for r in model["by_parameter"]}
    assert by[("pedestrian", "Adult")]["n"] == 48                     # 16 x 3 encounters
    assert by[("pedestrian", "Adult")]["failure_rate"] == pytest.approx(2 / 3)
    assert any("no encounter" in w for w in model["warnings"])
    worst = model["by_scenario"][0]
    assert worst["encounters"] == 5 and worst["no_encounter"] == 0
    adult_row = next(r for r in model["by_scenario"] if r["pedestrian"] == "Adult")
    assert adult_row["n"] == 5 and adult_row["encounters"] == 3 and adult_row["no_encounter"] == 2


def test_video_rerun_row_is_dropped(tmp_path):
    rows = write_synthetic_run(str(tmp_path), trials=1)
    extra = dict(rows[0]); extra["scenario_id"] = "best_video"
    with open(tmp_path / "simulations.csv", "a", newline="") as f:
        csv.DictWriter(f, fieldnames=telemetry.FIELDS).writerow(extra)
    assert len(failure_model.load_simulations(str(tmp_path))) == 32
    assert len(failure_model.load_simulations(str(tmp_path), include_video_rerun=True)) == 33


def test_effects_point_at_the_right_setting(tmp_path):
    write_synthetic_run(str(tmp_path), trials=5, child_fail_rate=1.0, adult_fail_rate=0.0)
    df = failure_model.load_simulations(str(tmp_path))
    model = failure_model.build_failure_model(df)
    assert model["n_simulations"] == 160 and model["failure_rate"] == pytest.approx(0.5)
    by = {(r["param"], r["value"]): r for r in model["by_parameter"]}
    assert by[("pedestrian", "Child")]["effect"] == pytest.approx(1.0)
    assert by[("pedestrian", "Adult")]["effect"] == pytest.approx(-1.0)
    assert by[("fog_density", "50")]["effect"] == pytest.approx(0.0)
    assert all(r["enough_data"] for r in model["by_parameter"])
    worst = model["by_scenario"][0]
    assert worst["pedestrian"] == "Child" and worst["failure_rate"] == 1.0
    assert worst["never_detected"] == 5
    assert not any("do not vary" in w for w in model["warnings"])


def test_oracle_warning_when_failures_ignore_settings(tmp_path):
    # 40% fail everywhere, regardless of any setting -> suspect the scoring
    write_synthetic_run(str(tmp_path), trials=5, child_fail_rate=0.4, adult_fail_rate=0.4)
    df = failure_model.load_simulations(str(tmp_path))
    model = failure_model.build_failure_model(df)
    assert any("do not vary with any scenario setting" in w for w in model["warnings"])


def test_all_fail_warning(tmp_path):
    write_synthetic_run(str(tmp_path), trials=2, child_fail_rate=1.0, adult_fail_rate=1.0)
    model = failure_model.build_failure_model(failure_model.load_simulations(str(tmp_path)))
    assert any("Every encounter failed" in w for w in model["warnings"])


# ---------------------------------------------------------------- obstacles

def test_obstacle_verdicts(tmp_path):
    write_synthetic_run(str(tmp_path), trials=5, child_fail_rate=0.8, adult_fail_rate=0.0, fog_extra=0.2)
    df = failure_model.add_failure_types(failure_model.load_simulations(str(tmp_path)))
    model = failure_model.build_failure_model(df)
    results = {o["id"]: o for o in obstacles.assess_obstacles(df, model)}
    assert results["PedestrianSizeTooSmall"]["verdict"] == "supported"
    assert results["PedestrianSizeTooSmall"]["detection_failure_share"] == pytest.approx(1.0)
    assert results["PedestrianClothingNotVisible"]["verdict"] == "not_supported"
    assert results["AdverseWeather"]["verdict"] == "supported"
    assert results["PedestrianSizeTooSmall"]["blocks_goal"] == "Detect Pedestrian"
    assert not any(o["source"] == "candidate" for o in results.values())
    # behaviour-based: all failures here are never_detected -> neither supported
    assert results["DetectionTooLate"]["verdict"] == "not_supported"
    assert results["BrakingNotLatched"]["verdict"] == "not_supported"
    assert results["DetectionTooLate"]["evidence"]["share"] == 0.0


def test_behaviour_obstacles_from_real_pattern(tmp_path):
    # the run-35acc09e shape: everyone fails the same way (detected too late),
    # at the same rate whatever the pedestrian looks like
    write_synthetic_run(str(tmp_path), trials=5, child_fail_rate=0.6, adult_fail_rate=0.6,
                        adult_kind="detected_too_late")
    df = failure_model.load_simulations(str(tmp_path))
    # children were written as never_detected; turn them into detected-too-late as well
    kids_failed = (df["pedestrian"] == "Child") & df["failed"]
    df.loc[kids_failed, ["detection_frames", "brake_steps", "first_brake_distance_m",
                         "ego_speed_at_first_brake", "ego_speed_at_min_distance"]] = [3, 3, 6.0, 7.4, 4.0]
    df = failure_model.add_failure_types(df)
    model = failure_model.build_failure_model(df)
    results = {o["id"]: o for o in obstacles.assess_obstacles(df, model)}
    assert results["DetectionTooLate"]["verdict"] == "supported"
    assert results["DetectionTooLate"]["evidence"]["share"] > 0.9
    assert results["BrakingNotLatched"]["verdict"] == "not_supported"
    assert results["PedestrianSizeTooSmall"]["verdict"] in ("supported", "not_supported")
    assert any("do not vary with any scenario setting" in w for w in model["warnings"])
    # share is over ALL detected encounters (passes included): 60% failed, all too late
    assert model["timing"]["share_detected_too_late"] == pytest.approx(0.6)
    assert model["timing"]["stopping_distance_needed_m_median"] == pytest.approx(7.4 ** 2 / 16 + 5)


def test_unnamed_candidate_for_uncatalogued_effect(tmp_path):
    write_synthetic_run(str(tmp_path), trials=5, child_fail_rate=0.0, adult_fail_rate=0.0)
    df = failure_model.load_simulations(str(tmp_path))
    # make every Short-distance sim fail, which no catalogue entry covers
    df.loc[df["distance"] == "Short", ["passed", "failed"]] = [False, True]
    df.loc[df["distance"] == "Short", "detection_frames"] = 0
    df = failure_model.add_failure_types(df)
    model = failure_model.build_failure_model(df)
    cands = [o for o in obstacles.assess_obstacles(df, model) if o["source"] == "candidate"]
    assert len(cands) == 1 and cands[0]["param"] == "distance" and cands[0]["value"] == "Short"


def test_requirement_context_parses_kaos_requirement():
    req = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
           'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
           'producing output "flag" in scenario where "A pedestrian trying to cross the street in fog."')
    ctx = obstacles.requirement_context(req)
    assert ctx["parsed"] and ctx["detection_module"] == "yolov5s"
    assert "fog" in ctx["scenario_text"]
    assert obstacles.requirement_context("not a requirement") == {"parsed": False}
    assert obstacles.requirement_context(None) == {}


# ---------------------------------------------------------------- report

def test_write_report_end_to_end(tmp_path):
    req = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
           'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
           'producing output "flag" in scenario where "fog"')
    write_synthetic_run(str(tmp_path), trials=5, child_fail_rate=1.0, adult_fail_rate=0.0,
                        requirement=req)
    rules = tmp_path / "rules.json"
    rules.write_text(json.dumps({"rules": [
        {"name": "no_fog", "param": "fog_density", "op": ">", "value": 0, "reason": "test"}]}))

    analysis, md = report.write_report(str(tmp_path), str(rules))

    assert (tmp_path / "analysis_report.json").exists()
    assert (tmp_path / "analysis_report.md").read_text() == md
    assert analysis["admissibility"]["n_spurious"] == 80   # all fog=50 sims set aside
    assert analysis["admissibility"]["n_admissible"] == 80
    assert analysis["admissibility"]["spurious"][0]["rule"] == "no_fog"
    assert analysis["failure_model"]["n_simulations"] == 80
    assert analysis["requirement"]["detection_module"] == "yolov5s"
    assert "PedestrianSizeTooSmall - SUPPORTED" in md
    assert "AdverseWeather - insufficient data" in md     # fog rows were set aside
    assert "DetectionTooLate" in md and "BrakingNotLatched" in md
    assert "real encounters" in md
    assert "For the human" in md
    json.loads((tmp_path / "analysis_report.json").read_text())  # valid JSON


def test_cli_prints_report(tmp_path, capsys):
    write_synthetic_run(str(tmp_path), trials=2)
    report.main([str(tmp_path)])
    out = capsys.readouterr().out
    assert "# Failure analysis" in out and "## 5. Obstacles" in out
