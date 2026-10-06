import csv
import json
import os
import uuid
from datetime import datetime, timezone

from real_config import settings


def new_run_id():
    return uuid.uuid4().hex


def run_dir(run_id):
    path = os.path.join(settings.artifacts_dir, "runs", run_id)
    os.makedirs(path, exist_ok=True)
    return path


def _logbook_rows(logbook):
    if logbook is None:
        return []
    try:
        return list(logbook)
    except TypeError:
        return []


def system_under_test():
    """The braking mode / perception model this run is configured with
    (scripts/simulations/util.py::RUN_CONTEXT), for run_meta.json. Imported
    lazily so metadata-only callers do not pull in VerifAI/Scenic."""
    try:
        from scripts.simulations.util import RUN_CONTEXT
        return dict(RUN_CONTEXT)
    except Exception:
        return {}


def scene():
    """Which test scene this run used (scene v2 = roadmap M2, Notes 8.19), for
    run_meta.json - so runs on different scenes are never compared as if the
    only change were the car. Lazy import, as above."""
    try:
        from scripts.simulations import util
        return {"version": util.SCENE_VERSION, "max_steps": util.MAX_STEPS,
                "crossing_trigger_m": util.DEFAULT_CROSSING_TRIGGER_M,
                "pedestrian_min_speed_mps": util.DEFAULT_PEDESTRIAN_MIN_SPEED_MPS,
                "approach_distance_m": dict(util.APPROACH_DISTANCE_M), "directions": dict(util.DIRECTIONS)}
    except Exception:
        return {}


def write_meta(run_id, meta):
    """Write run_meta.json now - GE runs call this at the start (status
    "running"), so a run cut off by the Slurm time limit still records what
    it was testing."""
    out_dir = run_dir(run_id)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "run_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    return out_dir


def persist_run(run_id, logbook, hof, requirement=None, scenario_text=None, constraints=None,
                 record_video=True):
    """Write a completed GE run's outputs to settings.artifacts_dir/runs/<run_id>/:
    run_meta.json, generations.csv, best_phenotype.txt, best_scenario.scenic.
    An early run_meta.json (write_meta) is kept and completed, not replaced.
    """
    out_dir = run_dir(run_id)
    meta_path = os.path.join(out_dir, "run_meta.json")
    early = {}
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            early = json.load(f)

    best = hof[0] if hof and len(hof) else None
    best_phenotype = best.phenotype if best is not None else None

    meta = {
        "run_id": run_id,
        "mode": "ge",
        "requirement": requirement,
        "scenario_text": scenario_text,
        "constraints": constraints or {},
        "system_under_test": system_under_test(),
        "scene": scene(),
        "best_phenotype": best_phenotype,
        "seed": settings.random_seed,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    meta = dict(early, **{k: v for k, v in meta.items() if k not in early or k == "best_phenotype"},
                status="complete", completed_at=datetime.now(timezone.utc).isoformat())
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    rows = _logbook_rows(logbook)
    with open(os.path.join(out_dir, "generations.csv"), "w", newline="") as f:
        if rows:
            fieldnames = sorted({key for row in rows for key in row.keys()})
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
        else:
            f.write("")

    with open(os.path.join(out_dir, "best_phenotype.txt"), "w") as f:
        f.write(best_phenotype or "")

    scenic_path = os.path.join(out_dir, "best_scenario.scenic")
    if best_phenotype:
        _write_best_scenario(out_dir, scenic_path, best_phenotype, record_video)
    else:
        open(scenic_path, "w").close()

    return out_dir


def _write_best_scenario(out_dir, scenic_path, best_phenotype, record_video):
    # Import lazily to avoid a hard dependency for callers that only need
    # metadata/CSV output (e.g. unit tests with a mocked evaluate()).
    from scripts.evolve.constraints import parse_phenotype_params
    from scripts.evolve.video import frames_to_mp4
    from scripts.simulations.util import build_scenario, falsifier

    # Reuse the SAME template mechanism the real GE search actually ran
    # (scripts/simulations/util.py::build_scenario + scratch.temp, including
    # the run's braking mode), not the separate scenic_template.py path used
    # by /validate, so the persisted .scenic faithfully reflects what was
    # searched over.
    frames_dir = os.path.join(out_dir, "frames")
    code, params = build_scenario(best_phenotype, frames_dir=frames_dir if record_video else None)
    with open(scenic_path, "w") as f:
        f.write(code)

    if record_video:
        # One dedicated re-run of the best individual, purely to capture
        # frames - not part of the search loop's per-individual evaluations.
        # Label it so its telemetry row is not mistaken for a search sample.
        from scripts.analysis import telemetry
        telemetry.begin_scenario("best_video", best_phenotype, parse_phenotype_params(best_phenotype),
                                 pedestrian_blueprint=params["pedestrian"],
                                 braking_mode=params["braking_mode"], seed=settings.random_seed)
        falsifier(code).falsify(num_test=1)
        frames_to_mp4(frames_dir, os.path.join(out_dir, "best_scenario.mp4"))
