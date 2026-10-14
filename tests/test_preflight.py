"""The laptop check Run Test makes before submitting (scripts/redsl/preflight.py):
module names resolved as the API resolves them, and real Scenic scene builds
against the Town01 map in the repo (stand-ins for CARLA, Redis and YOLO)."""

import os
import re
import sys
from unittest import mock

import pytest

pytest.importorskip("scenic")

from scripts.evolve import grid  # noqa: E402
from scripts.redsl import preflight  # noqa: E402
from real_config import settings  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SMOKE_LIST = os.path.join(ROOT, "infra", "hpc", "smoke", "scenarios_v3.txt")
with open(os.path.join(ROOT, "docs", "examples", "R_baseline.dsl")) as f:
    BASELINE = f.read()


@pytest.fixture
def offline(monkeypatch):
    if not os.path.exists(preflight.TOWN01):
        pytest.skip("Town01.xodr not in the repo")
    # as tests/test_scene_compile.py; everything preflight replaces is restored afterwards
    monkeypatch.setitem(sys.modules, "carla", sys.modules.get("carla") or mock.MagicMock())
    import redis
    import torch
    monkeypatch.setattr(redis, "StrictRedis", redis.StrictRedis)
    monkeypatch.setattr(redis, "Redis", redis.Redis)
    monkeypatch.setattr(torch.hub, "load", torch.hub.load)
    monkeypatch.setattr(settings, "carla_map_path", settings.carla_map_path)


def test_an_unknown_braking_module_is_refused_with_the_known_ones(offline):
    out = preflight.check(BASELINE.replace('"proportional_braking"', '"proportional_brakng"'))
    assert out["kind"] == "module" and "proportional_brakng" in out["message"]
    assert "path_aware_braking" in out["message"]


def test_an_unknown_detector_is_refused(offline):
    out = preflight.check(BASELINE.replace('"yolov5s"', '"yolov9x"'))
    assert out["kind"] == "module" and "yolov9x" in out["message"]


def test_a_list_run_builds_every_listed_scenario(offline):
    if not os.path.exists(SMOKE_LIST):
        pytest.skip("smoke list not in the repo")
    out = preflight.check(BASELINE, "list", scenario_file=SMOKE_LIST)
    assert out["ok"], out["message"]
    assert out["checked"] == 4 and out["system_under_test"]["braking_mode"] == "proportional_braking"


def test_a_scene_scenic_cannot_build_is_refused_with_its_message(offline, tmp_path):
    if not os.path.exists(SMOKE_LIST):
        pytest.skip("smoke list not in the repo")
    good = next(line.strip() for line in open(SMOKE_LIST) if line.strip() and not line.startswith("#"))
    bad = good.replace("{ direction : LR }", "{ direction : XX }").replace("{ direction : RL }", "{ direction : XX }")
    assert bad != good
    lst = tmp_path / "two.txt"
    lst.write_text(good + "\n" + bad + "\n")
    out = preflight.check(BASELINE, "list", scenario_file=str(lst))
    assert not out["ok"] and out["kind"] == "scene" and out["checked"] == 2
    assert len(out["failures"]) == 1 and out["failures"][0]["scenario"] == bad and out["failures"][0]["error"]


def test_the_covering_set_has_every_value_of_every_parameter():
    rule, categories = grid.grammar_terminals(os.path.join(settings.grammar_base_dir, "v3/scene_v3.bnf"))
    scenes = preflight.covering(rule, categories)
    assert len(scenes) == max(len(v) for v in categories.values()) <= 12
    for name, values in categories.items():
        for v in values:
            slot = re.compile(r"\{\s*" + re.escape(name) + r"\s*:\s*" + re.escape(v) + r"\s*\}")
            assert any(slot.search(s) for s in scenes), (name, v)


def test_the_grid_check_builds_all_32():
    phenotypes, how = preflight.scenarios_for("grid")
    assert len(phenotypes) == 32 and how == "all 32 scenarios"
