"""Reviewing domain assumptions (D): decisions items, [D] changes in R1, the
terminal review and the review page (roadmap M1.5-1.6,
docs/design/domain_assumptions.md 'Revision')."""

import os

import pytest

from scripts.analysis import decisions, obstacles, refine, report, review
from scripts.redsl.grammar import DSL
from test_analysis import write_synthetic_run
from test_grammar import REQUIREMENT

R_ASSUMING = REQUIREMENT.rstrip() + '\n    assuming "fog_density < 50" & "daylight"\n'


def _run(tmp_path, requirement=R_ASSUMING):
    write_synthetic_run(str(tmp_path), trials=2, child_fail_rate=0.8, adult_fail_rate=0.2,
                        requirement=requirement)
    return report.analyse(str(tmp_path))


def test_from_analysis_lists_assumptions_and_skips_them_in_scope(tmp_path):
    doc = decisions.from_analysis(_run(tmp_path))
    assert list(doc["assumptions"]) == ["fog_density < 50", "daylight"]
    fog = doc["assumptions"]["fog_density < 50"]
    assert fog["kind"] == "scenario" and fog["verdict"] is None
    assert fog["evidence"].startswith("held 32, broken 32")
    assert doc["assumptions"]["daylight"]["evidence"].startswith("free text")
    assert not any("assumption:" in sid for sid in doc["scope"])   # reviewed once, as D
    assert doc["added_assumptions"] == []
    assert not decisions.is_complete(doc)


def test_validate_assumption_values():
    base = {"schema_version": 1, "run_id": "r", "obstacles": {}, "scope": {}}
    bad = dict(base, assumptions={
        "a": {"verdict": "widen"},
        "b": {"verdict": "tighten", "new_text": None},
        "c": {"verdict": "loosen", "new_text": "ego_speed <= 9"},
    }, added_assumptions=[{"text": "ego_speed < 3"}, {"text": ""}])
    problems = " | ".join(decisions.validate(bad))
    assert "'a': verdict 'widen'" in problems
    assert "'b': tighten needs new_text" in problems
    assert "'c': new_text is about the car" in problems
    assert "added_assumptions[0]" in problems and "added_assumptions[1]: text missing" in problems
    good = dict(base, assumptions={"fog_density <= 50": {"verdict": "loosen", "new_text": "fog_density <= 70"}},
                added_assumptions=[{"text": "pedestrian on foot"}])
    assert decisions.validate(good) == []


R0 = REQUIREMENT.rstrip() + '\n    assuming "fog_density <= 50" & "daylight" & "direction != RL"\n'


def _doc_every_row():
    return {"schema_version": 1, "run_id": "r", "obstacles": {}, "scope": {},
            "assumptions": {
                "fog_density <= 50": {"verdict": "tighten", "new_text": "fog_density <= 30", "tool_verdict": "load-bearing"},
                "daylight": {"verdict": "drop", "tool_verdict": None},
                "direction != RL": {"verdict": "keep", "tool_verdict": "not load-bearing"},
                # stated after the run (not in R0):
                "initial_separation_m >= 15": {"verdict": "keep", "tool_verdict": "insufficient data"},
                "pedestrian_speed_mps <= 3": {"verdict": "loosen", "new_text": "pedestrian_speed_mps <= 4",
                                              "tool_verdict": "untested"},
                "dry road": {"verdict": "drop", "tool_verdict": None},
            },
            "added_assumptions": [{"text": "pedestrian on foot", "reason": "no cyclists in the grid"}]}


def test_assumption_changes_follow_the_design_table():
    changes = refine.plan_changes(_doc_every_row(), R0)
    assert all(c["kind"] == "D" for c in changes)
    by_from = {c["from"]: c for c in changes}
    assert by_from["assumption:fog_density <= 50"]["replaces"] == "fog_density <= 50"
    assert by_from["assumption:daylight"]["remove"] is True
    assert "assumption:direction != RL" not in by_from                  # keep, in R0: no change
    assert by_from["assumption:initial_separation_m >= 15"]["item"] == "initial_separation_m >= 15"
    loosened = by_from["assumption:pedestrian_speed_mps <= 3"]
    assert loosened["replaces"] is None and loosened["no_evidence"] is True
    assert "assumption:dry road" not in by_from                         # drop, not in R0: nothing
    assert by_from["added by reviewer"]["item"] == "pedestrian on foot"

    r1 = refine.apply_changes(R0, changes)
    assert refine.check_parses(r1)
    assert DSL(r1).get_assumptions() == ["fog_density <= 30", "direction != RL",
                                        "initial_separation_m >= 15", "pedestrian_speed_mps <= 4",
                                        "pedestrian on foot"]
    diff = refine.render_diff(R0, r1, changes)
    assert "no evidence behind it" in diff and "[D]" in diff


def test_review_replays_assumption_answers(tmp_path):
    _run(tmp_path)
    answers = {"assumptions": {"fog_density < 50": {"verdict": "keep", "reason": "paper: 50% is realistic"},
                               "daylight": {"verdict": "drop"}},
               "added_assumptions": [{"text": "pedestrian on foot", "reason": "grid"}]}
    doc = review.run_review(str(tmp_path), answers=answers, input_fn=lambda p: "s",
                            output_fn=lambda s: None, write=False)
    assert doc["assumptions"]["fog_density < 50"]["verdict"] == "keep"
    assert doc["assumptions"]["daylight"]["verdict"] == "drop"
    assert doc["added_assumptions"] == [{"text": "pedestrian on foot", "reason": "grid"}]


def test_review_asks_about_assumptions_interactively(tmp_path):
    _run(tmp_path)
    adds = iter(["pedestrian on foot", ""])
    verdicts = iter(["t", "k"])

    def answer(prompt):
        if prompt.startswith("Verdict [k]eep"):
            return next(verdicts)
        if prompt.startswith("New text"):
            return "fog_density <= 30"
        if prompt.startswith("Add an assumption"):
            return next(adds)
        if prompt.startswith("Reason"):
            return "r"
        return "s"

    doc = review.run_review(str(tmp_path), input_fn=answer, output_fn=lambda s: None, write=False)
    fog = doc["assumptions"]["fog_density < 50"]
    assert (fog["verdict"], fog["new_text"]) == ("tighten", "fog_density <= 30")
    assert doc["assumptions"]["daylight"]["verdict"] == "keep"
    assert [a["text"] for a in doc["added_assumptions"]] == ["pedestrian on foot"]


def test_review_page_shows_assumptions_and_accept_writes_d(tmp_path, monkeypatch):
    pytest.importorskip("streamlit")
    from streamlit.testing.v1 import AppTest
    page = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pages", "4_review.py")
    analysis = _run(tmp_path)
    doc = decisions.from_analysis(analysis, artefacts=obstacles.SCENARIO_ARTEFACTS)
    for o in doc["obstacles"].values():
        o["verdict"] = "reject"
    for s in doc["scope"].values():
        s["verdict"] = "scenario_defect"
    doc["assumptions"]["fog_density < 50"].update(verdict="tighten", new_text="fog_density <= 30")
    doc["assumptions"]["daylight"]["verdict"] = "drop"
    decisions.save(doc, str(tmp_path))
    monkeypatch.setenv("REAL_REVIEW_RUN_DIR", str(tmp_path))
    monkeypatch.delenv("REAL_REVIEW_PREVIOUS_DIR", raising=False)

    at = AppTest.from_file(page, default_timeout=120).run()
    at.sidebar.text_input[2].set_value("Test Reviewer").run()
    at.sidebar.radio[0].set_value("4. What you decide").run()
    assert not at.exception, at.exception
    assert any("Domain assumptions (D)" in s.value for s in at.subheader)
    at.sidebar.radio[0].set_value("5. What the requirement becomes").run()
    accept = [b for b in at.button if b.label.startswith("Accept")][0]
    assert not accept.disabled
    accept.click().run()
    assert not at.exception, at.exception
    r1 = (tmp_path / "R1.dsl").read_text()
    assert DSL(r1).get_assumptions() == ["fog_density <= 30"]
    assert "[D]" in (tmp_path / "requirement_diff.md").read_text()
