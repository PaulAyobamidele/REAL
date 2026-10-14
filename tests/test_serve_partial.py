"""The helper serves a running job's newest partial report until the final one
exists (scripts/redsl/serve.py), and lists the scenario lists a list run can use."""

import json
import os

from scripts.redsl import serve

RUN = "fedcba9876543210fedcba9876543210"


def _run(tmp_path, final=False):
    d = tmp_path / RUN
    for n in (2, 3):
        p = d / "partial" / f"after_{n}_of_4"
        p.mkdir(parents=True)
        (p / "analysis_report.json").write_text(json.dumps({"banner": f"PARTIAL ({n} of 4 scenarios)"}))
        (p / "analysis_report.md").write_text(f"PARTIAL ({n} of 4)")
    (d / "partial" / "latest.json").write_text(json.dumps({"folder": "partial/after_3_of_4", "done": 3, "total": 4}))
    (d / "run_meta.json").write_text("{}")
    if final:
        (d / "analysis_report.json").write_text(json.dumps({"banner": None}))
    return d


def test_a_run_with_only_a_partial_report_lists_and_serves_the_newest(tmp_path):
    _run(tmp_path)
    (entry,) = serve.runs_index(str(tmp_path))["rounds"]
    assert "analysis_report.json" in entry["files"]
    assert serve._partial_folder(str(tmp_path / RUN)).endswith("after_3_of_4")


def test_the_final_report_wins_once_it_exists(tmp_path):
    d = _run(tmp_path, final=True)
    assert json.loads((d / "analysis_report.json").read_text())["banner"] is None
    assert serve.runs_index(str(tmp_path))["rounds"][0]["files"].count("analysis_report.json") == 1


def test_a_broken_pointer_serves_nothing_partial(tmp_path):
    d = _run(tmp_path)
    (d / "partial" / "latest.json").write_text(json.dumps({"folder": "partial/after_9_of_4"}))
    assert serve._partial_folder(str(d)) is None
    (d / "partial" / "latest.json").write_text("not json")
    assert serve._partial_folder(str(d)) is None


def test_scenario_lists_are_the_files_whose_lines_are_scenarios(tmp_path):
    smoke = tmp_path / "infra" / "hpc" / "smoke"
    smoke.mkdir(parents=True)
    (smoke / "scenarios_v3.txt").write_text("# comment\nA { pedestrian : Adult } x\nA { pedestrian : Child } y\n")
    (smoke / "notes.txt").write_text("not a scenario\n")
    assert serve.scenario_lists(str(tmp_path)) == [{"path": "infra/hpc/smoke/scenarios_v3.txt", "scenarios": 2}]
