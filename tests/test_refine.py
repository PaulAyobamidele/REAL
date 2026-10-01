import json

import pytest

from scripts.analysis import decisions, obstacles, refine, report
from scripts.redsl.grammar import DSL
from test_analysis import write_synthetic_run
from test_grammar import REQUIREMENT


def _decided_run(tmp_path):
    """A round with decisions: standoff accepted (requirement layer), a system
    change to an unimplemented module, the 8 m trigger as scenario defect."""
    run = tmp_path / "r2"
    write_synthetic_run(str(run), trials=2, child_fail_rate=0.5, adult_fail_rate=0.5,
                        adult_kind="brake_released", requirement=REQUIREMENT)
    analysis = report.analyse(str(run))
    doc = decisions.from_analysis(analysis, artefacts=obstacles.SCENARIO_ARTEFACTS)
    for oid, o in doc["obstacles"].items():
        o["verdict"] = "reject"
    doc["obstacles"]["StandoffUnnecessaryStop"].update(
        verdict="accept", reason="car never proceeds",
        mitigation={"layer": "requirement", "action": "state a progress goal"})
    doc["obstacles"]["BrakingNotLatched"].update(
        verdict="accept", reason="release is a separate defect",
        mitigation={"layer": "system", "action": "latch the brake"})
    doc["obstacles"]["DetectionTooLate"].update(verdict="defer", reason="1 of 4 failures")
    for sid, s in doc["scope"].items():
        s["verdict"] = "scenario_defect" if sid == "artefact:crossing_trigger_8m" else "in_scope"
    decisions.save(doc, str(run))
    return run, doc


def test_plan_changes_labels(tmp_path):
    run, doc = _decided_run(tmp_path)
    changes = refine.plan_changes(doc)
    kinds = {(c["kind"], c["from"]) for c in changes}
    assert ("R", "StandoffUnnecessaryStop") in kinds
    assert ("S", "BrakingNotLatched") in kinds
    assert ("T", "artefact:crossing_trigger_8m") in kinds
    s = next(c for c in changes if c["kind"] == "S")
    assert s["module"] == "latched_braking" and s["available"] is False   # not in the executor yet
    r = next(c for c in changes if c["kind"] == "R")
    assert r["clause"] == "ensuring" and "resumes within 10 s" in r["item"]
    t_in_scope = [c for c in changes if c["kind"] == "T" and c["layer"] == "scope"]
    assert len(t_in_scope) == 2   # the two artefacts marked in_scope -> drop-rule notes


def test_apply_changes_edits_text_and_parses():
    changes = [
        {"kind": "S", "task": "Apply Brakes", "module": "latched_braking"},
        {"kind": "R", "clause": "ensuring", "item": "vehicle resumes within 10 s once the crossing is clear"},
        {"kind": "D", "clause": "assuming", "item": "fog_density <= 50"},
        {"kind": "D", "clause": "assuming", "item": "fog_density <= 50"},     # duplicate ignored
        {"kind": "T", "text": "fix the trigger"},
    ]
    r1 = refine.apply_changes(REQUIREMENT, changes)
    dsl = DSL(r1)
    assert dsl.parse_tree is not None
    assert dsl.get_module_for("Apply Brakes") == "latched_braking"
    assert dsl.get_module_for("Detect Pedestrian") == "yolov5s"            # untouched
    assert dsl.get_assumptions() == ["fog_density <= 50"]
    assert dsl.get_soft_goals() == ["vehicle resumes within 10 s once the crossing is clear"]
    assert 'performed by "proportional_braking"' not in r1
    # applying to an R1 that already has clauses extends them instead of duplicating
    r2 = refine.apply_changes(r1, [{"kind": "D", "clause": "assuming", "item": "ego_speed <= 5"}])
    assert DSL(r2).get_assumptions() == ["fog_density <= 50", "ego_speed <= 5"]
    assert r2.count("assuming") == 1 and r2.count("ensuring") == 1


def test_replace_module_errors():
    with pytest.raises(ValueError):
        refine._replace_module(REQUIREMENT, "Fly", "x")


def test_refine_writes_files_and_records_changes(tmp_path):
    run, doc = _decided_run(tmp_path)
    out = refine.refine(str(run))
    for name in (refine.R0_FILENAME, refine.R1_FILENAME, refine.DIFF_FILENAME, decisions.FILENAME):
        assert (run / name).exists(), name
    assert (run / "R0.dsl").read_text().strip() == REQUIREMENT.strip()
    r1 = (run / "R1.dsl").read_text()
    assert DSL(r1).get_soft_goals() == ["vehicle resumes within 10 s once the crossing is clear"]
    assert DSL(r1).get_module_for("Apply Brakes") == "latched_braking"
    diff = (run / "requirement_diff.md").read_text()
    assert "[R] from `StandoffUnnecessaryStop`" in diff
    assert "executor does not implement this module yet" in diff
    assert "+    ensuring" in diff
    saved = decisions.load(str(run))
    kinds = sorted(c["kind"] for c in saved["requirement_changes"])
    assert kinds.count("R") == 1 and kinds.count("S") == 1 and kinds.count("T") >= 1 and kinds.count("D") == 0
    assert out["changes"] and out["paths"]


def test_refine_rejects_unparseable_override(tmp_path):
    run, doc = _decided_run(tmp_path)
    with pytest.raises(ValueError):
        refine.refine(str(run), r1_override="not a requirement", write=False)
    # and a valid override is used verbatim
    ok = refine.refine(str(run), r1_override=REQUIREMENT.rstrip() + '\n    ensuring "keep moving"\n', write=False)
    assert DSL(ok["r1"]).get_soft_goals() == ["keep moving"]
