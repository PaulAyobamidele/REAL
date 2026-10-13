"""Weather and occlusion as scenario parameters (docs/design/parameters.md):
each one reaches the scene, the telemetry, the assumption vocabulary and the
scenario keywords. No CARLA: the scene is compiled against the map in the repo."""

import math
import os
import random
import sys
from unittest import mock

import pytest

from scripts.analysis import admissibility, telemetry
from scripts.evolve.constraints import extract_constraints, parse_phenotype_params
from scripts.simulations import util

scenic = pytest.importorskip("scenic")
from scenic.syntax.parser import parse_string  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN01 = os.path.join(ROOT, "Scenic", "assets", "maps", "CARLA", "Town01.xodr")
OLD = ("A { pedestrian : Adult } wearing a {dress : Light} dress trying to cross road from "
       "{ direction : LR } at { distance : Short } distance on a day with fog density {fog_density : 0}")
V3 = ("A { pedestrian : Child } wearing a {dress : Dark} dress trying to cross road from "
      "{ direction : RL } with the car { approach_distance_m : 20 } m away on a day with fog density "
      "{fog_density : 70}, sun altitude {sun_altitude_angle : -10} deg, road wetness {wetness : 80}, "
      "rain {precipitation : 60}, cloud {cloudiness : 100}, occlusion {occlusion : 1}, walking at "
      "least {pedestrian_min_speed_mps : 1.5} m/s, stepping out at {crossing_trigger_m : 0} m")


def test_defaults_keep_earlier_runs_unchanged():
    code, params = util.build_scenario(OLD)
    assert (params["cloudiness"], params["precipitation"], params["wetness"]) == (50.0, 0.0, 0.0)
    assert (params["sun_altitude_angle"], params["sun_azimuth_angle"]) == (60.0, 80.0)
    assert params["occlusion"] == 0 and "OCCLUSION = 0" in code
    parse_string(code, "exec", filename="scratch.temp")


def test_negative_values_and_new_settings_are_read():
    p = parse_phenotype_params(V3)
    assert p["sun_altitude_angle"] == "-10" and p["occlusion"] == "1"
    code, params = util.build_scenario(V3)
    assert params["sun_altitude_angle"] == -10.0 and params["wetness"] == 80.0
    assert params["precipitation_deposits"] == 80.0 and params["occlusion"] == 1
    assert '"sun_altitude_angle": -10.0' in code and "OCCLUSION = 1" in code
    parse_string(code, "exec", filename="scratch.temp")


def test_v3_grammar_samples_and_builds():
    import scripts.evolve.ge as ge_module
    phenotypes = ge_module.start_ge(sample=True, grammar_file="v3/scene_v3.bnf", population_size=10)
    params = parse_phenotype_params(phenotypes[0])
    assert {"sun_altitude_angle", "wetness", "precipitation", "cloudiness", "occlusion"} <= set(params)
    code, _ = util.build_scenario(phenotypes[0])
    parse_string(code, "exec", filename="scratch.temp")


def test_settings_reach_every_telemetry_row(tmp_path):
    telemetry.set_run("r", str(tmp_path))
    _, params = util.build_scenario(V3)
    telemetry.begin_scenario(0, V3, parse_phenotype_params(V3),
                             scene={k: params[k] for k in util.NUMERIC_SETTINGS + util.WORLD_SETTINGS})
    telemetry.begin_simulation()
    row = telemetry.end_simulation(rho=1.0, distances=[20.0, 19.0], speeds=[7.5, 7.5], timestep=0.1)
    telemetry.clear()
    assert (row["sun_altitude_angle"], row["wetness"], row["occlusion"]) == (-10.0, 80.0, 1)


def test_settings_are_checkable_assumptions():
    item = admissibility.parse_assumption("sun_altitude_angle >= -5")
    assert (item["kind"], item["value"]) == ("scenario", "-5")
    assert admissibility.assumption_status(item, -10) == "broken"
    assert admissibility.assumption_status(item, 60) == "held"
    for text in ("wetness <= 50", "occlusion == 0", "precipitation < 30", "cloudiness <= 100"):
        assert admissibility.parse_assumption(text)["kind"] == "scenario"


def test_scenario_keywords_steer_the_new_settings():
    c = extract_constraints("A child crossing at night in the rain, hidden by a parked car, on a wet road")
    assert c["sun_altitude_angle"] == "-10" and c["precipitation"] == "60"
    assert c["occlusion"] == "1" and c["wetness"] == "80" and c["pedestrian"] == "Child"
    assert "sun_altitude_angle" not in extract_constraints("A pedestrian on a day with fog")
    assert extract_constraints("a pedestrian in dark clothes")["dress"] == "Dark"


@pytest.fixture
def offline_scenic(monkeypatch):
    if not os.path.exists(TOWN01):
        pytest.skip("Town01.xodr not in the repo")
    monkeypatch.setitem(sys.modules, "carla", sys.modules.get("carla") or mock.MagicMock())
    import redis
    import torch
    monkeypatch.setattr(redis, "StrictRedis", mock.MagicMock())
    monkeypatch.setattr(redis, "Redis", mock.MagicMock())
    monkeypatch.setattr(torch.hub, "load", mock.MagicMock())
    import real_config
    monkeypatch.setattr(real_config.settings, "carla_map_path", TOWN01)


def test_parked_car_is_placed_between_car_and_pedestrian_outside_the_lane(offline_scenic):
    code, params = util.build_scenario(V3)
    random.seed(11)
    scenario = scenic.scenarioFromString(code, mode2D=True)
    for _ in range(3):
        scene, _ = scenario.generate(maxIterations=3000)
        ego = scene.egoObject
        ped = next(o for o in scene.objects if type(o).__name__ == "Pedestrian")
        parked = [o for o in scene.objects if o is not ego and type(o).__name__ == "Car"]
        assert len(parked) == 1
        rel_car = (parked[0].position - ego.position).rotatedBy(-ego.heading)   # x right, y forward
        rel_ped = (ped.position - ego.position).rotatedBy(-ego.heading)
        assert abs(rel_car.x) >= 2.0                                  # outside the car's lane
        assert rel_car.x * rel_ped.x > 0                              # on the pedestrian's side
        assert 0 < rel_car.y < rel_ped.y                              # between the car and the pedestrian
        heading_gap = math.degrees(abs((parked[0].heading - ego.heading + math.pi) % (2 * math.pi) - math.pi))
        assert heading_gap < 20                                       # parked along the road
