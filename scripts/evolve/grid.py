"""Exhaustive scenario run: every scenario the grammar can express, N times each.

The GE search (scripts/evolve/ge.py) is good at *finding* failures but gives a
lopsided picture - it keeps re-visiting scenarios that already fail. Failure
analysis (pipeline stage 6) needs a fair comparison instead: how often does
each scenario fail? With old.bnf's 5 two-valued parameters that is only 32
scenarios, so we simply run them all.

Outputs, under settings.artifacts_dir/runs/<run_id>/:

    run_meta.json          inputs, seed, trials per scenario, status
    scenarios.csv          one row per scenario: pass/fail counts (appended as
                           each scenario finishes, so a killed job keeps data)
    simulations.csv        one row per simulation (scripts/analysis/telemetry.py)
    traces/*.json          full per-simulation time series
    best_phenotype.txt, best_scenario.scenic, best_scenario.mp4
                           the WORST scenario (lowest pass rate), as for GE runs
"""

import csv
import itertools
import json
import os
from datetime import datetime, timezone

from real_config import settings
from scripts.analysis import telemetry
from scripts.evolve.constraints import parse_phenotype_params
from scripts.evolve.run_output import _write_best_scenario, run_dir, scene, system_under_test


def grammar_terminals(bnf_path):
    """Parse a *flat* BNF grammar like scripts/templates/old/old.bnf.

    Returns (rule_template, {category: [values...]}) where rule_template is
    the right-hand side of <rule> and every category's alternatives are plain
    terminals. Raises ValueError for anything deeper - grid mode is meant for
    small, flat scenario grammars, not the general GE case.
    """
    rule = None
    categories = {}
    with open(bnf_path) as f:
        for line in f:
            line = line.strip()
            if not line or "::=" not in line:
                continue
            lhs, rhs = line.split("::=", 1)
            name = lhs.strip().strip("<>")
            if name == "rule":
                rule = rhs.strip()
            else:
                values = [v.strip() for v in rhs.split("|")]
                if any("<" in v for v in values):
                    raise ValueError(
                        f"grid mode needs a flat grammar; <{name}> expands to non-terminals")
                categories[name] = values
    if rule is None:
        raise ValueError(f"no <rule> production in {bnf_path}")
    return rule, categories


def enumerate_phenotypes(bnf_path):
    """Yield (params, phenotype) for every combination of terminal values, in
    a fixed order (file order of categories, then listed order of values)."""
    rule, categories = grammar_terminals(bnf_path)
    names = list(categories)
    for values in itertools.product(*(categories[n] for n in names)):
        phenotype = rule
        for name, value in zip(names, values):
            phenotype = phenotype.replace(f"<{name}>", value)
        yield dict(zip(names, values)), phenotype


SCENARIO_FIELDS = ["scenario_id", "phenotype", "pedestrian", "dress", "direction",
                   "distance", "fog_density", "total", "passed", "failed", "pct", "seed"]


def _sha256(path):
    import hashlib
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _template_sha256():
    try:
        from scripts.simulations.util import SCRATCH_TEMPLATE
        return _sha256(SCRATCH_TEMPLATE)
    except Exception:
        return None


def _write_meta(out_dir, meta):
    with open(os.path.join(out_dir, "run_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)


def run_grid(run_id, requirement=None, scenario_text=None, constraints=None,
             trials=5, grammar_file="old/old.bnf", record_video=True, evaluate=None,
             braking_mode=None, yolo_model=None,
             parent_run_id=None, round_no=None, requirement_source=None):
    """Run every scenario in the grammar `trials` times and persist the results.

    `evaluate(phenotype, num_test, seed, scenario_id)` -> fitness dict; defaults
    to scripts.simulations.util.evaluate_phenotype (the real CARLA path).
    Injectable so the bookkeeping can be tested without a simulator.

    braking_mode / yolo_model: the system under test, as named in the
    requirement (api_app.py reads them from the parsed KAOS text). None keeps
    the current configuration (baseline: emergency braking + yolov5s).

    Provenance (the loop): parent_run_id = the run whose review produced this
    requirement; round_no = 1, 2, ...; requirement_source = where the text came
    from, e.g. "artifacts/runs/<parent>/R1.dsl (decisions.json of <parent>)".
    Recorded in run_meta.json so a chain of rounds is traceable from files.
    """
    if braking_mode is not None or yolo_model is not None:
        from scripts.simulations.util import configure
        configure(braking_mode=braking_mode, yolo_model=yolo_model)
    if evaluate is None:
        from scripts.simulations.util import evaluate_phenotype as evaluate

    out_dir = run_dir(run_id)
    telemetry.set_run(run_id, out_dir)
    bnf_path = os.path.join(settings.grammar_base_dir, grammar_file)
    scenarios = list(enumerate_phenotypes(bnf_path))

    meta = {
        "run_id": run_id,
        "mode": "grid",
        "requirement": requirement,
        "scenario_text": scenario_text,
        "constraints": constraints or {},
        "system_under_test": system_under_test(),
        "scene": scene(),
        "parent_run_id": parent_run_id,
        "round": round_no,
        "requirement_source": requirement_source,
        "grammar_file": grammar_file,
        # So a later comparison can prove the scenario definition was the
        # same in both rounds (scripts/analysis/compare.py).
        "grammar_sha256": _sha256(bnf_path),
        "template_sha256": _template_sha256(),
        "n_scenarios": len(scenarios),
        "trials_per_scenario": trials,
        "seed": settings.random_seed,
        "status": "running",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_meta(out_dir, meta)

    rows = []
    scenarios_csv = os.path.join(out_dir, "scenarios.csv")
    with open(scenarios_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=SCENARIO_FIELDS)
        writer.writeheader()
        for scenario_id, (params, phenotype) in enumerate(scenarios):
            seed = settings.random_seed + scenario_id
            print(f"[grid] scenario {scenario_id + 1}/{len(scenarios)}: {phenotype}")
            fitness = evaluate(phenotype, num_test=trials, seed=seed, scenario_id=scenario_id)
            row = {"scenario_id": scenario_id, "phenotype": phenotype, "seed": seed}
            row.update({k: params.get(k) for k in
                        ("pedestrian", "dress", "direction", "distance", "fog_density")})
            row.update({k: fitness.get(k) for k in ("total", "passed", "failed", "pct")})
            rows.append(row)
            writer.writerow(row)
            f.flush()

    # "Best" in the GE sense = most falsifying = lowest pass rate.
    worst = min(rows, key=lambda r: (r["pct"], r["scenario_id"]))
    with open(os.path.join(out_dir, "best_phenotype.txt"), "w") as f:
        f.write(worst["phenotype"])
    _write_best_scenario(out_dir, os.path.join(out_dir, "best_scenario.scenic"),
                         worst["phenotype"], record_video)

    meta.update(status="complete", worst_phenotype=worst["phenotype"],
                worst_pct=worst["pct"],
                finished_at=datetime.now(timezone.utc).isoformat())
    _write_meta(out_dir, meta)

    return {"run_id": run_id, "scenarios": rows, "worst_phenotype": worst["phenotype"]}
