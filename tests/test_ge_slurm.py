"""GE through the Slurm/requirement path (roadmap M2c.2): safe scenario
labels, no re-simulation of a scenario GE already tried, run_meta.json from
the start, and the API / job script passing everything through. No CARLA."""

import asyncio
import json
import os
import re
import sys
import types

import scripts.evolve.ge as ge_module
from scripts.simulations import util
from test_grammar import REQUIREMENT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V2_PHENOTYPE = ("A { pedestrian : Child } wearing a {dress : Dark} dress trying to cross road from "
                "{ direction : LR } with the car { approach_distance_m : 20 } m away on a day with fog "
                "density {fog_density : 60}, walking at least {pedestrian_min_speed_mps : 1.5} m/s, "
                "stepping out at {crossing_trigger_m : 8} m")


def test_scenario_label_is_a_safe_file_name():
    label = util.scenario_label(V2_PHENOTYPE)
    assert re.fullmatch(r"g[0-9a-f]{10}", label)
    assert label == util.scenario_label(V2_PHENOTYPE)          # same scenario, same label
    assert label != util.scenario_label(V2_PHENOTYPE.replace("60", "70"))


def test_ge_fitness_reuses_a_scenario_it_already_simulated(monkeypatch):
    calls = []

    def fake(phenotype, num_test=5, seed=None, scenario_id=None, log_mlflow=True):
        calls.append((num_test, scenario_id))
        return {"total": num_test, "passed": 1, "failed": num_test - 1, "pct": 50.0}

    monkeypatch.setattr(util, "evaluate_phenotype", fake)
    util.configure_ge(trials=2)
    ind = types.SimpleNamespace(phenotype=V2_PHENOTYPE)
    assert util.evaluate(ind, None) == (50.0,)
    assert util.evaluate(ind, None) == (50.0,)
    assert calls == [(2, util.scenario_label(V2_PHENOTYPE))]   # simulated once, 2 trials
    util.configure_ge()                                         # a new run forgets earlier results
    util.evaluate(ind, None)
    assert len(calls) == 2


def test_ge_run_writes_meta_at_start_and_completes_it(monkeypatch, tmp_path):
    import real_config
    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))
    seen = []

    def dummy(ind, dummy):
        with open(tmp_path / "runs" / "ge-run" / "run_meta.json") as f:
            seen.append(json.load(f)["status"])
        return (len(ind.phenotype) % 10,)

    monkeypatch.setattr(ge_module, "evaluate", dummy)
    ge_module.start_ge(sample=False, grammar_file="v2/scene_v2.bnf", population_size=6,
                       max_generations=1, run_id="ge-run", requirement=REQUIREMENT,
                       record_video=False, trials=2, parent_run_id="p", round_no=3,
                       requirement_source="docs/examples/R_baseline.dsl")
    assert seen and set(seen) == {"running"}                   # meta existed while running
    meta = json.load(open(tmp_path / "runs" / "ge-run" / "run_meta.json"))
    assert meta["status"] == "complete" and meta["mode"] == "ge"
    assert meta["grammar_file"] == "v2/scene_v2.bnf" and meta["grammar_sha256"]
    assert (meta["trials_per_individual"], meta["population_size"], meta["max_generations"]) == (2, 6, 1)
    assert (meta["parent_run_id"], meta["round"]) == ("p", 3)
    assert meta["requirement_source"] == "docs/examples/R_baseline.dsl"
    assert meta["scene"]["version"] == 2 and "not sampled evenly" in meta["sampling"]
    assert meta["best_phenotype"] and meta["created_at"] <= meta["completed_at"]


def test_api_passes_ge_options_through(monkeypatch):
    import api_app
    got = {}

    def fake_start_ge(**kwargs):
        got.update(kwargs)
        return {"best_phenotype": "x"}

    monkeypatch.setattr(api_app, "start_ge", fake_start_ge)
    out = asyncio.run(api_app.get_testcases(requirement=REQUIREMENT, sample=False,
                                            population_size=16, max_generations=6, trials=2,
                                            parent_run_id="p", round=3,
                                            requirement_source="docs/examples/R_baseline.dsl"))
    assert out["STATUS"] == "OK"
    assert got["grammar_file"] == "v2/scene_v2.bnf"            # GE default grammar
    assert (got["trials"], got["population_size"], got["max_generations"]) == (2, 16, 6)
    assert (got["parent_run_id"], got["round_no"]) == ("p", 3)
    assert got["braking_mode"] == "proportional_braking"


def _run_job_request_block(monkeypatch, env):
    """Execute the Python heredoc of run_real_av.slurm with a fake `requests`."""
    script = open(os.path.join(ROOT, "infra", "hpc", "run_real_av.slurm")).read()
    code = re.search(r"cat > smoke_test.py <<'PYEOF'\n(.*?)\nPYEOF", script, re.S).group(1)
    calls = []

    class Resp:
        def json(self):
            return {"STATUS": "OK"}

    fake = types.ModuleType("requests")
    fake.get = lambda url, params=None, timeout=None: calls.append((url, params)) or Resp()
    monkeypatch.setitem(sys.modules, "requests", fake)
    for k in ("REAL_SEARCH", "REAL_GRAMMAR", "REAL_POPULATION", "REAL_GENERATIONS", "REAL_TRIALS",
              "REAL_PARENT_RUN_ID", "REAL_ROUND"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.chdir(ROOT)
    exec(compile(code, "smoke_test.py", "exec"), {"__name__": "__main__"})
    return calls


def test_job_script_defaults_to_the_grid(monkeypatch):
    calls = _run_job_request_block(monkeypatch, {"REAL_REQUIREMENT_FILE": "docs/examples/R_baseline.dsl"})
    url, params = calls[0]
    assert url.endswith("/run_grid") and params["trials"] == 5


def test_job_script_runs_ge_when_asked(monkeypatch):
    calls = _run_job_request_block(monkeypatch, {"REAL_SEARCH": "ge", "REAL_ROUND": "3",
                                                 "REAL_REQUIREMENT_FILE": "docs/examples/R_baseline.dsl"})
    url, params = calls[0]
    assert url.endswith("/get_testcases") and params["sample"] is False
    assert params["grammar_file"] == "v2/scene_v2.bnf"
    assert (params["population_size"], params["max_generations"], params["trials"]) == (16, 6, 2)
    assert params["round"] == 3 and params["requirement_source"] == "docs/examples/R_baseline.dsl"
