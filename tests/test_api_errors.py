"""The API must say WHY a requirement did not parse, not return nothing."""

import api_app
from test_grammar import REQUIREMENT


def test_verify_requirement_reports_parse_error():
    out = api_app.verify_requirement("MAINTAIN Pedestrian Safety by nothing")
    assert out["STATUS"] == "NOT OK"
    assert "does not parse" in out["error"] and "line 1" in out["error"]
    assert "requirement_full_example.dsl" in out["hint"]


def test_verify_requirement_ok_lists_system_and_clauses():
    out = api_app.verify_requirement(REQUIREMENT.rstrip() + '\n    assuming "fog_density <= 50"\n')
    assert out["STATUS"] == "OK"
    assert out["system_under_test"]["braking_mode"] == "proportional_braking"
    assert out["assumptions"] == ["fog_density <= 50"] and out["soft_goals"] == []
