import json

import pytest

from scripts.analysis import decisions, obstacles, report, review
from test_analysis import write_synthetic_run

REQ = ('MAINTAIN "Pedestrian Safety" by "Pedestrian Check" using "Perception Module" '
       'operationalized as "Detect Pedestrian" performed by "yolov5s" taking input "image" '
       'producing output "flag" in scenario where "fog"')


def _rounds(tmp_path):
    """Round A: everyone detected too late. Round B: few failures, many stalled passes."""
    ra, rb = tmp_path / "a", tmp_path / "b"
    write_synthetic_run(str(ra), trials=5, child_fail_rate=0.8, adult_fail_rate=0.8,
                        adult_kind="detected_too_late", requirement=REQ)
    write_synthetic_run(str(rb), trials=5, child_fail_rate=0.1, adult_fail_rate=0.1,
                        adult_kind="brake_released", requirement=REQ)
    # make most of round B's passes stalled
    import pandas as pd
    df = pd.read_csv(rb / "simulations.csv", dtype=str, keep_default_na=False)
    passes = df["passed"] == "True"
    idx = df[passes].index[: int(passes.sum() * 0.8)]
    df.loc[idx, "termination"] = "reached time limit (100 steps)"
    df.loc[idx, "ego_speed_final"] = "0.0"
    df.to_csv(rb / "simulations.csv", index=False)
    return ra, rb


def test_obstacle_status():
    assert decisions.obstacle_status("supported", "supported") == "persisting"
    assert decisions.obstacle_status("supported", "not_supported") == "new"
    assert decisions.obstacle_status("supported", None) == "new"
    assert decisions.obstacle_status("not_supported", "supported") == "resolved"
    assert decisions.obstacle_status("insufficient_data", "supported") == "resolved"
    assert decisions.obstacle_status("not_supported", "not_supported") == "absent"


def test_from_analysis_marks_resolved_and_new(tmp_path):
    ra, rb = _rounds(tmp_path)
    a, b = report.analyse(str(ra)), report.analyse(str(rb))
    doc = decisions.from_analysis(b, a, reviewer="test", round_no=2, artefacts=obstacles.SCENARIO_ARTEFACTS)
    assert doc["run_id"] == b["run_id"] and doc["parent_run_id"] == a["run_id"]
    assert doc["obstacles"]["DetectionTooLate"]["status"] == "resolved"
    assert doc["obstacles"]["StandoffUnnecessaryStop"]["status"] == "new"
    assert "passes" in doc["obstacles"]["StandoffUnnecessaryStop"]["evidence"]
    layers = {o["layer"] for o in doc["obstacles"]["StandoffUnnecessaryStop"]["options"]}
    assert {"system", "requirement", "scenario"} <= layers
    # the v1 scene's defects are listed; "never met" only when such runs exist (none here)
    assert set(doc["scope"]) >= {"artefact:crossing_trigger_8m", "artefact:distance_parameter_dead"}
    assert "artefact:no_encounter_geometry" not in doc["scope"]
    assert all(o["verdict"] is None for o in doc["obstacles"].values())
    assert decisions.validate(doc) == []
    assert not decisions.is_complete(doc)


def test_validate_catches_bad_values():
    doc = {"schema_version": 1, "run_id": "r", "obstacles": {
        "X": {"verdict": "maybe", "status": "new", "mitigation": {"layer": "magic", "action": ""}},
        "Y": {"verdict": "reject", "status": "absent", "mitigation": {"layer": "system", "action": "x"}},
        "Z": {"verdict": "rename", "status": "new"}},
        "scope": {"s": {"verdict": "nope"}}, "requirement_changes": [{"kind": "Q"}]}
    problems = decisions.validate(doc)
    joined = " ".join(problems)
    for needle in ("X: verdict", "layer 'magic'", "needs an action", "rejected obstacle cannot",
                   "rename needs renamed_to", "scope s", "kind 'Q'", "text missing"):
        assert needle in joined, needle
    with pytest.raises(ValueError):
        decisions.save(doc, "/nonexistent")


def test_review_scripted_writes_decisions(tmp_path):
    ra, rb = _rounds(tmp_path)
    # scripted answers: accept the standoff (requirement layer), mark DetectionTooLate resolved-accept,
    # reject the rest, call the 8 m trigger a scenario defect, skip the other artefacts
    answers = {
        "obstacles": {
            "StandoffUnnecessaryStop": {"verdict": "accept", "reason": "car never proceeds",
                                        "mitigation_layer": "requirement"},
            "DetectionTooLate": {"verdict": "accept", "reason": "resolved by proportional braking"},
        },
        "scope": {"artefact:crossing_trigger_8m": {"verdict": "scenario_defect", "reason": "test artefact"}},
    }
    # everything not in `answers` is answered interactively -> feed 'j' (reject) / 's' (skip) + a reason
    feed = iter(["j", "noise"] * 20 + ["s"] * 20)
    out = []
    doc = review.run_review(str(rb), previous=str(ra), reviewer="tester", round_no=2, answers=answers,
                            input_fn=lambda prompt: next(feed), output_fn=out.append)
    saved = decisions.load(str(rb))
    assert saved["reviewer"] == "tester" and saved["round"] == 2 and saved["decided_at"]
    s = saved["obstacles"]["StandoffUnnecessaryStop"]
    assert s["verdict"] == "accept" and s["mitigation"]["layer"] == "requirement"
    assert "soft goal" in s["mitigation"]["action"]
    assert saved["obstacles"]["DetectionTooLate"]["verdict"] == "accept"
    assert saved["obstacles"]["DetectionTooLate"]["mitigation"] is None
    assert saved["obstacles"]["PedestrianSizeTooSmall"]["verdict"] == "reject"
    assert saved["scope"]["artefact:crossing_trigger_8m"]["verdict"] == "scenario_defect"
    assert saved["scope"]["artefact:distance_parameter_dead"]["verdict"] is None    # skipped
    text = "\n".join(out)
    assert "StandoffUnnecessaryStop" in text and "[vs previous round: new]" in text
    assert "[vs previous round: resolved]" in text
    assert decisions.validate(saved) == []


def test_review_interactive_menu(tmp_path):
    ra, rb = _rounds(tmp_path)
    # answer: accept + reason + pick option 1 for the first (supported) obstacle, then reject all
    # others with a reason, then skip all scope items
    feed = iter(["a", "yes real", "1"] + ["j", "no"] * 10 + ["s"] * 10)
    doc = review.run_review(str(rb), previous=str(ra), input_fn=lambda p: next(feed),
                            output_fn=lambda s: None, write=False)
    accepted = [o for o in doc["obstacles"].values() if o["verdict"] == "accept"]
    assert len(accepted) == 1 and accepted[0]["mitigation"]["layer"] == accepted[0]["options"][0]["layer"]
    assert (rb / decisions.FILENAME).exists() is False


def test_world_assumption_in_own_words_is_never_about_the_car():
    """Option C (2026-10-21): an engineer's own world assumption is refused if it
    constrains the car, like any other assumption; small pedestrians get no proposal."""
    from scripts.analysis import refine
    doc = {"schema_version": 1, "run_id": "x", "obstacles": {"PedestrianSizeTooSmall": {
        "verdict": "accept", "explained_by": "world", "renamed_to": None,
        "mitigation": {"layer": "requirement", "action": "ego_speed <= 5"}}},
        "scope": {}, "assumptions": {}}
    assert any("about the car" in p for p in decisions.validate(doc))
    assert ("PedestrianSizeTooSmall", "requirement") not in refine.R_CHANGES
    own = refine.change_for("PedestrianSizeTooSmall", "requirement", "pedestrian is visible before stepping out")
    assert own["text"] == 'assuming "pedestrian is visible before stepping out"'


def test_only_artefacts_of_this_scene_are_put_to_the_reviewer():
    """A test-defect candidate is listed only when it is a defect of the run's own scene
    and has evidence in the run (2026-10-21: the study round, on scene v2, listed three
    defects of scene v1, which participants then judged and 'fixed')."""
    by_id = {a["id"]: a for a in obstacles.SCENARIO_ARTEFACTS}
    v1 = {"run_meta": {}, "failure_model": {"passed_stalled": 113, "n_no_encounter": 32, "n_scenarios": 32}}
    assert all(obstacles.artefact_applies(a, v1) for a in obstacles.SCENARIO_ARTEFACTS)
    c1 = {"run_meta": {"scene": {"version": 2, "crossing_trigger_m": 0}},
          "failure_model": {"passed_stalled": 332, "n_no_encounter": 0, "n_scenarios": 128}}
    assert not any(obstacles.artefact_applies(a, c1) for a in obstacles.SCENARIO_ARTEFACTS)
    v2_trigger = {"run_meta": {"scene": {"version": 2, "crossing_trigger_m": 20}},
                  "failure_model": {"passed_stalled": 5, "n_no_encounter": 3, "n_scenarios": 10}}
    assert obstacles.artefact_applies(by_id["crossing_trigger_8m"], v2_trigger)
    assert obstacles.artefact_applies(by_id["no_encounter_geometry"], v2_trigger)
    assert not obstacles.artefact_applies(by_id["distance_parameter_dead"], v2_trigger)
    # and from_analysis lists none for the study's round
    analysis = dict(c1, run_id="x", obstacles=[], admissibility={"rules": [], "spurious": [], "assumptions": []})
    doc = decisions.from_analysis(analysis, artefacts=obstacles.SCENARIO_ARTEFACTS)
    assert doc["scope"] == {}
