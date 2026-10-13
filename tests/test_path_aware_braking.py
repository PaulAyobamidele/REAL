"""The path-aware braking module: camera-only lane estimate, exact module
names, and refusal of modules the executor does not implement."""

import asyncio

import pytest

from scripts.simulations import path_estimate as pe
from scripts.simulations import util
from test_grammar import REQUIREMENT


def _box(centre_x, height, conf=0.9, top=200.0):
    return {"xmin": centre_x - 10, "xmax": centre_x + 10, "ymin": top, "ymax": top + height,
            "confidence": conf}


def test_lateral_offset_follows_the_pinhole_model():
    # an adult (1.7 m) 1 m right of the axis, 120 px tall: (x - 320) = 1.0 * 120 / 1.7
    x = 320 + 120 / 1.7
    assert pe.lateral_offset_m(x - 10, x + 10, 100, 220) == pytest.approx(1.0)
    assert pe.lateral_offset_m(0, 10, 100, 100.5) is None          # degenerate box


def test_person_on_the_pavement_is_not_in_the_path():
    in_lane = _box(320 + 1.0 * 120 / 1.7, 120, conf=0.8)            # 1 m off the axis
    pavement = _box(320 + 3.5 * 120 / 1.7, 120, conf=0.95)          # 3.5 m off the axis
    assert pe.in_path_confidence([pavement]) == 0.0
    assert pe.in_path_confidence([in_lane, pavement]) == 0.8


def test_a_child_is_estimated_further_out_than_they_are():
    # a 1.2 m child truly 2.0 m off the axis (inside the 2.5 m band), 100 px tall
    child = _box(320 + 2.0 * 100 / 1.2, 100)
    assert pe.lateral_offset_m(child["xmin"], child["xmax"], child["ymin"], child["ymax"]) > 2.5
    assert pe.in_path_confidence([child]) == 0.0                     # missed: a measurable weakness


def test_module_is_offered_and_resolved_by_exact_name():
    assert "path_aware_braking" in util.BRAKING_BEHAVIOURS
    assert util.braking_mode_from_module("path_aware_braking") == "path_aware_braking"


def test_api_refuses_an_unimplemented_module():
    import api_app
    req = REQUIREMENT.replace('performed by "proportional_braking"', 'performed by "proportional_braking_with_resume"')
    out = asyncio.run(api_app.run_grid_endpoint(requirement=req, trials=1))
    assert out["STATUS"] == "NOT OK" and "unknown braking module" in out["error"]


def test_requirement_writer_fallback_matches_the_executor():
    from scripts.analysis import refine
    assert set(refine._FALLBACK_BRAKING) == set(util.BRAKING_BEHAVIOURS)
