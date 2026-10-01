from typing import Union
import re
import traceback
from fastapi import FastAPI
from scripts.redsl.grammar import DSL
from scripts.evolve.ge import start_ge
import uvicorn

from scripts.evolve.util import falsifier
from scripts.evolve.constraints import extract_constraints
from scripts.evolve.grid import run_grid
from scripts.evolve.run_output import new_run_id
from scripts.simulations.util import braking_mode_from_module
from scripts.templates.old.scenic_template import get_scenic_code
import redis, re

import multiprocessing as mp

from real_config import settings

env = redis.StrictRedis(host=settings.redis_host, port=settings.redis_port, decode_responses=True)
app = FastAPI()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/verify_requirement")
def verify_requirement(requirement: str = None):

    dsl = DSL(requirement)
    if dsl.parse_tree is None:
        return {"error": f"requirement does not parse: {dsl.parse_error}",
                "hint": "see docs/examples/requirement_full_example.dsl for every clause",
                "STATUS": "NOT OK"}

    try:
        return {"parsed_grammar" : dsl.parse_tree.pretty(),
                "system_under_test": system_under_test_from(dsl),
                "assumptions": dsl.get_assumptions(),
                "soft_goals": dsl.get_soft_goals(),
                "STATUS":"OK"}
    except Exception as e:
        traceback.print_exc()
        return {"error" : str(e), "STATUS" : "NOT OK"}


def system_under_test_from(dsl):
    """What the requirement says the system IS: the module performing
    "Apply Brakes" -> braking mode, the module performing "Detect Pedestrian"
    -> perception model. Passed to the executor so the simulation runs the
    system the requirement describes (before 2026-09-23 both were ignored).
    """
    braking_module = dsl.get_module_for("Apply Brakes") or dsl.get_module_for("Brake")
    return {"braking_module": braking_module,
            "braking_mode": braking_mode_from_module(braking_module),
            "perception_module": dsl.get_perception_model()}
    
@app.get("/get_testcases")
async def get_testcases(requirement: str = None, sample: bool = True,
                         population_size: int = None, max_generations: int = None):
    # async, not sync def: FastAPI dispatches plain `def` routes to a worker
    # thread (so slow sync code doesn't block the event loop), but Scenic's
    # per-step simulation timeout uses signal.alarm(), which only works on
    # the main thread. `async def` keeps this on the main thread instead.
    # (No `await` inside - the actual GE/CARLA work below is synchronous;
    # this blocks the event loop for its duration, which is fine here since
    # nothing else needs to be served concurrently.)

    dsl = DSL(requirement)
    if dsl.parse_tree is None:
        return {"error": f"requirement does not parse: {dsl.parse_error}", "STATUS": "NOT OK"}
    scenario = dsl.get_scenario()

    if sample:
        testcases = start_ge(sample=True)
        try:
            return {"testcases" : testcases, "STATUS" : "OK"}
        except Exception as e:
            return {"error" : str(e), "STATUS" : "NOT OK"}

    constraints = extract_constraints(scenario)
    sut = system_under_test_from(dsl)
    run_id = new_run_id()
    try:
        result = start_ge(sample=False, constraints=constraints, run_id=run_id,
                           requirement=requirement, scenario_text=scenario,
                           population_size=population_size, max_generations=max_generations,
                           braking_mode=sut["braking_mode"], yolo_model=sut["perception_module"])
        return {"run_id": run_id, "best_phenotype": result["best_phenotype"],
                "system_under_test": sut, "STATUS": "OK"}
    except Exception as e:
        traceback.print_exc()
        return {"error" : str(e), "STATUS" : "NOT OK"}


@app.get("/run_grid")
async def run_grid_endpoint(requirement: str = None, trials: int = 5,
                            record_video: bool = True,
                            parent_run_id: str = None, round: int = None,
                            requirement_source: str = None):
    # Runs EVERY scenario the grammar can express `trials` times each (32 x 5
    # for old.bnf) and writes per-simulation telemetry for failure analysis.
    # async def for the same signal.alarm()/main-thread reason as
    # /get_testcases above. The requirement is parsed and kept in
    # run_meta.json (and its keyword constraints recorded) but does not
    # narrow the grid - the point is a fair comparison across all scenarios.
    scenario = None
    sut = {"braking_mode": None, "perception_module": None}
    if requirement:
        dsl = DSL(requirement)
        if dsl.parse_tree is None:
            return {"error": f"requirement does not parse: {dsl.parse_error}", "STATUS": "NOT OK"}
        scenario = dsl.get_scenario()
        sut = system_under_test_from(dsl)
    constraints = extract_constraints(scenario)
    run_id = new_run_id()
    try:
        result = run_grid(run_id, requirement=requirement, scenario_text=scenario,
                          constraints=constraints, trials=trials, record_video=record_video,
                          braking_mode=sut["braking_mode"], yolo_model=sut["perception_module"],
                          parent_run_id=parent_run_id, round_no=round,
                          requirement_source=requirement_source)
        return {"run_id": run_id, "n_scenarios": len(result["scenarios"]),
                "worst_phenotype": result["worst_phenotype"],
                "system_under_test": sut, "STATUS": "OK"}
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "STATUS": "NOT OK"}


def _validate(q, testcase, braking):

        def replace_with_value(match):
                return match.group(2)

        text = testcase
        print(text)
        matches = re.findall(r'({.*?})', text)
        matches = [item.strip('{}').strip(' ').split(':') for item in matches]
        param_dict = {key.strip(' '): value.strip(' ') for key, value in matches}
        param_dict['braking'] = braking

        # Substitute each {key : value} with just the value
        rule = re.sub(r'\{\s*(\w+)\s*:\s*([\w\.\d]+)\s*\}', replace_with_value, text)

        print(rule)

        code = get_scenic_code(params=param_dict)

        # print(param_dict)

        f = falsifier(code, settings.carla_port)
        fitness = f.falsify(num_test=10)

        q.put(fitness)
    
@app.get("/validate")
def validate(testcase: str = None):

    retries = 0
    while retries < 10:

        q = mp.Queue()
        process = mp.Process(target=_validate, args=(q,testcase, env.get('braking'),))
        process.start()
        process.join(timeout=100)  # Wait for the process to finish

        if process.is_alive():
            print("CARLA task exceeded time limit. Terminating...")
            process.terminate()
            process.join()
            validate(testcase=testcase)
            retries += 1
        else:
            if not q.empty():
                response = q.get()
                response['STATUS'] = 'OK'
                return   response
            else:
                break
    return {'STATUS':'NOT EXECUTED'}
    
if __name__ == "__main__":
    uvicorn.run(app, host=settings.api_host, port=settings.api_port)