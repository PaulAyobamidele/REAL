"""Laptop check before a job is submitted (Run Test): what the cluster would
refuse after hours in the queue is refused here in seconds.

1. The requirement parses and its modules are ones the executor implements,
   resolved exactly as the API does (util.braking_mode_from_module for the
   module performing "Apply Brakes" / "Brake", util.resolve_yolo_model for the
   perception model).
2. Scenic builds the scenes the job will run: every listed scenario (list
   mode), every grid scenario (grid runs use old/old.bnf, 32 scenarios), or for
   a GE grammar a covering set in which every value of every parameter appears
   at least once. Built against the Town01 map in the repo with the stand-ins
   of tests/test_scene_compile.py (no CARLA, GPU or YOLO): placement is
   checked here; what happens once the car moves needs the cluster.

Runs as its own process, because the stand-ins replace modules:
    python -m scripts.redsl.preflight --search grid|ge|list [--grammar G] [--scenarios FILE] < requirement.dsl
The last stdout line is "PREFLIGHT <json>".
"""

import argparse
import json
import os
import random
import sys
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TOWN01 = os.path.join(ROOT, "Scenic", "assets", "maps", "CARLA", "Town01.xodr")
GRID_GRAMMAR = "old/old.bnf"          # the grammar scripts/evolve/grid.py run_grid uses
MAX_ALL = 40                          # build every scenario up to this many, else a covering set


def _stand_ins():
    sys.modules.setdefault("carla", mock.MagicMock())
    import redis
    import torch
    redis.StrictRedis = redis.Redis = mock.MagicMock()
    torch.hub.load = mock.MagicMock()
    from real_config import settings
    settings.carla_map_path = TOWN01


def covering(rule, categories):
    """Scenarios in which every value of every category appears at least once."""
    width = max(len(v) for v in categories.values())
    out = []
    for i in range(width):
        phenotype = rule
        for name, values in categories.items():
            phenotype = phenotype.replace(f"<{name}>", values[i % len(values)])
        out.append(phenotype)
    return out


def scenarios_for(search, grammar=None, scenario_file=None):
    """(phenotypes to build, how they were chosen)."""
    from real_config import settings
    from scripts.evolve import grid
    if search == "list":
        with open(scenario_file) as f:
            listed = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        if not listed:
            raise ValueError(f"{scenario_file} lists no scenarios")
        return listed, "every listed scenario"
    path = os.path.join(settings.grammar_base_dir, GRID_GRAMMAR if search == "grid" else grammar)
    rule, categories = grid.grammar_terminals(path)
    total = 1
    for values in categories.values():
        total *= len(values)
    if total <= MAX_ALL:
        return [p for _, p in grid.enumerate_phenotypes(path)], f"all {total} scenarios"
    return covering(rule, categories), f"every parameter value at least once (of {total} scenarios)"


def check(text, search="grid", grammar="v2/scene_v2.bnf", scenario_file=None):
    from scripts.redsl.grammar import DSL
    dsl = DSL(text)
    if dsl.parse_tree is None:
        return {"ok": False, "kind": "parse", "message": f"the requirement does not parse: {dsl.parse_error}"}
    _stand_ins()
    from scripts.simulations import util
    try:
        sut = {"braking_mode": util.braking_mode_from_module(
                   dsl.get_module_for("Apply Brakes") or dsl.get_module_for("Brake")),
               "yolo_model": util.resolve_yolo_model(dsl.get_perception_model())}
    except ValueError as e:
        return {"ok": False, "kind": "module", "message": str(e)}
    try:
        phenotypes, how = scenarios_for(search, grammar, scenario_file)
    except (OSError, ValueError) as e:
        return {"ok": False, "kind": "scenarios", "message": str(e)}
    import scenic
    failures = []
    for phenotype in phenotypes:
        try:
            random.seed(7)
            code, _ = util.build_scenario(phenotype, braking_mode=sut["braking_mode"])
            scenic.scenarioFromString(code, mode2D=True).generate(maxIterations=3000)
        except Exception as e:      # Scenic raises many types; its message is what the reviewer needs
            failures.append({"scenario": phenotype, "error": f"{type(e).__name__}: {e}"[:600]})
    return {"ok": not failures, "kind": "scene" if failures else None, "system_under_test": sut,
            "checked": len(phenotypes), "how": how, "failures": failures,
            "message": (f"{len(failures)} of {len(phenotypes)} scenes did not build in Scenic; "
                        f"the first: {failures[0]['error']}") if failures else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--search", choices=("grid", "ge", "list"), default="grid")
    parser.add_argument("--grammar", default="v2/scene_v2.bnf")
    parser.add_argument("--scenarios")
    a = parser.parse_args()
    print("PREFLIGHT " + json.dumps(check(sys.stdin.read(), a.search, a.grammar, a.scenarios)))


if __name__ == "__main__":
    main()
