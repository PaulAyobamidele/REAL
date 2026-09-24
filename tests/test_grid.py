import csv
import json
import os

import pytest

from real_config import settings
from scripts.evolve.grid import enumerate_phenotypes, grammar_terminals, run_grid

OLD_BNF = os.path.join(settings.grammar_base_dir, "old", "old.bnf")


def test_grammar_terminals_old_bnf():
    rule, cats = grammar_terminals(OLD_BNF)
    assert rule.startswith("A { pedestrian : <pedestrian> }")
    assert cats == {
        "direction": ["LR", "RL"],
        "distance": ["Short", "Long"],
        "fog_density": ["0", "50"],
        "pedestrian": ["Adult", "Child"],
        "dress": ["Light", "Dark"],
    }


def test_enumerate_phenotypes_covers_all_32_once():
    items = list(enumerate_phenotypes(OLD_BNF))
    assert len(items) == 32
    phenotypes = [p for _, p in items]
    assert len(set(phenotypes)) == 32
    assert all("<" not in p for p in phenotypes)
    params, phenotype = items[0]
    assert params == {"direction": "LR", "distance": "Short", "fog_density": "0",
                      "pedestrian": "Adult", "dress": "Light"}
    assert "{ pedestrian : Adult }" in phenotype and "{fog_density : 0}" in phenotype


def test_grammar_terminals_rejects_nested_grammar(tmp_path):
    bnf = tmp_path / "nested.bnf"
    bnf.write_text("<rule> ::= x <a>\n<a> ::= <digit><digit>\n<digit> ::= 0 | 1\n")
    with pytest.raises(ValueError):
        grammar_terminals(str(bnf))


def test_run_grid_persists_everything(tmp_path, monkeypatch):
    import real_config

    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))

    calls = []

    def fake_evaluate(phenotype, num_test, seed, scenario_id):
        calls.append((phenotype, num_test, seed, scenario_id))
        # make "Child ... Dark" scenarios the worst
        passed = 0 if ("Child" in phenotype and "Dark" in phenotype) else num_test
        return {"total": num_test, "passed": passed, "failed": num_test - passed,
                "pct": passed * 100 / num_test}

    result = run_grid("grid-run", requirement="req", scenario_text="fog", constraints={"fog_density": "50"},
                      trials=3, record_video=False, evaluate=fake_evaluate,
                      parent_run_id="parent-1", round_no=3, requirement_source="artifacts/runs/parent-1/R1.dsl")

    assert len(calls) == 32
    assert [c[3] for c in calls] == list(range(32))
    assert [c[2] for c in calls] == [settings.random_seed + i for i in range(32)]
    assert all(c[1] == 3 for c in calls)

    out = tmp_path / "runs" / "grid-run"
    with open(out / "scenarios.csv") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 32
    assert sum(r["pct"] == "0.0" for r in rows) == 8  # Child x Dark x 2 x 2 x 2

    with open(out / "run_meta.json") as f:
        meta = json.load(f)
    assert meta["mode"] == "grid" and meta["status"] == "complete"
    assert meta["n_scenarios"] == 32 and meta["trials_per_scenario"] == 3
    assert meta["seed"] == settings.random_seed
    assert meta["parent_run_id"] == "parent-1" and meta["round"] == 3
    assert meta["requirement_source"] == "artifacts/runs/parent-1/R1.dsl"
    assert meta["grammar_sha256"] and meta["template_sha256"]
    assert "Child" in meta["worst_phenotype"] and "Dark" in meta["worst_phenotype"]
    assert result["worst_phenotype"] == meta["worst_phenotype"]

    assert (out / "best_phenotype.txt").read_text() == meta["worst_phenotype"]
    code = (out / "best_scenario.scenic").read_text()
    assert "walker.pedestrian.0013" in code  # Child + Dark blueprint
    assert "<" not in code
    assert (out / "traces").is_dir()
