import re
import math
import os.path
import sys
import random, scenic

import numpy as np
from dotmap import DotMap

from verifai.samplers import ScenicSampler
from verifai.scenic_server import ScenicServer
from verifai.falsifier import generic_falsifier, generic_parallel_falsifier
from verifai.monitor import specification_monitor, mtl_specification

import os
import mlflow
from tqdm import tqdm

from real_config import settings
from scripts.analysis import telemetry
from scripts.evolve.constraints import PHENOTYPE_PARAM_RE, parse_phenotype_params
from scripts.templates.old.scenic_template import get_pedestrian

os.environ.setdefault("MLFLOW_TRACKING_URI", settings.mlflow_tracking_uri)
# # Set our tracking server uri for logging
mlflow.set_tracking_uri(uri=os.environ["MLFLOW_TRACKING_URI"])

# Safety requirement checked by MyMonitor: the ego must stay more than this
# many metres (centre to centre) from the pedestrian for the whole simulation.
SAFETY_MARGIN_M = 5

# Scene v2 (roadmap M2, Notes 8.19): what the grid's `direction` and
# `distance` settings mean in scratch.temp. Driver's view: LR = starts at the
# left kerb (side -1) and walks to the right (heading -90 deg); RL the mirror.
# Rounds 1-2 used scenic_template.get_pedestrian_angle, where RL (180 deg)
# walked along the road towards the car and `distance` had no effect.
SCENE_VERSION = 2
DIRECTIONS = {"LR": {"pedestrian_side": -1, "pedestrian_angle": -90},
              "RL": {"pedestrian_side": 1, "pedestrian_angle": 90}}
APPROACH_DISTANCE_M = {"Short": 20, "Long": 35}
# The pedestrian steps out once the car is this close. Large = at once:
# CrossingBehavior then paces the walk to meet the car (no built-in standoff).
DEFAULT_CROSSING_TRIGGER_M = 100
DEFAULT_PEDESTRIAN_MIN_SPEED_MPS = 2.0
# Settings a scenario may give as numbers (scripts/templates/v2/scene_v2.bnf,
# the GE grammar); old.bnf scenarios give `distance` and use the defaults.
NUMERIC_SETTINGS = ("approach_distance_m", "crossing_trigger_m", "pedestrian_min_speed_mps")
# Steps per simulation (0.1 s each). 250 = 25 s, enough to see whether a car
# that stopped moves on again within the 10 s soft goal (was 100 = 10 s).
MAX_STEPS = 250


def scene_settings(direction, distance=None, crossing_trigger_m=None,
                   approach_distance_m=None, pedestrian_min_speed_mps=None):
    """The scene-v2 template values for one scenario. Numeric settings (GE
    grammar) win; otherwise `distance` Short/Long (old.bnf) and the defaults."""
    if direction not in DIRECTIONS:
        raise ValueError(f"unknown direction {direction!r} (expected {sorted(DIRECTIONS)})")
    if approach_distance_m is None:
        if distance not in APPROACH_DISTANCE_M:
            raise ValueError(f"unknown distance {distance!r} (expected {sorted(APPROACH_DISTANCE_M)})")
        approach_distance_m = APPROACH_DISTANCE_M[distance]
    return dict(DIRECTIONS[direction],
                approach_distance_m=float(approach_distance_m),
                crossing_trigger_m=float(DEFAULT_CROSSING_TRIGGER_M if crossing_trigger_m is None
                                         else crossing_trigger_m),
                pedestrian_min_speed_mps=float(DEFAULT_PEDESTRIAN_MIN_SPEED_MPS
                                               if pedestrian_min_speed_mps is None
                                               else pedestrian_min_speed_mps))

# ---------------------------------------------------------------------------
# What the requirement says the system IS. The KAOS requirement names the
# modules that perform each task ("Detect Pedestrian" performed by "yolov5s",
# "Apply Brakes" performed by "proportional_braking"). Until 2026-09-23 the
# executor ignored both and always ran the baseline car; run 35acc09e was
# therefore emergency braking + yolov5s whatever the requirement text said.
# api_app.py / grid.py / ge.py now read them from the parsed requirement and
# call configure() so build_scenario() and the perception model follow suit.
# ---------------------------------------------------------------------------

DEFAULT_BRAKING_MODE = "emergency_braking"
DEFAULT_YOLO_MODEL = "yolov5s"

RUN_CONTEXT = {"braking_mode": DEFAULT_BRAKING_MODE, "yolo_model": DEFAULT_YOLO_MODEL}

# Scenic behaviour text spliced into scratch.temp at <ego_behavior>. Both use
# perceive() / brake_now() defined in the template. Same EGO_SPEED for both so
# the modes are comparable (scenic_template.py's proportional variant used a
# different target speed, 10 vs 8, which confounds the comparison).
BRAKING_BEHAVIOURS = {
    # Baseline (paper MLSv1): full brake, but only while the detector is
    # currently above the 85% bar. Releases as soon as detection drops.
    "emergency_braking": """\
behavior Exp_EgoBehaviour():
    try:
        do FollowLaneBehavior(target_speed = EGO_SPEED)
    interrupt when perceive(ego.observations["front_rgb"]) > DETECTION_CONFIDENCE:
        brake_now(BRAKE_INTENSITY)
        take YoloEmergencyBraking()
""",
    # Paper M4 (system-level mitigation): brake in proportion to confidence
    # from 30%, full brake above 85% - adjust_based_on_confidence() is the
    # vendored driving model's mapping (0.30..0.85 -> 0..0.75, >=0.85 -> 1.0).
    "proportional_braking": """\
behavior Exp_EgoBehaviour():
    try:
        do FollowLaneBehavior(target_speed = EGO_SPEED)
    interrupt when perceive(ego.observations["front_rgb"]) > CAUTION_CONFIDENCE:
        brake = adjust_based_on_confidence(perceive(ego.observations["front_rgb"]))
        brake_now(brake)
        take SetThrottleAction(0.0), SetBrakeAction(brake)
""",
}


def braking_mode_from_module(module):
    """Map the braking module named in the requirement to a BRAKING_BEHAVIOURS
    key. None/unknown -> the baseline, so old requirements behave as before."""
    if not module:
        return DEFAULT_BRAKING_MODE
    name = str(module).strip().lower()
    if "proportional" in name or "caution" in name:
        return "proportional_braking"
    if "emergency" in name or "yolo" in name or name in ("braking", "brake", "braking module"):
        return "emergency_braking"
    print(f"WARNING: unknown braking module {module!r} in requirement - using {DEFAULT_BRAKING_MODE}")
    return DEFAULT_BRAKING_MODE


def resolve_yolo_model(name):
    """Perception model named in the requirement -> a weights file that exists
    under settings.model_dir (yolov5s, yolov5m, fine_tune, few_shot). Unknown
    or missing -> yolov5s with a warning, never a crash mid-run."""
    if not name:
        return DEFAULT_YOLO_MODEL
    candidate = str(name).strip()
    path = os.path.join(settings.model_dir, f"{candidate}.pt")
    if os.path.exists(path):
        return candidate
    print(f"WARNING: perception model {candidate!r} not found at {path} - using {DEFAULT_YOLO_MODEL}")
    return DEFAULT_YOLO_MODEL


def configure(braking_mode=None, yolo_model=None):
    """Set the system-under-test for this run. Called once per API request /
    GE run / grid run with values read from the requirement. Returns the
    effective context (also recorded in run_meta.json and every telemetry row)."""
    if braking_mode is not None:
        if braking_mode not in BRAKING_BEHAVIOURS:
            braking_mode = braking_mode_from_module(braking_mode)
        RUN_CONTEXT["braking_mode"] = braking_mode
    if yolo_model is not None:
        RUN_CONTEXT["yolo_model"] = resolve_yolo_model(yolo_model)
    return dict(RUN_CONTEXT)


def _redis():
    import redis
    return redis.StrictRedis(host=settings.redis_host, port=settings.redis_port,
                             decode_responses=True, socket_connect_timeout=1)


def _publish_yolo_model(name):
    # The vendored driving model (Scenic/src/scenic/domains/driving/model.scenic)
    # loads its detector at scenario-compile time from the Redis key 'model'
    # (default yolov5s) - the same key the Streamlit UI sets. Setting it right
    # before compiling the scenario is how the requirement's choice reaches
    # the perception component without touching vendored code.
    try:
        _redis().set("model", name)
    except Exception as e:
        print(f"WARNING: could not publish perception model to Redis ({e}); "
              f"the simulation will use whatever Redis/default says")


def get_scenic_script(param_dict, template):

    with open(template, 'r') as f:
        temp = f.read()

    # matches = re.findall(r'<(.*?)>', temp)

    for key,value in param_dict.items():
        temp = re.sub(f'<{key}>', lambda _m, v=value: v, temp)

    return temp


def _pedestrian_indices(objects):
    """Indices of the Pedestrian objects in a Scenic simulation's object list.

    Matched by class name rather than isinstance so this module never has to
    import the Scenic/CARLA model (which connects to Redis and loads YOLO at
    import time).
    """
    return [i for i, obj in enumerate(objects)
            if any(cls.__name__ == "Pedestrian" for cls in type(obj).__mro__)]


class MyMonitor(specification_monitor):
    def __init__(self):
        self.specification = mtl_specification(['G safe'])
        super().__init__(self.specification)

    def evaluate(self, simulation):

        if not simulation:
            return None

        result = simulation.result
        ped_idx = _pedestrian_indices(getattr(simulation, "objects", ()))
        if not ped_idx:
            print("WARNING: no Pedestrian object in simulation - "
                  "measuring distance to all other objects instead")

        # safe = "distance from ego to the PEDESTRIAN > SAFETY_MARGIN_M".
        # Scenic always puts the ego at positions[0]. Only the pedestrian
        # counts: the scenario also places a VendingMachine ~3.5 m from the
        # lane centre, so the previous "all other objects" check flagged a
        # violation on every drive-by regardless of what the pedestrian did.
        distances = []
        for positions in result.trajectory:
            ego = positions[0]
            others = ([positions[i] for i in ped_idx if i < len(positions)]
                      if ped_idx else positions[1:])
            distances.append(min((ego.distanceTo(o) for o in others), default=math.inf))
        safe_values = [d - SAFETY_MARGIN_M for d in distances]
        rho = self.specification.evaluate({'safe': list(enumerate(safe_values))})

        # Hand the per-step facts to the failure-analysis log. "ego_speed" is
        # the `record ego.speed as "ego_speed"` time series from scratch.temp
        # (a list of (time, value) pairs); older templates without it just
        # yield no speeds.
        speed_series = result.records.get("ego_speed", [])
        speeds = [v for _, v in speed_series] if isinstance(speed_series, list) else []
        ped_series = result.records.get("pedestrian_speed", [])
        pedestrian_speeds = [v for _, v in ped_series] if isinstance(ped_series, list) else []
        road_series = result.records.get("on_road", [])
        on_road = [bool(v) for _, v in road_series] if isinstance(road_series, list) else []
        telemetry.end_simulation(rho=rho, distances=distances, speeds=speeds,
                                 pedestrian_speeds=pedestrian_speeds, on_road=on_road,
                                 timestep=getattr(simulation, "timestep", None),
                                 termination=result.terminationReason)
        return rho


class falsifier:

    def __init__(self, code):
        params = {'render' : False}
        sampler = ScenicSampler.fromScenicCode(code, mode2D=True, params=params)

        # Set up the falsifier
        self.falsifier_params = DotMap(
                                        n_iters=5,
                                        verbosity=0,
                                        save_error_table=True,
                                        save_safe_table=True,
                                        # uncomment to save these tables to files; we'll print them out below
                                        # error_table_path='error_table.csv',
                                        # safe_table_path='safe_table.csv'
                                    )
        self.server_options = DotMap(maxSteps=MAX_STEPS, verbosity=0, render=False)
        # self.server_options = dict(maxSteps=100, verbosity=0, num_workers=5)

        self.falsifier = generic_falsifier(sampler=sampler,
                                            monitor=MyMonitor(),
                                            falsifier_params=self.falsifier_params,
                                            server_class=ScenicServer,
                                            server_options=self.server_options)

    def falsify(self, num_test=10, max_attempts=None):
        """Run num_test simulations and count how many satisfied the safety
        requirement (rho > 0).

        rho is None when Scenic could not even create the simulation; those
        attempts are retried, but only up to max_attempts (default 3*num_test)
        so one broken scenario cannot hang an unattended job. rho == 0 is a
        (boundary) failure, not a skip - the old `if rho:` dropped it.
        """
        max_attempts = max_attempts or 3 * num_test

        t = 0
        p = 0
        n = 0
        attempts = 0
        with tqdm(total=num_test) as pbar:
            while t < num_test and attempts < max_attempts:
                attempts += 1
                telemetry.begin_simulation()
                sample, rho, timings = self.falsifier.server.run_server()
                if rho is None:
                    continue
                t += 1
                pbar.update(1)
                if rho > 0:
                    p += 1
                else:
                    n += 1

        if t == 0:
            print(f"WARNING: no simulation could be created in {attempts} attempts")

        fitness = {'total' : t,
                   'passed' : p,
                   'failed' : n,
                   # A scenario that never ran counts as fully passed (100) so
                   # the GE search is not rewarded for scenarios that don't run.
                   'pct' : p*100/t if t else 100.0}

        return fitness


SCRATCH_TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scenarios', 'scratch.temp')


def build_scenario(phenotype, frames_dir=None, braking_mode=None):
    """Turn a phenotype string into (scenic_code, template_params) via
    scratch.temp - the one template the search actually evaluates.

    frames_dir:   if given, the scenario records camera frames there (used for
                  the best-of-run video); otherwise no per-simulation recording.
    braking_mode: a BRAKING_BEHAVIOURS key; defaults to the run's configure()d
                  mode (RUN_CONTEXT), i.e. what the requirement asked for.
    """
    params = parse_phenotype_params(phenotype)
    # scratch.temp needs a real CARLA walker blueprint and the scene-v2
    # geometry, not the raw phenotype categories (pedestrian/dress ->
    # blueprint, overwriting the raw 'pedestrian' value; direction/distance ->
    # side, heading, start distance - see scene_settings).
    params.update(scene_settings(params['direction'], params.get('distance'),
                                 **{k: params[k] for k in NUMERIC_SETTINGS if k in params}))
    params['pedestrian'] = get_pedestrian(params['pedestrian'], params['dress'])
    params['carla_map_path'] = settings.carla_map_path
    params['carla_map_name'] = settings.carla_map_name
    mode = braking_mode or RUN_CONTEXT["braking_mode"]
    params['ego_behavior'] = BRAKING_BEHAVIOURS[mode]
    params['braking_mode'] = mode
    if frames_dir:
        params['recording_statement'] = (
            f'require monitor RecordingMonitor(ego, path=localPath(f"{frames_dir}"), '
            f"recording_start=5, subsample=2)"
        )
    else:
        # No per-individual recording during bulk search - would otherwise
        # attempt to record every one of POPULATION_SIZE x MAX_GENERATIONS runs.
        params['recording_statement'] = ''
    template_params = {k: str(v) for k, v in params.items() if k != 'braking_mode'}
    return get_scenic_script(template_params, SCRATCH_TEMPLATE), params


def evaluate_phenotype(phenotype, num_test=5, seed=None, scenario_id=None, log_mlflow=True):
    """Evaluate one scenario description end to end: build the Scenic program,
    run it num_test times in CARLA, return {'total','passed','failed','pct'}.

    Shared by the GE fitness function (evaluate) and the exhaustive grid
    (scripts/evolve/grid.py). Every simulation's details land in
    simulations.csv via scripts/analysis/telemetry. The braking behaviour and
    perception model come from RUN_CONTEXT (see configure()).
    """
    seed = settings.random_seed if seed is None else seed
    # Scenic samples the scene (lane, pedestrian offset) with Python's random,
    # so seeding per scenario makes our side repeatable. CARLA's own physics
    # and rendering are not fully deterministic: repeats are similar, not
    # identical.
    random.seed(seed)
    np.random.seed(seed % (2**32))

    raw_params = parse_phenotype_params(phenotype)
    code, params = build_scenario(phenotype)
    # The phenotype with each {key : value} replaced by just the value.
    rule = PHENOTYPE_PARAM_RE.sub(lambda m: m.group(2), phenotype)

    yolo_model = RUN_CONTEXT["yolo_model"]
    _publish_yolo_model(yolo_model)

    telemetry.begin_scenario(scenario_id if scenario_id is not None else phenotype,
                             phenotype, raw_params,
                             pedestrian_blueprint=params['pedestrian'],
                             scene={k: params[k] for k in NUMERIC_SETTINGS},
                             braking_mode=params['braking_mode'],
                             yolo_model=yolo_model, seed=seed)

    if not log_mlflow:
        return falsifier(code).falsify(num_test=num_test)

    with mlflow.start_run():

        mlflow.set_experiment("simple grammar scenarios")
        mlflow.set_tag("Trial", "First run of GE pipeline")

        f = falsifier(code)
        fitness = f.falsify(num_test=num_test)

        mlflow.log_params({'goal': rule, 'code': code})
        mlflow.log_params({k: v for k, v in params.items() if k != 'ego_behavior'})
        mlflow.log_metric("Total Test Cases", fitness['total'])
        mlflow.log_metric("Passed Test Cases", fitness['passed'])
        mlflow.log_metric("Failed Test Cases", fitness['failed'])
        mlflow.log_metric("Percentage of testcase passed", fitness['pct'])

    return fitness


# GE fitness settings for the current run (set by scripts/evolve/ge.py::start_ge).
GE_SETTINGS = {"trials": 5}
# phenotype -> fitness for the current GE run: a scenario GE has already
# simulated is not simulated again (GE re-visits scenarios across
# generations; with 2-5 CARLA runs each that would waste most of the budget).
_GE_CACHE = {}


def configure_ge(trials=None):
    """Start a GE run: set trials per individual and forget earlier results."""
    if trials is not None:
        GE_SETTINGS["trials"] = int(trials)
    _GE_CACHE.clear()
    return dict(GE_SETTINGS)


def scenario_label(phenotype):
    """Short, file-name-safe label for a GE scenario (phenotypes can contain
    '/', e.g. "m/s" in scene_v2.bnf, and are too long for trace file names).
    The full text stays in simulations.csv's `phenotype` column."""
    import hashlib
    return "g" + hashlib.sha1(phenotype.encode("utf-8")).hexdigest()[:10]


def evaluate(ind, dummy):
    # Live call site: scripts.evolve.ge::start_ge(sample=False), the full DEAP/GRAPE
    # evolutionary loop (toolbox.evaluate). Safety margin here is
    # SAFETY_MARGIN_M (see MyMonitor.evaluate above). scripts/evolve/util.py's
    # evaluate() is a separate, differently-parameterised (dist - 2)
    # implementation used by api_app.py's /validate route via its own
    # `falsifier` directly - do not conflate results from the two in MLflow
    # without checking which evaluate() produced them.
    phenotype = ind.phenotype
    if phenotype in _GE_CACHE:
        return (_GE_CACHE[phenotype],)
    fitness = evaluate_phenotype(phenotype, num_test=GE_SETTINGS["trials"],
                                 scenario_id=scenario_label(phenotype))
    _GE_CACHE[phenotype] = fitness['pct']

    # DEAP expects a tuple of numbers matching FitnessMin's weights=(-1.0,)
    # (single-objective minimization), not the whole fitness dict - minimizing
    # pct (percentage of tests passed) is exactly the falsification objective:
    # search for parameter combinations that make the safety property fail.
    return (_GE_CACHE[phenotype],)
