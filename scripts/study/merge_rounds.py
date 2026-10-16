"""Merge one car's runs of the study space into a single round.

The study space (docs/paper/experiment_design.md) was run as half-chunk jobs,
so each car's 288 scenarios are spread over 12-13 run folders.
`artifacts/study/space_manifest.csv` says which run supplies each (car,
scenario) cell. This writes one ordinary run folder per car with exactly those
cells - run_meta.json, scenarios.csv, simulations.csv and traces/ - so the
analysis, the comparison and the review page read it like any other run.

Scenario numbers and seeds are already global in every source run
(REAL_SCENARIO_OFFSET), so nothing is renumbered. Each simulation row keeps its
origin in `source_run_id`; run_meta lists every source run. The rows of the
worst-scenario video pass (scenario_id "best_video") are not samples and are
left out, as are the source runs' frames and videos.

    python -m scripts.study.merge_rounds --car C1 --out artifacts/study/rounds/C1
"""
import argparse
import csv
import json
import os
import shutil
from datetime import datetime, timezone

import pandas as pd

from real_config import settings

MANIFEST = os.path.join("artifacts", "study", "space_manifest.csv")
RUNS_DIR = os.path.join(settings.artifacts_dir, "runs")


def _cells(manifest, car):
    with open(manifest) as f:
        rows = [r for r in csv.DictReader(f) if r["car"] == car]
    if not rows:
        raise ValueError(f"no cells for car {car!r} in {manifest}")
    return {int(r["scenario_id"]): r["run_id"] for r in rows}


def merge(car, out_dir, manifest=MANIFEST, runs_dir=RUNS_DIR):
    cells = _cells(manifest, car)
    by_run = {}
    for sid, run in cells.items():
        by_run.setdefault(run, set()).add(sid)

    if os.path.exists(out_dir):
        raise FileExistsError(f"{out_dir} exists; results are never overwritten - move it aside first")
    os.makedirs(os.path.join(out_dir, "traces"))

    scenarios, sims, sources = [], [], []
    run_id = f"study_{car}"
    for run in sorted(by_run):
        src = os.path.join(runs_dir, run)
        wanted = by_run[run]
        sc = pd.read_csv(os.path.join(src, "scenarios.csv"), dtype={"scenario_id": str})
        sc = sc[sc.scenario_id.isin({str(s) for s in wanted})]
        si = pd.read_csv(os.path.join(src, "simulations.csv"), dtype={"scenario_id": str})
        si = si[si.scenario_id.isin({str(s) for s in wanted})].copy()
        si.insert(0, "source_run_id", si["run_id"])
        si["run_id"] = run_id
        for _, row in si.iterrows():
            name = f"{row.scenario_id}_{int(row.sim_index)}.json"
            shutil.copy2(os.path.join(src, "traces", name), os.path.join(out_dir, "traces", name))
        with open(os.path.join(src, "run_meta.json")) as f:
            meta = json.load(f)
        sources.append({"run_id": run, "scenario_source": meta.get("scenario_source"),
                        "scenarios": sorted(wanted), "simulations": int(len(si))})
        scenarios.append(sc)
        sims.append(si)

    scenarios = pd.concat(scenarios).assign(_n=lambda d: d.scenario_id.astype(int)).sort_values("_n").drop(columns="_n")
    sims = (pd.concat(sims).assign(_n=lambda d: d.scenario_id.astype(int))
            .sort_values(["_n", "sim_index"]).drop(columns="_n"))
    scenarios.to_csv(os.path.join(out_dir, "scenarios.csv"), index=False)
    sims.to_csv(os.path.join(out_dir, "simulations.csv"), index=False)

    with open(os.path.join(runs_dir, sources[0]["run_id"], "run_meta.json")) as f:
        meta = json.load(f)
    for key in ("worst_phenotype", "worst_pct", "finished_at"):
        meta.pop(key, None)
    meta.update(run_id=run_id, mode="list", scenario_source=f"study space, merged ({manifest})",
                scenario_offset=0, n_scenarios=int(len(scenarios)), status="complete",
                created_at=datetime.now(timezone.utc).isoformat(), merged_from=sources)
    with open(os.path.join(out_dir, "run_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    return {"run_id": run_id, "scenarios": int(len(scenarios)), "simulations": int(len(sims)),
            "sources": len(sources)}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--car", required=True, help="C1, C2, C3 or C4")
    parser.add_argument("--out", required=True, help="new folder for the merged round")
    parser.add_argument("--manifest", default=MANIFEST)
    args = parser.parse_args()
    print(json.dumps(merge(args.car, args.out, args.manifest)))


if __name__ == "__main__":
    main()
