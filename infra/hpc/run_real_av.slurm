#!/bin/bash
# No --account or --partition: Narval auto-selects your default RAPI and the
# right gpubase_* partition for the requested --time (sinfo shows _b1..._b5
# time-limit tiers - the scheduler picks one, you don't need to). If sbatch
# errors asking for an account (e.g. you have more than one active RAPI),
# add "#SBATCH --account=<def-or-rrg-your-sponsor>" here.
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=03:30:00
#SBATCH --job-name=real-av-carla
#SBATCH --output=%x-%j.out

module load apptainer

IMAGE="$SCRATCH/real_project/carla.sif"
RUN_ID="${SLURM_JOB_ID}"
ARTIFACTS_DIR="$SCRATCH/real_project/artifacts"
mkdir -p "$ARTIFACTS_DIR"

# The requirement is a .dsl FILE, not a bash string: reviewers can find and
# change it without editing a job script, and the run's provenance
# (requirement_source in run_meta.json) names the file. Override with
#   sbatch --export=ALL,REAL_REQUIREMENT_FILE=docs/examples/my_req.dsl,REAL_PARENT_RUN_ID=<run>,REAL_ROUND=3 run_real_av.slurm
# Paths are relative to the project root inside the container. The default is
# the requirement rounds 1-2 ran with (docs/examples/R0_rounds1_2.dsl).
# (Heredoc kept quoted so nothing inside is shell-expanded - see obstacle 10.)
cat > smoke_test.py <<'PYEOF'
import os
import requests

req_path = os.environ.get("REAL_REQUIREMENT_FILE", "docs/examples/R0_rounds1_2.dsl")
with open(req_path) as f:
    requirement = f.read()

params = {
    "requirement": requirement,
    "trials": int(os.environ.get("REAL_TRIALS", "5")),
    "record_video": True,
    "requirement_source": req_path,
}
if os.environ.get("REAL_PARENT_RUN_ID"):
    params["parent_run_id"] = os.environ["REAL_PARENT_RUN_ID"]
if os.environ.get("REAL_ROUND"):
    params["round"] = int(os.environ["REAL_ROUND"])

# Exhaustive grid (scripts/evolve/grid.py): all 32 scenarios old.bnf can
# express, 5 simulations each, with per-simulation telemetry for failure
# analysis. (The GE search is still available via /get_testcases?sample=false
# with population_size/max_generations - see job 3564897 for that shape.)
resp = requests.get(
    "http://127.0.0.1:7999/run_grid",
    params=params,
    # Per-scenario overhead (Scenic compile + YOLO reload, not just the 5
    # CARLA simulations) ran ~2-3 min/scenario in job 3564897, so 32
    # scenarios need ~1.5-2 h plus one extra recorded run for the video.
    # Match the job's --time budget (3.5 h = 12600 s, leaving ~10 min for
    # CARLA/MLflow startup and shutdown).
    timeout=12000,
)
print(resp.json())
PYEOF

# The image was built with a copy of the project at /opt/real-av/REAL (see
# carla.def %files) and pip-installed it in editable mode, i.e. by path. To
# run newer project code WITHOUT rebuilding and re-transferring the 13 GB
# image, rsync the staging copy (~/real-av-build/REAL on the Mac) to
# $SCRATCH/real_project/REAL; it is then bind-mounted over the baked-in copy.
# Only the project's own Python/templates change this way - the base image,
# CARLA, torch, the YOLO hub cache etc. are unaffected. If the directory is
# absent (e.g. a fresh clone), the image's baked-in copy is used as before.
# smoke_test.py goes wherever /opt/real-av/REAL actually comes from, so its
# mount point always exists (a file bind into another bind mount does not).
SOURCE_OVERLAY="$SCRATCH/real_project/REAL"
if [ -d "$SOURCE_OVERLAY" ]; then
    echo "Using project source overlay: $SOURCE_OVERLAY"
    cp smoke_test.py "$SOURCE_OVERLAY/smoke_test.py"
    SOURCE_BIND=(--bind "$SOURCE_OVERLAY:/opt/real-av/REAL")
else
    echo "No source overlay at $SOURCE_OVERLAY - using the image's baked-in copy"
    SOURCE_BIND=(--bind "$(pwd)/smoke_test.py:/opt/real-av/REAL/smoke_test.py")
fi

apptainer exec --nv --unsquash \
    --bind "$ARTIFACTS_DIR:/artifacts" \
    "${SOURCE_BIND[@]}" \
    "$IMAGE" bash -c '
        set -e
        # Skip yolov5 pip-based auto-update check (2 failed attempts per
        # individual on an offline compute node, each costing real wall-clock
        # time across every evaluation - a speed optimization, not required
        # for correctness).
        export YOLOv5_AUTOINSTALL=False

        redis-server --daemonize yes

        # evaluate() (scripts/simulations/util.py, the real GE loops fitness
        # function) unconditionally wraps every CARLA run in
        # mlflow.start_run() - needs a tracking server, not just the client
        # library. Local file-based backend/artifact store under /artifacts
        # so results survive after this jobs temp sandbox is cleaned up.
        cd /opt/real-av/REAL
        mlflow server --host 127.0.0.1 --port 5000 \
            --backend-store-uri /artifacts/mlflow_backend \
            --default-artifact-root /artifacts/mlflow_artifacts &
        MLFLOW_PID=$!
        sleep 10   # give the mlflow server time to bind

        # CARLA server, off-screen (no X11/display needed on the compute node).
        /home/carla/CarlaUE4.sh -RenderOffScreen -nosound -carla-port=2000 &
        CARLA_PID=$!
        sleep 20   # give the CARLA server time to come up before connecting

        # CARLA/scenario_runner ship /home/carla/CarlaUE4/... read-only (even
        # under --unsquash - the chmod warning above happens every run, not
        # just this one). Scenic caches a parsed .snet file alongside the
        # .xodr map on first load, which needs a writable location - copy the
        # map to the writable /artifacts bind mount instead.
        mkdir -p /artifacts/maps
        cp /home/carla/CarlaUE4/Content/Carla/Maps/OpenDrive/Town01.xodr /artifacts/maps/Town01.xodr
        export CARLA_MAP_PATH=/artifacts/maps/Town01.xodr

        export ARTIFACTS_DIR=/artifacts
        python3.8 api_app.py &
        API_PID=$!
        # Wait until the API actually answers instead of a fixed sleep: with
        # the source overlay on $SCRATCH (network FS, no cached .pyc) the
        # first import of api_app took well over 5 s and job 3803335 died on
        # ConnectionRefused before uvicorn was listening. Poll every 5 s, give
        # up after 10 min, and stop early if the API process itself died.
        # (No single quotes inside this bash -c block - see README obstacle 10.)
        for i in $(seq 1 120); do
            if python3.8 -c "import sys, urllib.request as u; u.urlopen(sys.argv[1], timeout=2)" http://127.0.0.1:7999/ 2>/dev/null; then
                echo "API ready after $((i*5)) s"
                break
            fi
            if ! kill -0 $API_PID 2>/dev/null; then
                echo "API process died during start-up"
                exit 1
            fi
            sleep 5
        done

        python3.8 smoke_test.py

        kill $API_PID $CARLA_PID $MLFLOW_PID
    '
