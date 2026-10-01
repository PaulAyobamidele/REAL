"""Smoke test of the offline, progressive review page with Streamlit's AppTest."""

import os

import pytest

from test_analysis import write_synthetic_run
from test_grammar import REQUIREMENT

pytest.importorskip("streamlit")
from streamlit.testing.v1 import AppTest  # noqa: E402

PAGE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pages", "4_review.py")
STEPS = ["1. What we asked", "2. What happened", "3. What pattern",
         "4. What you decide", "5. What the requirement becomes"]


def _rounds(tmp_path):
    ra, rb = tmp_path / "a", tmp_path / "b"
    write_synthetic_run(str(ra), trials=2, child_fail_rate=0.8, adult_fail_rate=0.8,
                        adult_kind="detected_too_late", requirement=REQUIREMENT)
    write_synthetic_run(str(rb), trials=2, child_fail_rate=0.2, adult_fail_rate=0.2,
                        adult_kind="brake_released", requirement=REQUIREMENT)
    return ra, rb


def _text(at):
    return (" ".join(m.value for m in at.markdown) + " ".join(h.value for h in at.header)
            + " ".join(s.value for s in at.subheader) + " ".join(w.value for w in at.warning)
            + " ".join(c.value for c in at.caption))


def test_review_page_walks_five_steps(tmp_path, monkeypatch):
    ra, rb = _rounds(tmp_path)
    monkeypatch.setenv("REAL_REVIEW_RUN_DIR", str(rb))
    monkeypatch.setenv("REAL_REVIEW_PREVIOUS_DIR", str(ra))

    at = AppTest.from_file(PAGE, default_timeout=120).run()
    assert not at.exception, at.exception
    # step 1: R0 shown, no verdict widgets
    assert at.title[0].value == STEPS[0]
    assert any("Pedestrian Safety" in c.value for c in at.code)
    assert not [r for r in at.radio if r.label == "Verdict"]   # no decisions on screen 1

    # Next -> step 2: raw numbers, previous round column, no obstacle names
    [b for b in at.button if b.label == "Next"][0].click().run()
    assert not at.exception and at.title[0].value == STEPS[1]
    assert "StandoffUnnecessaryStop" not in _text(at)

    # step 3: one obstacle at a time, in support order, "Next obstacle" walks them
    at.sidebar.radio[0].set_value(STEPS[2]).run()
    assert not at.exception
    first = at.subheader[0].value
    [b for b in at.button if b.label == "Next obstacle"][0].click().run()
    assert not at.exception and at.subheader[0].value != first

    # step 4: verdict widgets for every obstacle
    at.sidebar.radio[0].set_value(STEPS[3]).run()
    assert not at.exception
    assert len([r for r in at.radio if r.label == "Verdict"]) >= 6

    # step 5: R0/R1 side by side, Accept disabled until complete + reviewer named
    at.sidebar.radio[0].set_value(STEPS[4]).run()
    assert not at.exception and at.title[0].value == STEPS[4]
    assert "Pedestrian Safety" in at.text_area[0].value
    accept = [b for b in at.button if b.label.startswith("Accept")][0]
    assert accept.disabled is True


def test_review_page_preloads_tool_proposal(tmp_path, monkeypatch):
    from scripts.analysis import decisions, obstacles, report
    ra, rb = _rounds(tmp_path)
    analysis = report.analyse(str(rb))
    doc = decisions.from_analysis(analysis, report.analyse(str(ra)),
                                  reviewer="Tool (proposed - to be confirmed)", round_no=2,
                                  artefacts=obstacles.SCENARIO_ARTEFACTS)
    for o in doc["obstacles"].values():
        o["verdict"] = "reject"
    for s in doc["scope"].values():
        s["verdict"] = "scenario_defect"
    decisions.save(doc, str(rb))
    monkeypatch.setenv("REAL_REVIEW_RUN_DIR", str(rb))
    monkeypatch.setenv("REAL_REVIEW_PREVIOUS_DIR", str(ra))

    at = AppTest.from_file(PAGE, default_timeout=120).run()
    at.sidebar.radio[0].set_value(STEPS[3]).run()
    assert not at.exception
    assert "proposed by the tool" in _text(at)
    assert all(r.value == "reject" for r in at.radio if r.label == "Verdict")


def test_review_page_accept_writes_files(tmp_path, monkeypatch):
    from scripts.analysis import decisions, obstacles, report
    from scripts.redsl.grammar import DSL
    ra, rb = _rounds(tmp_path)
    doc = decisions.from_analysis(report.analyse(str(rb)), report.analyse(str(ra)), round_no=2,
                                  artefacts=obstacles.SCENARIO_ARTEFACTS)
    for o in doc["obstacles"].values():
        o["verdict"] = "reject"
    doc["obstacles"]["StandoffUnnecessaryStop"].update(
        verdict="accept", mitigation={"layer": "requirement", "action": "progress goal"})
    for s in doc["scope"].values():
        s["verdict"] = "scenario_defect"
    decisions.save(doc, str(rb))
    monkeypatch.setenv("REAL_REVIEW_RUN_DIR", str(rb))
    monkeypatch.setenv("REAL_REVIEW_PREVIOUS_DIR", str(ra))

    at = AppTest.from_file(PAGE, default_timeout=120).run()
    at.sidebar.text_input[2].set_value("Test Reviewer").run()
    at.sidebar.radio[0].set_value(STEPS[4]).run()
    accept = [b for b in at.button if b.label.startswith("Accept")][0]
    assert not accept.disabled
    accept.click().run()
    assert not at.exception, at.exception
    assert at.success
    saved = decisions.load(str(rb))
    assert saved["reviewer"] == "Test Reviewer" and saved["proposed_by_tool"] is False
    r1 = (rb / "R1.dsl").read_text()
    assert DSL(r1).get_soft_goals() == ["vehicle resumes within 10 s once the crossing is clear"]
    assert (rb / "requirement_diff.md").exists() and (rb / "R0.dsl").exists()
