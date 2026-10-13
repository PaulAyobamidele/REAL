"""analysis_report.json schema 2: per-simulation labels, the change each
mitigation implies, rules as assumptions, artefacts, bars - and strict JSON.
What the review interface (ui/) reads."""

import collections
import csv
import json
import re

from scripts.analysis import failure_model, obstacles, report, telemetry
from test_analysis import write_synthetic_run
from test_grammar import REQUIREMENT


def test_report_lists_every_simulation_with_its_labels(tmp_path):
    req = REQUIREMENT.rstrip() + ('\n    assuming "fog_density <= 0" & "daylight"'
                                  '\n    ensuring "resume_within_s <= 10"\n')
    write_synthetic_run(str(tmp_path), trials=3, child_fail_rate=1.0, adult_fail_rate=0.0,
                        requirement=req, no_encounter_per_scenario=1)
    a = report.analyse(str(tmp_path))
    assert a["schema_version"] == report.REPORT_SCHEMA_VERSION == 2
    sims = a["simulations"]
    assert len(sims) == 32 * 3
    fm, adm = a["failure_model"], a["admissibility"]

    # the labels agree with the aggregates the report already carried
    in_scope = [s for s in sims if s["admissible"]]
    assert len(in_scope) == adm["n_admissible"]
    assert len(sims) - len(in_scope) == adm["n_spurious"]
    outcomes = collections.Counter(s["outcome"] for s in in_scope)
    assert outcomes["no_encounter"] == fm["n_no_encounter"]
    assert sum(1 for s in in_scope if s["encounter"] and s["failed"]) == fm["failures"]
    assert sum(1 for s in in_scope if s["encounter"]) == fm["n_encounters"]
    assert all(s["outcome"] in failure_model.OUTCOMES for s in sims)

    # fog 50 rows break `fog_density <= 0` and are set aside with the reason named
    set_aside = [s for s in sims if not s["admissible"]]
    assert set_aside
    assert all(s["set_aside_reason"] == "assumption: fog_density <= 0" for s in set_aside)
    assert all(s["assumptions"]["fog_density <= 0"] == "broken" for s in set_aside)
    assert all(s["assumptions"]["fog_density <= 0"] == "held" for s in in_scope)
    assert all("daylight" not in s["assumptions"] for s in sims)   # free text: not checked per row

    # soft goals: over in-scope encounters only; scene v1 data has no measure
    enc = [s for s in in_scope if s["encounter"]]
    assert all(s["soft_goals"] == {"resume_within_s <= 10": "not_measured"} for s in enc)
    assert all(s["soft_goals"] == {} for s in sims if not (s["admissible"] and s["encounter"]))
    assert all(s["trace"] is None for s in sims)   # the synthetic run has no traces
    assert all(isinstance(s["sim_index"], int) for s in sims)


def test_recording_pass_rows_are_listed_but_never_counted(tmp_path):
    write_synthetic_run(str(tmp_path), trials=2)
    path = tmp_path / "simulations.csv"
    with open(path) as f:
        rows = list(csv.DictReader(f))
    extra = dict(rows[0], scenario_id="best_video", sim_index="0")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=telemetry.FIELDS)
        w.writeheader()
        w.writerows(rows + [extra])
    a = report.analyse(str(tmp_path))
    assert a["failure_model"]["n_simulations"] == 64
    assert len(a["simulations"]) == 65
    rec = a["simulations"][-1]
    assert rec["recording_pass"] is True and rec["scenario_id"] == "best_video"
    assert rec["outcome"] is None and rec["admissible"] is None and rec["encounter"] is False


def test_report_records_changes_artefacts_and_bars(tmp_path):
    write_synthetic_run(str(tmp_path), trials=2, requirement=REQUIREMENT)
    rules = tmp_path / "rules.json"
    rules.write_text(json.dumps({"rules": [
        {"name": "no_fog", "param": "fog_density", "op": ">", "value": 0, "reason": "test"},
        {"name": "kids", "param": "pedestrian", "op": "in", "value": ["Child"], "reason": "test"}]}))
    a = report.analyse(str(tmp_path), str(rules))
    by_name = {r["name"]: r for r in a["admissibility"]["rules"]}
    assert by_name["no_fog"]["as_assumption"] == "fog_density <= 0"
    assert by_name["kids"]["as_assumption"] is None

    standoff = next(o for o in a["obstacles"] if o["id"] == "StandoffUnnecessaryStop")
    assert set(standoff["changes"]) == {k for k, v in standoff["mitigations"].items() if v}
    assert standoff["changes"]["requirement"]["kind"] == "R"
    assert standoff["changes"]["requirement"]["clause"] == "ensuring"
    assert standoff["changes"]["scenario"]["kind"] == "T"
    assert standoff["changes"]["system"]["kind"] == "S"
    assert standoff["changes"]["system"]["available"] is False   # the executor lacks that module
    late = next(o for o in a["obstacles"] if o["id"] == "DetectionTooLate")
    assert late["changes"]["system"]["module"] == "proportional_braking"
    assert late["changes"]["system"]["available"] is True
    assert late["changes"]["requirement"]["kind"] == "D"      # an `assuming` item

    assert [x["id"] for x in a["scenario_artefacts"]] == [x["id"] for x in obstacles.SCENARIO_ARTEFACTS]
    art = {x["id"]: x for x in a["scenario_artefacts"]}
    assert art["no_encounter_geometry"]["value"] == a["failure_model"]["n_no_encounter"]
    assert art["crossing_trigger_8m"]["value"] == a["failure_model"]["passed_stalled"]
    assert a["bars"] == {"min_share": obstacles.MIN_SHARE, "min_effect": failure_model.MIN_EFFECT,
                         "min_n": failure_model.MIN_N, "min_n_failures": obstacles.MIN_N_FAILURES}
    assert a["requirement"]["tree"]["objective"] == "Pedestrian Safety"


def test_written_report_is_strict_json(tmp_path):
    # every row a no-encounter: rates over encounters are NaN in memory
    write_synthetic_run(str(tmp_path), trials=1, child_fail_rate=0.0, adult_fail_rate=0.0,
                        no_encounter_per_scenario=1)
    analysis, _ = report.write_report(str(tmp_path))
    assert analysis["failure_model"]["n_encounters"] == 0
    text = (tmp_path / "analysis_report.json").read_text()
    assert not re.search(r"\bNaN\b|\bInfinity\b", text)
    loaded = json.loads(text)
    assert loaded["failure_model"]["failure_rate"] is None
    assert loaded["schema_version"] == 2
