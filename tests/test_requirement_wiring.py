import re
"""The simulator must run the system the requirement describes: the braking
module and perception model named after "performed by" reach the Scenic
program and the run metadata."""

import json
import os

import pytest
from scenic.syntax.parser import parse_string

from scripts.simulations import util
from test_grammar import REQUIREMENT  # tests/ is on sys.path under pytest's default import mode

PHENOTYPE = ("A { pedestrian : Child } wearing a {dress : Dark} dress trying to cross road "
             "from { direction : LR } at { distance : Long } distance on a day with fog density "
             "{fog_density : 50}")


@pytest.fixture(autouse=True)
def reset_context():
    saved = dict(util.RUN_CONTEXT)
    yield
    util.RUN_CONTEXT.update(saved)


def test_braking_mode_from_module():
    assert util.braking_mode_from_module("proportional_braking") == "proportional_braking"
    assert util.braking_mode_from_module("path_aware_braking") == "path_aware_braking"
    assert util.braking_mode_from_module("emergency_braking") == "emergency_braking"
    assert util.braking_mode_from_module("braking module") == "emergency_braking"   # explicit legacy name
    assert util.braking_mode_from_module(None) == "emergency_braking"               # none named: default
    for name in ("hydraulic_thing", "Proportional Braking", "proportional_braking_with_resume"):
        with pytest.raises(ValueError, match="unknown braking module"):          # refused, not swapped
            util.braking_mode_from_module(name)


def test_resolve_yolo_model_checks_weights_exist():
    assert util.resolve_yolo_model("yolov5s") == "yolov5s"
    assert util.resolve_yolo_model(None) == "yolov5s"
    with pytest.raises(ValueError, match="unknown perception model"):
        util.resolve_yolo_model("no_such_model")
    if os.path.exists(os.path.join(util.settings.model_dir, "fine_tune.pt")):
        assert util.resolve_yolo_model("fine_tune") == "fine_tune"


def test_configure_sets_context():
    ctx = util.configure(braking_mode="proportional_braking", yolo_model="yolov5s")
    assert ctx == {"braking_mode": "proportional_braking", "yolo_model": "yolov5s"}
    ctx = util.configure(braking_mode="braking module")          # explicit legacy name
    assert ctx["braking_mode"] == "emergency_braking"
    with pytest.raises(ValueError):
        util.configure(braking_mode="some braking module")


@pytest.mark.parametrize("mode", sorted(util.BRAKING_BEHAVIOURS))
def test_build_scenario_emits_each_braking_mode_and_parses(mode):
    code, params = util.build_scenario(PHENOTYPE, braking_mode=mode)
    assert params["braking_mode"] == mode
    assert not re.search(r"<[a-z_]+>", code)                                   # no unresolved placeholders
    assert "behavior Exp_EgoBehaviour" in code
    if mode == "proportional_braking":
        assert "SetBrakeAction" in code and "CAUTION_CONFIDENCE" in code
    elif mode == "path_aware_braking":
        assert "perceive_in_path(" in code and "def perceive_in_path" in code
    else:
        assert "YoloEmergencyBraking" in code
    parse_string(code, "exec", filename="scratch.temp")     # Scenic accepts it


def test_build_scenario_defaults_to_configured_mode():
    util.configure(braking_mode="proportional_braking")
    code, params = util.build_scenario(PHENOTYPE)
    assert params["braking_mode"] == "proportional_braking" and "SetBrakeAction" in code
    util.configure(braking_mode="emergency_braking")
    code, params = util.build_scenario(PHENOTYPE)
    assert params["braking_mode"] == "emergency_braking" and "YoloEmergencyBraking" in code


def test_requirement_names_reach_the_run(tmp_path, monkeypatch):
    """End to end without CARLA: requirement text -> api helper -> grid -> meta/template."""
    import real_config
    import api_app
    from scripts.evolve.grid import run_grid
    from scripts.redsl.grammar import DSL

    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))
    sut = api_app.system_under_test_from(DSL(REQUIREMENT))
    assert sut == {"braking_module": "proportional_braking", "braking_mode": "proportional_braking",
                   "perception_module": "yolov5s"}

    def fake_evaluate(phenotype, num_test, seed, scenario_id):
        return {"total": num_test, "passed": num_test, "failed": 0, "pct": 100.0}

    run_grid("wired", requirement=REQUIREMENT, trials=1, record_video=False, evaluate=fake_evaluate,
             braking_mode=sut["braking_mode"], yolo_model=sut["perception_module"])

    meta = json.load(open(tmp_path / "runs" / "wired" / "run_meta.json"))
    assert meta["system_under_test"] == {"braking_mode": "proportional_braking", "yolo_model": "yolov5s"}
    code = (tmp_path / "runs" / "wired" / "best_scenario.scenic").read_text()
    assert "SetBrakeAction" in code and "YoloEmergencyBraking" not in code
