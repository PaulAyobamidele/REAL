"""Laptop check: Scenic must be able to BUILD the scene, not only parse it.

Smoke run 2 (job 4385790) queued for hours and then died in 4 minutes on a
template line that parsed fine but that Scenic rejected when building the
scene (Notes 8.27). This compiles the real template against the real Town01
map shipped in the repo and samples scenes, for every direction x distance,
and checks the geometry. No CARLA, GPU or YOLO: `carla`, Redis and
torch.hub.load are stood in, because only placement is checked here. What
happens once the car moves (e.g. leaving the road) still needs a Narval run.
"""

import math
import os
import random
import sys
from unittest import mock

import pytest

scenic = pytest.importorskip("scenic")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN01 = os.path.join(ROOT, "Scenic", "assets", "maps", "CARLA", "Town01.xodr")
PHENOTYPE = ("A {{ pedestrian : Child }} wearing a {{dress : Dark}} dress trying to cross road "
             "from {{ direction : {d} }} at {{ distance : {dist} }} distance on a day with fog density "
             "{{fog_density : 0}}")


def _angle(a):
    return math.degrees((a + math.pi) % (2 * math.pi) - math.pi)


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


@pytest.mark.parametrize("direction", ["LR", "RL"])
@pytest.mark.parametrize("distance", ["Short", "Long"])
def test_scene_builds_and_is_placed_right(offline_scenic, direction, distance):
    from scripts.simulations import util
    code, params = util.build_scenario(PHENOTYPE.format(d=direction, dist=distance))
    random.seed(7)
    scenario = scenic.scenarioFromString(code, mode2D=True)
    for _ in range(3):
        scene, _ = scenario.generate(maxIterations=3000)
        ego = scene.egoObject
        ped = next(o for o in scene.objects if type(o).__name__ == "Pedestrian")
        lane_heading = ego.lane.orientation[ego.position]
        lane_heading = getattr(lane_heading, "yaw", lane_heading)
        # the car drives with its lane
        assert abs(_angle(ego.heading - lane_heading)) < 20
        # the pedestrian is ahead, about the chosen distance (jitter +-1 m)
        rel = (ped.position - ego.position).rotatedBy(-ego.heading)    # x right, y forward
        assert abs(rel.y - params["approach_distance_m"]) < 2.5
        # ... at the kerb it starts from, facing across the road
        side = util.DIRECTIONS[direction]["pedestrian_side"]
        assert rel.x * side > 1.5
        assert abs(_angle(ped.heading - ego.heading) - util.DIRECTIONS[direction]["pedestrian_angle"]) < 5
