import json

import pytest

from scripts.analysis import compare
from test_analysis import write_synthetic_run


def _meta(run_dir, **extra):
    p = run_dir / "run_meta.json"
    meta = json.load(open(p))
    meta.update(extra)
    json.dump(meta, open(p, "w"))


def test_meta_diff_ignores_volatile_and_fills_assumed():
    a = {"run_id": "a", "created_at": "t1", "seed": 42, "trials_per_scenario": 5, "status": "complete"}
    b = {"run_id": "b", "created_at": "t2", "seed": 42, "trials_per_scenario": 5,
         "system_under_test": {"braking_mode": "proportional_braking", "yolo_model": "yolov5s"}}
    diffs = compare.meta_diff(a, b, assume_a={"system_under_test": {"braking_mode": "emergency_braking",
                                                                    "yolo_model": "yolov5s"}})
    assert diffs == {"system_under_test.braking_mode": ("emergency_braking", "proportional_braking")}
    # a second changed variable is reported too
    b2 = dict(b, seed=7)
    diffs = compare.meta_diff(a, b2, assume_a={"system_under_test": b["system_under_test"]})
    assert set(diffs) == {"seed"}


def test_compare_runs_end_to_end(tmp_path):
    ra, rb = tmp_path / "a", tmp_path / "b"
    # round A: everyone detected too late; round B: half as many failures, some brake_released
    write_synthetic_run(str(ra), trials=4, child_fail_rate=0.75, adult_fail_rate=0.75,
                        adult_kind="detected_too_late", no_encounter_per_scenario=1)
    write_synthetic_run(str(rb), trials=4, child_fail_rate=0.25, adult_fail_rate=0.25,
                        adult_kind="brake_released", no_encounter_per_scenario=1)
    _meta(ra, run_id="round-a", seed=42)
    _meta(rb, run_id="round-b", seed=42,
          system_under_test={"braking_mode": "proportional_braking", "yolo_model": "yolov5s"})

    c, md = compare.write_comparison(str(ra), str(rb),
                                     assume_a={"system_under_test": {"braking_mode": "emergency_braking",
                                                                     "yolo_model": "yolov5s"}})
    assert c["one_variable"] is True
    assert c["meta_diff"] == {"system_under_test.braking_mode": ("emergency_braking", "proportional_braking")}
    assert c["metric_a"]["n_no_encounter"] == 32 and c["metric_b"]["n_no_encounter"] == 32   # 1 per scenario
    assert c["metric_a"]["failure_rate"] > c["metric_b"]["failure_rate"]
    assert c["failure_rate_delta"] < 0
    assert c["failure_type_deltas"]["detected_too_late"]["count"] < 0
    assert (rb / "comparison.md").exists() and (rb / "comparison.json").exists()
    assert "OK: only the system under test differs." in md
    assert "failure rate (encounters)" in md


def test_unexpected_difference_is_flagged(tmp_path):
    ra, rb = tmp_path / "a", tmp_path / "b"
    write_synthetic_run(str(ra), trials=2)
    write_synthetic_run(str(rb), trials=2)
    _meta(ra, run_id="a", seed=42, system_under_test={"braking_mode": "emergency_braking"})
    _meta(rb, run_id="b", seed=43, system_under_test={"braking_mode": "proportional_braking"})
    c, md = compare.write_comparison(str(ra), str(rb))
    assert c["one_variable"] is False
    assert "seed" in c["unexpected_diff"]
    assert "UNEXPECTED" in md and "NOT a one-variable comparison" in md


def test_allowed_difference_is_justified_not_flagged(tmp_path):
    ra, rb = tmp_path / "a", tmp_path / "b"
    write_synthetic_run(str(ra), trials=2)
    write_synthetic_run(str(rb), trials=2)
    _meta(ra, run_id="a", seed=42, system_under_test={"braking_mode": "emergency_braking"}, template_sha256="aaa")
    _meta(rb, run_id="b", seed=42, system_under_test={"braking_mode": "proportional_braking"}, template_sha256="bbb")
    c, md = compare.write_comparison(str(ra), str(rb))
    assert c["one_variable"] is False and "template_sha256" in c["unexpected_diff"]
    c, md = compare.write_comparison(str(ra), str(rb), allow={"template_sha256": "only the behaviour block differs"})
    assert c["one_variable"] is True and c["unexpected_diff"] == {}
    assert c["allowed_diff"] == {"template_sha256": "only the behaviour block differs"}
    assert "(allowed: only the behaviour block differs)" in md and "UNEXPECTED" not in md


def test_requirement_compared_modulo_comments_and_whitespace():
    a = {"run_id": "a", "requirement": "\nMAINTAIN \"x\"\n    by \"y\"\n"}
    b = {"run_id": "b", "requirement": "# header comment\nMAINTAIN \"x\"   by \"y\"\n"}
    assert compare.meta_diff(a, b) == {}
    c = {"run_id": "c", "requirement": "MAINTAIN \"x\" by \"z\""}
    assert "requirement" in compare.meta_diff(a, c)


def test_cli_assume_parsing():
    assert compare._parse_assume(["system_under_test.braking_mode=emergency_braking", "seed=42"]) == {
        "system_under_test": {"braking_mode": "emergency_braking"}, "seed": "42"}
