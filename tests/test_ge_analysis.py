"""Analysis aware of GE's uneven sampling, and the grid check that confirms
GE's leads (roadmap M2c.3). No CARLA."""

import asyncio
import csv
import json
import os

import pandas as pd

from scripts.analysis import failure_model, grid_check, obstacles, report
from scripts.evolve.grid import run_grid
from test_analysis import write_synthetic_run
from test_ge_slurm import V2_PHENOTYPE, _run_job_request_block
from test_grammar import REQUIREMENT


def _set_mode(run_dir, mode):
    path = os.path.join(run_dir, "run_meta.json")
    meta = json.load(open(path))
    meta["mode"] = mode
    json.dump(meta, open(path, "w"))


def test_numeric_settings_are_banded_in_the_effects_table():
    df = pd.DataFrame({"fog_density": [str(v) for v in (0, 10, 40, 60, 90, 100)] * 4,
                       "failed": [False, False, False, True, True, True] * 4,
                       "phenotype": [f"s{i}" for i in range(6)] * 4})
    rows = failure_model.failure_rate_by_parameter(df).set_index("value")
    assert set(rows.index) == {"<= 50", "> 50"}
    assert rows.loc["> 50", "effect"] == 1.0 and rows.loc["> 50", "n"] == 12


def test_old_two_valued_settings_keep_their_values():
    df = pd.DataFrame({"fog_density": ["0", "50"] * 10, "failed": [False, True] * 10,
                       "phenotype": ["a", "b"] * 10})
    assert set(failure_model.failure_rate_by_parameter(df)["value"]) == {"0", "50"}


def test_each_scenario_counted_once():
    # GE revisited one failing scenario 10 times; five others ran once and passed
    df = pd.DataFrame({"phenotype": ["bad"] * 10 + [f"ok{i}" for i in range(5)],
                       "failed": [True] * 10 + [False] * 5})
    assert failure_model._rate(df) == 10 / 15
    assert failure_model._scenario_rate(df) == 1 / 6


def test_ge_report_says_so_and_marks_leads(tmp_path):
    write_synthetic_run(str(tmp_path), trials=2, child_fail_rate=1.0, adult_fail_rate=0.0,
                        requirement=REQUIREMENT)
    _set_mode(str(tmp_path), "ge")
    analysis, md = report.write_report(str(tmp_path))
    assert analysis["sampling"] == "ge"
    assert "bred towards failure" in md and "grid_check" in md
    assert "with every distinct scenario counted once" in md
    assert "effect, each scenario once" in md
    if any(o["verdict"] == "supported" for o in analysis["obstacles"]):
        assert "GE lead - confirm on grid" in md


def test_grid_report_says_balanced(tmp_path):
    write_synthetic_run(str(tmp_path), trials=1)
    _, md = report.write_report(str(tmp_path))
    assert "balanced grid" in md and "GE lead" not in md


def test_verdict_label():
    assert obstacles.verdict_label("supported", "ge").endswith("(GE lead - confirm on grid)")
    assert obstacles.verdict_label("supported", "grid") == "SUPPORTED"
    assert obstacles.verdict_label("not_supported", "ge") == "not supported"


def test_grid_check_selects_writes_and_compares(tmp_path):
    ge, check = tmp_path / "ge", tmp_path / "check"
    write_synthetic_run(str(ge), trials=3, child_fail_rate=1.0, adult_fail_rate=0.0,
                        requirement=REQUIREMENT)
    _set_mode(str(ge), "ge")
    out, chosen = grid_check.write_selection(str(ge), top=4, trials=3)
    assert [c["group"] for c in chosen] == ["worst"] * 4 + ["safe"] * 4
    assert all(c["ge_failure_rate"] == 1.0 for c in chosen[:4])
    assert all(c["ge_failure_rate"] == 0.0 for c in chosen[4:])
    lines = [l for l in open(os.path.join(out, "scenarios.txt")) if not l.startswith("#")]
    assert len(lines) == 8
    write_synthetic_run(str(check), trials=3, child_fail_rate=1.0, adult_fail_rate=0.0,
                        requirement=REQUIREMENT)
    _set_mode(str(check), "list")
    path, md = grid_check.compare(str(ge), str(check))
    assert os.path.exists(path)
    assert "4 of 4 worst scenarios still fail" in md


def test_run_grid_runs_a_given_list(tmp_path, monkeypatch):
    import real_config
    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))
    seen = []

    def fake(phenotype, num_test, seed, scenario_id):
        seen.append(phenotype)
        return {"total": num_test, "passed": 0, "failed": num_test, "pct": 0.0}

    run_grid("list-run", requirement="req", trials=3, record_video=False, evaluate=fake,
             phenotypes=[V2_PHENOTYPE], scenario_source="x/scenarios.txt", parent_run_id="ge")
    assert seen == [V2_PHENOTYPE]
    out = tmp_path / "runs" / "list-run"
    meta = json.load(open(out / "run_meta.json"))
    assert (meta["mode"], meta["scenario_source"], meta["n_scenarios"]) == ("list", "x/scenarios.txt", 1)
    row = next(csv.DictReader(open(out / "scenarios.csv")))
    assert row["approach_distance_m"] == "20" and row["crossing_trigger_m"] == "8"


def test_api_reads_scenario_file(tmp_path, monkeypatch):
    import api_app
    got = {}
    monkeypatch.setattr(api_app, "run_grid",
                        lambda run_id, **kw: got.update(kw) or {"scenarios": [1], "worst_phenotype": "x"})
    f = tmp_path / "scenarios.txt"
    f.write_text("# header\n" + V2_PHENOTYPE + "\n\n")
    out = asyncio.run(api_app.run_grid_endpoint(requirement=REQUIREMENT, trials=3, scenario_file=str(f)))
    assert out["STATUS"] == "OK" and got["phenotypes"] == [V2_PHENOTYPE]
    bad = asyncio.run(api_app.run_grid_endpoint(requirement=REQUIREMENT, scenario_file=str(tmp_path / "nope")))
    assert bad["STATUS"] == "NOT OK"


def test_job_script_list_mode(monkeypatch):
    calls = _run_job_request_block(monkeypatch, {"REAL_SEARCH": "list",
                                                 "REAL_SCENARIOS": "artifacts/runs/g/grid_check/scenarios.txt",
                                                 "REAL_REQUIREMENT_FILE": "docs/examples/R_baseline.dsl"})
    url, params = calls[0]
    assert url.endswith("/run_grid") and params["trials"] == 3
    assert params["scenario_file"] == "artifacts/runs/g/grid_check/scenarios.txt"
