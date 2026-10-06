"""The GE grammar for scene v2 (roadmap M2c.1): a space GE can search, whose
ranges deliberately go beyond the baseline assumptions. No CARLA."""

import os
import re

import pytest

import scripts.evolve.ge as ge_module
from real_config import settings
from scripts.evolve.constraints import parse_phenotype_params
from scripts.evolve.grid import grammar_terminals
from scripts.simulations import util

scenic = pytest.importorskip("scenic")
from scenic.syntax.parser import parse_string  # noqa: E402

V2 = "v2/scene_v2.bnf"
V2_PATH = os.path.join(settings.grammar_base_dir, V2)


def test_v2_space_is_large_and_exceeds_the_baseline():
    _, cats = grammar_terminals(V2_PATH)
    n = 1
    for values in cats.values():
        n *= len(values)
    assert n == 21120
    assert max(float(v) for v in cats["fog_density"]) > 50                 # breaks fog_density <= 50
    assert min(float(v) for v in cats["approach_distance_m"]) < 15         # can break initial_separation_m >= 15
    assert max(float(v) for v in cats["pedestrian_min_speed_mps"]) > 3     # can break pedestrian_speed_mps <= 3
    assert "8" in cats["crossing_trigger_m"]                               # the old trigger stays testable


def test_grape_samples_v2_phenotypes_and_they_build(monkeypatch):
    phenotypes = ge_module.start_ge(sample=True, grammar_file=V2, population_size=20)
    assert len(phenotypes) == 20 and len(set(phenotypes)) > 1
    params = parse_phenotype_params(phenotypes[0])
    assert set(params) == {"pedestrian", "dress", "direction", "approach_distance_m",
                           "fog_density", "pedestrian_min_speed_mps", "crossing_trigger_m"}
    code, built = util.build_scenario(phenotypes[0])
    assert built["approach_distance_m"] == float(params["approach_distance_m"])
    assert built["pedestrian_min_speed_mps"] == float(params["pedestrian_min_speed_mps"])
    assert f"PEDESTRIAN_MIN_SPEED = {float(params['pedestrian_min_speed_mps'])}" in code
    assert not re.search(r"<[a-z_]+>", code)                              # no unresolved placeholders
    parse_string(code, "exec", filename="scratch.temp")


def test_old_bnf_scenarios_keep_their_meaning():
    phenotype = ("A { pedestrian : Adult } wearing a {dress : Light} dress trying to cross road "
                 "from { direction : RL } at { distance : Short } distance on a day with fog density "
                 "{fog_density : 0}")
    _, built = util.build_scenario(phenotype)
    assert built["approach_distance_m"] == 20.0
    assert built["crossing_trigger_m"] == util.DEFAULT_CROSSING_TRIGGER_M
    assert built["pedestrian_min_speed_mps"] == util.DEFAULT_PEDESTRIAN_MIN_SPEED_MPS


def test_scene_settings_are_checkable_assumptions():
    from scripts.analysis.admissibility import parse_assumption
    for text in ("approach_distance_m >= 15", "crossing_trigger_m > 8", "pedestrian_min_speed_mps <= 3"):
        assert parse_assumption(text)["kind"] == "scenario"


def test_smoke_run_column_name_is_read(tmp_path):
    """Job 4354082 wrote the car start as ego_start_m (renamed afterwards)."""
    from scripts.analysis import failure_model
    (tmp_path / "simulations.csv").write_text("scenario_id,passed,ego_start_m\n0,True,20\n")
    df = failure_model.load_simulations(str(tmp_path))
    assert df.loc[0, "approach_distance_m"] == 20
