"""Merging a car's half-chunk runs into one round keeps exactly the manifest's
cells, their global ids and their traces, and records where each came from."""
import csv
import json
import os

import pandas as pd
import pytest

from scripts.study.merge_rounds import merge


def _run(runs_dir, run_id, scenario_ids, sims_per=3, extra_best_video=True):
    d = runs_dir / run_id
    (d / "traces").mkdir(parents=True)
    with open(d / "scenarios.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["scenario_id", "phenotype", "total"])
        w.writeheader()
        for s in scenario_ids:
            w.writerow({"scenario_id": s, "phenotype": f"p{s}", "total": sims_per})
    rows = [{"run_id": run_id, "scenario_id": str(s), "sim_index": i, "passed": True}
            for s in scenario_ids for i in range(sims_per)]
    if extra_best_video:
        rows.append({"run_id": run_id, "scenario_id": "best_video", "sim_index": 0, "passed": True})
    pd.DataFrame(rows).to_csv(d / "simulations.csv", index=False)
    for r in rows:
        (d / "traces" / f"{r['scenario_id']}_{r['sim_index']}.json").write_text("{}")
    (d / "run_meta.json").write_text(json.dumps({"run_id": run_id, "scenario_source": f"{run_id}.txt",
                                                 "trials_per_scenario": 3, "status": "complete"}))


def test_merge_takes_exactly_the_manifest_cells(tmp_path):
    runs = tmp_path / "runs"
    _run(runs, "a", [0, 1, 2])
    _run(runs, "b", [3, 4, 5])
    _run(runs, "topup", [4])          # supersedes run b's scenario 4
    manifest = tmp_path / "m.csv"
    with open(manifest, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["car", "scenario_id", "run_id", "simulations"])
        for s, r in [(0, "a"), (1, "a"), (2, "a"), (3, "b"), (4, "topup"), (5, "b")]:
            w.writerow(["C1", s, r, 3])
        w.writerow(["C2", 0, "a", 3])
    out = tmp_path / "C1"

    result = merge("C1", str(out), manifest=str(manifest), runs_dir=str(runs))

    assert result == {"run_id": "study_C1", "scenarios": 6, "simulations": 18, "sources": 3}
    sims = pd.read_csv(out / "simulations.csv", dtype={"scenario_id": str})
    assert "best_video" not in set(sims.scenario_id)
    assert list(sims[sims.scenario_id == "4"].source_run_id.unique()) == ["topup"]
    assert set(sims.run_id) == {"study_C1"}
    assert len(os.listdir(out / "traces")) == 18
    meta = json.loads((out / "run_meta.json").read_text())
    assert meta["n_scenarios"] == 6 and [s["run_id"] for s in meta["merged_from"]] == ["a", "b", "topup"]


def test_merge_never_overwrites(tmp_path):
    runs = tmp_path / "runs"
    _run(runs, "a", [0])
    manifest = tmp_path / "m.csv"
    manifest.write_text("car,scenario_id,run_id,simulations\nC1,0,a,3\n")
    (tmp_path / "C1").mkdir()
    with pytest.raises(FileExistsError):
        merge("C1", str(tmp_path / "C1"), manifest=str(manifest), runs_dir=str(runs))
