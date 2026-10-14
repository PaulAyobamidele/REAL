"""A partial analysis (Run Test, while a job runs) on real data: run 2b cut
down to its first 10 scenarios, as a partial pull would find it - finished
scenarios in scenarios.csv, their rows in simulations.csv, their traces."""

import csv
import json
import os
import shutil

import pytest

from scripts.analysis import report

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN_2B = os.path.join(ROOT, "artifacts", "runs", "657a1447d0ba43af9c3aa54f3c8698ce")
KEEP = 10


def _cut(src, dst):
    os.makedirs(os.path.join(dst, "traces"))
    shutil.copy(os.path.join(src, "run_meta.json"), dst)
    for name in ("scenarios.csv", "simulations.csv"):
        with open(os.path.join(src, name)) as f:
            rows = list(csv.DictReader(f))
        # the best-of-run video row is written at the end of a run: never in a partial pull
        kept = [r for r in rows if r["scenario_id"].isdigit() and int(r["scenario_id"]) < KEEP]
        with open(os.path.join(dst, name), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(kept)
    for t in os.listdir(os.path.join(src, "traces")):
        if t.split("_")[0].isdigit() and int(t.split("_")[0]) < KEEP:
            shutil.copy(os.path.join(src, "traces", t), os.path.join(dst, "traces", t))
    with open(os.path.join(dst, "simulations.csv")) as f:
        return sum(1 for _ in csv.DictReader(f))


def test_a_partial_run_is_analysed_and_labelled(tmp_path):
    if not os.path.exists(os.path.join(RUN_2B, "simulations.csv")):
        pytest.skip("run 2b not in this workspace")
    run = tmp_path / "run"
    kept = _cut(RUN_2B, str(run))
    out = run / "partial" / f"after_{KEEP}_of_32"
    report.write_report(str(run), out_dir=str(out), banner=f"PARTIAL ({KEEP} of 32 scenarios) - the job is still running")
    analysis = json.loads((out / "analysis_report.json").read_text())
    assert analysis["banner"].startswith(f"PARTIAL ({KEEP} of 32")
    assert len(analysis["simulations"]) == kept
    assert {int(s["scenario_id"]) for s in analysis["simulations"]} <= set(range(KEEP))
    assert (out / "analysis_report.md").read_text().count(f"PARTIAL ({KEEP} of 32") == 1
    assert not (run / "analysis_report.json").exists()
