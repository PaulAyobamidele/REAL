"""The authoring helper (scripts/redsl/serve.py): its lists come from the code
the pipeline runs, and its check is the project's parser. No CARLA."""

import glob
import json
import os
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from scripts.analysis import admissibility, soft_goals
from scripts.redsl import serve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLES = sorted(glob.glob(os.path.join(ROOT, "docs", "examples", "*.dsl")))


def test_catalog_lists_come_from_the_code():
    c = serve.catalog()
    assert c["temporal_ops"] == ["ACHIEVE", "MAINTAIN"]
    assert set(c["operators"]) == {"<=", ">=", "==", "!=", "<", ">"}
    assert "proportional_braking" in c["roles"]["braking"]["modules"]
    assert "emergency_braking" in c["roles"]["braking"]["modules"]
    assert c["roles"]["perception"]["task"] == "Detect Pedestrian"
    names = [q["name"] for q in c["assumption_quantities"]]
    assert names == [n for n in admissibility.QUANTITIES if not n.startswith("ego")]
    assert [q["name"] for q in c["soft_goal_quantities"]] == list(soft_goals.QUANTITIES)
    assert "fog" in c["scenario_vocab"]["fog_density"]


def test_no_assumption_quantity_is_about_the_car(monkeypatch):
    monkeypatch.setitem(admissibility.QUANTITIES, "ego_speed",
                        {"level": "run", "unit": "m/s", "source": "x", "available": True})
    assert "ego_speed" not in [q["name"] for q in serve.catalog()["assumption_quantities"]]


def test_examples_are_real_lines_of_the_baseline_requirement():
    ex = serve.catalog()["examples"]
    text = open(os.path.join(ROOT, ex["source"])).read()
    for key in ("goal", "sub_goal", "agent", "task", "condition", "input", "output", "scenario",
                "free_assumption", "free_soft_goal"):
        assert ex[key] and f'"{ex[key]}"' in text, key


@pytest.mark.parametrize("path", EXAMPLES, ids=os.path.basename)
def test_every_example_parses_and_fits_the_form(path):
    result = serve.check(open(path).read())
    assert result["ok"], result.get("error")
    assert result["covered"] is None
    assert result["modules"]["perception"]["runs"] and result["modules"]["braking"]["runs"]


def test_a_parse_error_names_line_and_column():
    result = serve.check('MAINTAIN "x"\n  by "y" usin "z" in scenario where "s"')
    assert not result["ok"]
    assert (result["error"]["line"], result["error"]["column"]) == (2, 10)


def test_a_module_the_executor_cannot_run_is_flagged():
    text = open(EXAMPLES[0]).read()
    for path in EXAMPLES:
        if path.endswith("R_baseline.dsl"):
            text = open(path).read()
    result = serve.check(text.replace('"proportional_braking"', '"proportional_braking_with_resume"'))
    assert result["ok"] and result["modules"]["braking"]["runs"] is False


def test_assumptions_soft_goals_and_scenario_words_are_classified():
    text = ('MAINTAIN "G" by "S" using "A" operationalized as "Detect Pedestrian" performed by '
            '"yolov5s" taking input "i" producing output "o" in scenario where "a child in fog" '
            'assuming "fog_density <= 50" & "ego_speed <= 5" & "dry road" '
            'ensuring "resume_within_s <= 10" & "be nice"')
    r = serve.check(text)
    assert [a["kind"] for a in r["assumptions"]] == ["scenario", "rejected", "free_text"]
    assert [s["kind"] for s in r["soft_goals"]] == ["checked", "free_text"]
    assert r["scenario_constraints"] == {"pedestrian": "Child", "fog_density": "50"}


def test_constructs_the_form_lacks_are_named():
    text = ('MAINTAIN "G" by "S1" using "A" operationalized as "Detect Pedestrian" performed by "yolov5s" '
            'taking input "i" producing output "o" parallely "S2" using "B" operationalized as '
            '"Apply Brakes" performed by "proportional_braking" taking input "o" producing output "b" '
            'in scenario where "s"')
    r = serve.check(text)
    assert r["ok"] and "parallely" in r["covered"]


def test_http_endpoints():
    server = ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/authoring"
    try:
        with urllib.request.urlopen(f"{base}/catalog") as r:
            assert "roles" in json.load(r)
        req = urllib.request.Request(f"{base}/check", data=json.dumps({"text": "nope"}).encode(),
                                     headers={"Content-Type": "application/json",
                                              "Origin": "http://localhost:5173"})
        with urllib.request.urlopen(req) as r:
            assert r.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
            assert json.load(r)["ok"] is False
    finally:
        server.shutdown()


def _run(tmp, name, requirement, failures=0):
    d = tmp / name
    d.mkdir()
    (d / "run_meta.json").write_text(json.dumps({"run_id": name, "mode": "grid", "requirement": requirement,
                                                 "created_at": f"2026-10-0{len(name) % 9}"}))
    (d / "analysis_report.json").write_text(json.dumps({"failure_model": {
        "n_simulations": 10, "failures": failures, "failure_rate": failures / 10, "passed_stalled": 1}}))
    (d / "traces").mkdir()
    (d / "traces" / "0_0.json").write_text("{}")
    return d


def test_match_finds_runs_with_the_same_goal_tree_whatever_the_layout(tmp_path):
    base = open(os.path.join(ROOT, "docs", "examples", "R_baseline.dsl")).read()
    stripped = "\n".join(l for l in base.splitlines() if not l.lstrip().startswith("#"))
    _run(tmp_path, "aaa", base)
    _run(tmp_path, "bbb", stripped.replace("\n", " "))             # one line, no comments
    _run(tmp_path, "ccc", base.replace('"yolov5s"', '"yolov5m"'))   # a real difference
    (tmp_path / "no_meta").mkdir()
    result = serve.match(stripped, str(tmp_path))
    assert result["searched"] == 3
    assert [m["run_id"] for m in result["matches"]] == sorted(["aaa", "bbb"], key=lambda n: f"2026-10-0{len(n) % 9}")
    assert result["matches"][0]["simulations"] == 10


def test_runs_index_lists_rounds_and_their_files(tmp_path):
    _run(tmp_path, "aaa", "x")
    (tmp_path / "no_meta").mkdir()
    index = serve.runs_index(str(tmp_path))
    assert index["rounds"] == [{"dir": "aaa", "files": ["analysis_report.json", "run_meta.json", "traces/0_0.json"]}]
    assert index["ignored"] == ["no_meta"]
