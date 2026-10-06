# Running REAL's real (CARLA-driven) GE loop on Narval

## Local build setup (macOS, Apple Silicon)

Apptainer doesn't run natively on macOS, and Narval/CARLA need **amd64**, not the Mac's **arm64** - both problems are solved with one Lima VM plus QEMU user-mode emulation:

```bash
brew install lima
limactl start template://apptainer-rootful --name=apptainer --tty=false
limactl shell apptainer -- sudo apt-get update -qq
limactl shell apptainer -- sudo apt-get install -y qemu-user qemu-user-binfmt binfmt-support
```

(Sylabs Cloud's remote builder was tried first to avoid emulation entirely, but this Apptainer version - 1.5.3 - has removed the `--remote` build flag from the CLI; only their web UI remains, which isn't scriptable. QEMU emulation is slower but fully local and reliable once the fixes below are applied.)

Run every command below via `limactl shell apptainer -- <command>` (Lima mounts your home directory into the VM at the same path, so local file paths resolve identically on both sides).

## 1. Fill in the placeholders

- `run_real_av.slurm` needs no `--account`/`--partition` by default — Narval auto-selects your default RAPI and the right `gpubase_*` partition based on `--time`. Only add `#SBATCH --account=<def-or-rrg-your-sponsor>` if `sbatch` complains (e.g. you have more than one active RAPI).
- `carla.def`'s `%files` source path (`/Users/ayobamidele/real-av-build/REAL`) — update if you build the staging copy somewhere else.

## 2. Build a clean staging copy, then the image

`carla.def` copies a staging copy of this checkout into the image rather than `git clone`-ing a pushed branch, so you can iterate without a commit+push cycle for every change (switch to `git clone` of a tagged release once you're cutting a reproducible, citable build for the Zenodo artifact). Rebuild the staging copy after any local code change:

```bash
mkdir -p ~/real-av-build && rm -rf ~/real-av-build/REAL
rsync -a \
  --exclude='.git' --exclude='sim_env' --exclude='mlruns' \
  --exclude='__pycache__' --exclude='.pytest_cache' --exclude='.ruff_cache' --exclude='.mypy_cache' \
  --exclude='infra/minio_data' --exclude='infra/db_data' --exclude='infra/postgres_data' --exclude='infra/redis_data' \
  --exclude='infra/credentials.json' --exclude='infra/config.env' \
  --exclude='scripts/scenarios/model' --exclude='scripts/simulations/model' \
  --exclude='scripts/mlops/*.pt' --exclude='scripts/mlops/*.onnx' --exclude='scripts/mlops/*.zip' \
  --exclude='scripts/mlops/*.ipynb' --exclude='scripts/mlops/mlruns' --exclude='scripts/mlops/yolo_models/.metrics' \
  ~/Documents/PhD/REAL/REAL/ ~/real-av-build/REAL/
```

Note `model/` (the root-level YOLO weights directory, ~14MB for `yolov5s.pt`) is **not** excluded — `carla.def` needs it at build time to pre-warm the perception model's cache (see fix 5 below). `scripts/scenarios/model` and `scripts/simulations/model` are separate, unused-by-this-path copies and stay excluded.

Build inside the Lima VM, with the build temp dir redirected to real disk (see "Build fixes" below for why):

```bash
limactl shell apptainer -- sudo APPTAINER_TMPDIR=/var/tmp/apptainer-build \
  apptainer build /home/ayobamidele.linux/carla.sif infra/hpc/carla.def
```

### Build fixes baked into `carla.def` (found the hard way — keep these if you edit the file)

1. **`/tmp` is a tiny 2GB tmpfs** inside the Lima VM, separate from the 96GB real disk at `/`. Apptainer's own build staging is redirected via `APPTAINER_TMPDIR=/var/tmp/apptainer-build` (passed on the command line above); `%post` additionally sets `export TMPDIR=/var/tmp/pip-build-tmp` itself, because pip's own download/build temp files ignore `APPTAINER_TMPDIR` and still default to `/tmp` otherwise — without this, `pip install torch` fails with "No space left on device" despite 80GB+ being free.
2. **The base `carlasim/carla:0.9.13` image's NVIDIA CUDA apt repo is no longer signed** (expired upstream signing key), which fails `apt-get update` entirely and, via `&&`, silently skips the whole `apt-get install` step. `%post` removes that repo's `.list` file before updating.
3. **`mlserver` cannot be declared in `pyproject.toml`'s dependencies at all**: every release through `1.4.0.dev2` declares `fastapi<=0.89.1`, which conflicts with this project's `fastapi>=0.109`. The two packages work fine together in practice (that's what the original `setup_env.sh` environment runs, since it installs them as separate `pip install` calls that never cross-check each other's constraints) — so `mlserver` is installed as a separate `pip install --no-deps mlserver==1.4.0.dev2` step after the main install, and left out of `pyproject.toml` entirely (with a comment explaining why).
4. **`carlasim/carla:0.9.13` is amd64-only**; on this arm64 Mac, `%post` only runs at all because of the QEMU emulation set up above. Expect `%post` to take noticeably longer than on native amd64 hardware, and expect the *local* verification below to be limited (see next section).
5. **The YOLO perception model (`Scenic/src/scenic/domains/driving/model.scenic::load_model_once`) needs `torch.hub`'s `ultralytics/yolov5` repo definition cached, and Narval's compute nodes have no internet access.** Originally this code called `torch.hub.load(..., force_reload=True)`, which *always* re-fetches from GitHub regardless of any existing cache — that can never work on an offline compute node. Fixed in three parts: `%post` pre-warms the cache at build time using `torch.hub._get_cache_or_reload(...)` directly (the Lima VM has internet) rather than the full `torch.hub.load(...)` - the latter also *constructs* the model, which involves real tensor ops that reliably segfault under this Mac's QEMU emulation (same class of issue as the `pyarrow` crash in "Verifying the build" below), so only the pure fetch-and-extract step runs at build time, and the actual model construction happens for the first time at runtime on Narval's real (non-emulated) hardware; `%environment` sets `TORCH_HOME=/opt/torch_cache` so that cache is found at runtime; and the vendored Scenic code was patched to use `force_reload=False` (reuse the cache) plus a config-driven model path (`real_config.settings.model_dir`) and a sensible default model name (`env.get('model') or 'yolov5s'` - Redis only has a value there when someone's used the Streamlit UI). This keeps the image fully self-contained: no manual cache-warming step to remember on a fresh Narval allocation.

## 3. Verifying the build (and its real limits, locally)

```bash
limactl shell apptainer -- apptainer exec /home/ayobamidele.linux/carla.sif \
  python3.8 -c "import real_config; import numpy; print('ok')"
```

Basic Python, `numpy`, `real_config`, `scenic`, and `verifai` each import fine individually under QEMU emulation. `import api_app` (which pulls in `mlflow` → `pyarrow` and friends) reliably segfaults under emulation (`qemu: uncaught target signal 11`) — this looks like a QEMU/TCG limitation with `pyarrow`'s native code, not a defect in the image, but it means **the full pipeline has only been verified piece-by-piece locally, never end-to-end** — that can only happen natively, on Narval.

## 4. Transfer to Narval

Narval requires mandatory MFA (Duo) on every fresh SSH connection, and the project's SSH key is passphrase-protected — both mean the transfer needs to run somewhere that can prompt you interactively, which ruled out running it via `limactl shell -> ssh` (nested nice-to-not-deal-with pty/HOME issues: `ssh`'s tilde-expansion for `ControlPath` resolves via the system passwd entry, not `$HOME`, so the VM's own `ssh` never found the Mac-side `~/.ssh` control socket no matter how `$HOME`/`-F` were overridden). The reliable path: copy the image out of the VM onto the Mac's real disk, then transfer natively.

```bash
# On your Mac (not inside the VM, not inside a Narval SSH session):
limactl copy apptainer:/home/ayobamidele.linux/carla.sif ~/real-av-build/carla.sif
rsync -avP --partial ~/real-av-build/carla.sif narval:scratch/real_project/carla.sif
```

The `rsync` prompts for your key passphrase and then a Duo push/passcode, same as a normal interactive `ssh narval` login.

## 4b. Shortcut: run new project code WITHOUT rebuilding the image (source overlay)

The image pip-installs the project in editable mode from `/opt/real-av/REAL`, i.e. by path. `run_real_av.slurm` therefore bind-mounts `$SCRATCH/real_project/REAL` over that path if the directory exists, so a code change only needs the ~280 MB staging copy transferred, not the 13 GB image:

```bash
# after rebuilding the staging copy (section 2):
rsync -avP --partial --delete ~/real-av-build/REAL/ narval:scratch/real_project/REAL/
```

Only the project's own Python/templates change this way; CARLA, torch, the YOLO hub cache and the vendored Scenic/VerifAI/grape installs come from the image (the overlay carries identical copies of the vendored source). If the directory is absent the baked-in copy is used. Two consequences: (1) the first `import api_app` is slower from `$SCRATCH` (no cached `.pyc`, network FS) - hence the API readiness poll in the script; (2) **do not rsync while a job is running** - the job re-reads `scripts/scenarios/scratch.temp` for every scenario. Rebuild the image properly (sections 2-4) for the final, citable artifact.

## 5. Submit the job

```bash
scp infra/hpc/run_real_av.slurm narval:scratch/real_project/run_real_av.slurm
ssh narval "cd scratch/real_project && sbatch run_real_av.slurm"
ssh narval "squeue -u \$USER"
```

If your `~/.ssh/config` has `ControlMaster auto` + `ControlPersist` for `narval` (this project's does, 8 h), log in once interactively (`ssh narval`, Duo) and every further `ssh`/`scp`/`rsync` in that window reuses the connection with no prompts - including from non-interactive tools. `ssh -O check narval` tells you whether the shared connection is alive.

`run_real_av.slurm` starts, in order: Redis, an MLflow tracking server (local file-based backend/artifact store under `/artifacts`, since `scripts/simulations/util.py::evaluate_phenotype()` wraps every CARLA run in `mlflow.start_run()`), CARLA itself (off-screen), and `api_app.py`; waits until the API answers (poll every 5 s, up to 10 min, abort if the process dies); then makes one HTTP request to **`/run_grid?trials=5&record_video=true`** - all 32 scenarios of `old.bnf`, 5 simulations each (~2.7 min per scenario on an A100, ~1.5 h total plus one recorded run for the video). **The requirement is read from a `.dsl` file** (`REAL_REQUIREMENT_FILE`, default `docs/examples/R0_rounds1_2.dsl`, path relative to the project root inside the container) and its path is recorded as `requirement_source` in `run_meta.json`; `REAL_PARENT_RUN_ID`, `REAL_ROUND` and `REAL_TRIALS` pass through as well, e.g. for round 3:

```bash
sbatch --export=ALL,REAL_REQUIREMENT_FILE=artifacts/runs/<parent>/R1.dsl,REAL_PARENT_RUN_ID=<parent>,REAL_ROUND=3 run_real_av.slurm
```

(The file must be present in the source overlay - rebuild the staging copy and rsync it first, section 4b. A requirement that does not parse is now rejected by the API with Lark's line/column message instead of failing silently - see "Real run history", obstacle 3.) The modules the requirement names after `performed by` select the braking behaviour and perception model (see README "Requirement language"). The GE search is still available via `/get_testcases?sample=false&population_size=..&max_generations=..`. It runs `apptainer exec --nv --unsquash` - see "Real run history" for why `--unsquash` is required, not optional. `--time` is 3:30 (Narval's ≤3 h GPU queue tier is faster to schedule; drop to 2:59 if the queue is slow and lower the request `timeout` accordingly).

Output lands in `real-av-carla-<jobid>.out` in the submission directory and under `$SCRATCH/real_project/artifacts/runs/<run_id>/`: `run_meta.json`, `scenarios.csv`, `simulations.csv`, `traces/*.json`, `best_scenario.scenic`, `best_scenario.mp4`. `simulations.csv`/`scenarios.csv` grow as scenarios finish, so partial results can be pulled and analysed while the job runs:

```bash
rsync -avP --partial narval:scratch/real_project/artifacts/runs/<run_id>/ artifacts/runs/<run_id>/
python -m scripts.analysis.report artifacts/runs/<run_id>
```

## Before every submission: the laptop check

```bash
sim_env/bin/python -m pytest -q tests/test_scene_compile.py   # ~6 s, no CARLA needed
```

It builds the real scene from the template with the Town01 map in the repo
and checks the placement. Smoke run 2 (job 4385790) waited in the queue and
then failed in 4 minutes on an error this catches (Notes §8.27-8.28).

## Scene v2 smoke run (roadmap M2.7, 2026-10-01)

Scene v2 (Notes §8.19-8.20) changes the template the job re-reads per
scenario, and `MAX_STEPS` rises from 100 to 250 (25 s), so stalled runs last
up to 2.5x longer - budget `--time` accordingly for full runs. Before run 2b
or any GE run, check the new scene with one trial per scenario (32
simulations, the baseline requirement):

```bash
# laptop: rebuild the staging copy (section 2), then, with NO job running:
rsync -avP --partial --delete ~/real-av-build/REAL/ narval:scratch/real_project/REAL/
scp infra/hpc/run_real_av.slurm narval:scratch/real_project/run_real_av.slurm
ssh narval "cd scratch/real_project && sbatch --export=ALL,REAL_REQUIREMENT_FILE=docs/examples/R_baseline.dsl,REAL_TRIALS=1 run_real_av.slurm"
```

Pass when: the `.out` ends with `STATUS: OK` (no Scenic error on `ego.lane`, the heading check, `on_road`,
the kerb placement or the termination line); `simulations.csv` has the
scene-v2 columns filled (`pedestrian_speed_mps`, `peak_jerk_mps3`,
`resume_within_s`, `ego_start_m`); no-encounter runs near 0 (was ~25 %);
`initial_separation_m` differs between Short and Long; and
`best_scenario.mp4` shows the pedestrian crossing the lane **with the car on the road**;
`left_road` is False in every row (the first smoke run, job 4354082, failed this: the car
drove over the kerb - Notes §8.25-8.26). If a check fails,
fix before any full run.

## GE runs (roadmap M2c.2, 2026-10-01)

```bash
ssh narval "cd scratch/real_project && sbatch --export=ALL,REAL_SEARCH=ge,REAL_REQUIREMENT_FILE=docs/examples/R_baseline.dsl,REAL_POPULATION=16,REAL_GENERATIONS=6,REAL_TRIALS=2 run_real_av.slurm"
```

GE searches `REAL_GRAMMAR` (default `v2/scene_v2.bnf`, 21,120 scenarios),
simulating each *new* scenario `REAL_TRIALS` times (a scenario GE revisits is
not re-simulated). Cost is at most population x (generations + 1) x trials
simulations. `run_meta.json` is written at the start (`status: running`), so
a run cut off by `--time` still records what it tested; `simulations.csv` and
`traces/` grow as it goes. GE samples scenarios unevenly - see the analysis
caveat in the report. Timing: a scene-v2 simulation took ~3 min in the smoke
run (runs last up to 25 s), so keep population x (generations + 1) x trials
near 60 for one 3.5 h job (e.g. 12 x 4 x 1).

To confirm GE's leads on balanced repeats (grid check, 4 worst + 4 safe x 3 = 24 simulations):

```bash
python -m scripts.analysis.grid_check artifacts/runs/<ge_run>          # writes grid_check/scenarios.txt
# rebuild the staging copy + rsync (sections 2, 4b), then:
ssh narval "cd scratch/real_project && sbatch --export=ALL,REAL_SEARCH=list,REAL_SCENARIOS=artifacts/runs/<ge_run>/grid_check/scenarios.txt,REAL_TRIALS=3,REAL_PARENT_RUN_ID=<ge_run>,REAL_REQUIREMENT_FILE=docs/examples/R_baseline.dsl run_real_av.slurm"
python -m scripts.analysis.grid_check artifacts/runs/<ge_run> --compare artifacts/runs/<check_run>
```

## Real run history (read this before re-running - every fix here was found by actually running on Narval, not locally)

1. **`ConnectionRefusedError` / `Bus error (core dumped)` from CARLA itself** - Apptainer's default FUSE-mounted `.sif` (`squashfuse_ll`) has an idle timeout that doesn't play well with long-running backgrounded processes (CARLA + `api_app.py`, both launched with `&`); the mount got torn down mid-run, crashing both the Python import machinery and CARLA's own mmap'd binary. Fixed with `apptainer exec --unsquash`, which extracts the image to a real temp directory instead of a FUSE mount.
2. **`No module named 'tqdm'`** - a real, previously-undetected gap in `pyproject.toml`: `scripts/simulations/util.py` and `scripts/evolve/util.py` both import `tqdm` directly, but it was never declared as a dependency (only worked locally because something else pulled it in transitively). Added to `pyproject.toml`.
3. **`AttributeError: 'NoneType' object has no attribute 'iter_subtrees'`** - a smoke-test input bug, not a pipeline bug: `scripts/redsl/grammar.py`'s DSL grammar requires a structured KAOS-style requirement (`MAINTAIN "..." by "..." using "..." ... in scenario where "..."`, matching the template in `pages/1_grammar.py`), and silently swallows all parse exceptions (returning `None`) rather than raising - a plain sentence like `"a pedestrian crossing in fog"` fails to parse with no visible error until something tries to use the (nonexistent) parse tree. Fixed by using a properly-structured requirement string, written via a quoted heredoc in the Slurm script to sidestep nested bash/Python quote-escaping.
4. **MLflow connection refused on `127.0.0.1:5000`** - `evaluate()` needs a running tracking server, not just the `mlflow` client library; nothing started one. Added an `mlflow server` step to the Slurm script.
5. **YOLO/`torch.hub` needing internet on an offline compute node** - see build fix 5 above.
6. **`signal only works in main thread`** - FastAPI dispatches plain `def` routes to a worker thread; Scenic's per-step simulation timeout uses `signal.alarm()`, which only works on the main thread. Fixed by making `/get_testcases` `async def` instead of `def` (FastAPI keeps `async def` routes on the main event-loop thread).
7. **DEAP `TypeError: Both weights and assigned values must be a sequence of numbers`** - `scripts/simulations/util.py::evaluate()` returned `fitness,` (the whole `{total, passed, failed, pct}` dict wrapped in a tuple) instead of a tuple of numbers. `FitnessMin` (`weights=(-1.0,)`) needs a 1-tuple of numbers. Fixed to `return (fitness['pct'],)`.
8. **Client-side `ReadTimeout` at 30 min** - per-individual overhead (YOLO reload + 2 failed offline auto-update attempts, not just the 5 CARLA simulations) runs ~2-3 min/individual in practice, not the ~25s the simulation-only progress bars suggest. 10 individuals × 2 generations needs well over 30 min. Raised the smoke test's `requests.get(..., timeout=...)` to 7000s and the job's `--time` accordingly.
9. **Missing `import types`** in vendored `Scenic/src/scenic/core/utils.py` - a genuine upstream-adjacent bug, only surfaced once `traceback.print_exc()` was added to `api_app.py`'s exception handlers and the real error became visible on real hardware. `get_type_hints`'s Python<3.8.1 fallback path references `types.ModuleType` without importing `types` at all.
10. **`ConnectionRefused` from `smoke_test.py` to `127.0.0.1:7999` (job 3803335, 2026-09-23, died after 92 s)** - the script slept a fixed 5 s after starting `api_app.py`; with the source overlay on `$SCRATCH` the first import took ~20 s, so the request hit nothing and `set -e` ended the job ("Uvicorn running" appeared *after* the traceback). Replaced with a readiness poll (see section 5). Same fix applies to any "API not up yet" symptom.
11. **The pip `TLS CA certificate bundle` errors** in every log (`/etc/pki/tls/certs/ca-bundle.crt: invalid path`) are yolov5's optional-dependency auto-install failing because the *host's* RHEL certificate path leaks into the Ubuntu container environment, not only because the node is offline. Harmless (falls back to the cached model); `YOLOv5_AUTOINSTALL=False` in the script is meant to skip the attempt.

- The Slurm script runs one hardcoded example requirement as a smoke test — swap it for the real FastAPI/React flow once the hardened backend (run IDs + polling, from the next phase) exists.
- `-RenderOffScreen` disables the interactive window only; CARLA's camera sensors still render every frame on the GPU, which is what `RecordingMonitor` + `frames_to_mp4` capture into the `.mp4`.
- Harmless, expected noise that shows up in every run and needs no action: pip `AutoUpdate` retry warnings for `yolov5`'s optional dependencies (no outbound internet on the compute node, so both retries fail and it falls back to the already-cached model - by design, see build fix 5), and CARLA `WARNING: attempting to destroy an actor that is already dead` during per-individual cleanup (a benign double-free race in VerifAI/Scenic's own teardown, not something this project's code controls - simulations still complete and their fitness is still recorded correctly).

## First confirmed end-to-end success

**Job 3564897 (2026-09-21) completed the full pipeline successfully**, from a structured KAOS requirement string through the real GE search to a persisted, playable result — the first run where every fix above held simultaneously on real hardware. Result:

```
{'run_id': '862e8b31b0ba4c2f80778a33a17c5dc1',
 'best_phenotype': 'A { pedestrian : Child } wearing a {dress : Dark} dress trying to
   cross road from { direction : LR } at { distance : Long } distance on a day with
   fog density {fog_density : 50}',
 'STATUS': 'OK'}
```

`generations.csv` for this run shows the search actually converging toward falsifying scenarios (not just running without crashing): average fitness (percent of the 5 per-individual CARLA trials that passed, i.e. did *not* falsify) dropped 26.0 → 16.0 → 10.0 across the 3 logged generations (gen 0 = initial population, gen 1-2 = evolved), with the minimum hitting `0.0` (a fully falsifying individual) already in generation 0. Population `std` also dropped (12.8 → 15.0 → 13.4 is noisy but `avg` trending down is the real signal), consistent with GRAPE's elitism-based selection pressure doing its job.

Artifacts for this run (`best_scenario.scenic`, `best_scenario.mp4`, `best_phenotype.txt`, `generations.csv`, `run_meta.json`, 26 raw `front_rgb` PNG frames) were pulled back from `$SCRATCH/real_project/artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/` on Narval to this repo's own `artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/` via `rsync -avP --partial narval:scratch/real_project/artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/ artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/` for local review. The full job console log (`real-av-carla-3564897.out`) was pulled the same way to `artifacts/`.

Stages 1-5 of the target research pipeline (Input DSL → Requirement Parser → Constraint-aware grammar → Testing Generator/GE search → Test Executor) are now proven end-to-end against real CARLA on real GPU hardware, not just unit-tested against mocks. See the repo's own `Notes.md` for the full narrative of how this was reached and the plan for the next phase (failure diagnostics → requirement patches).

**Caveat found 2026-09-23:** this run's scores are not usable for analysis - the safety monitor then measured distance to *all* objects including a roadside vending machine (fixed since: pedestrian only), and only pass/fail counts were kept.

## Second run: exhaustive grid with telemetry (job 3830258, 2026-09-23)

Run id `35acc09e8c224fdc953e3bf82ba57e96`; `/run_grid`, 32 scenarios × 5 trials, pedestrian-only scoring, per-scenario seeds, system under test = emergency braking + yolov5s (the baseline; the executor started honouring the requirement's `performed by` modules only after this run). API ready after 20 s, ~2.7 min per scenario, **COMPLETED in 1 h 30 min** (2026-09-23 21:35 local). Full results pulled to `artifacts/runs/35acc09e…/`; report and interpretation: `Notes.md` §8.6.

## Third run: round 2 of the loop (job 3843349, 2026-09-23)

Same requirement, seed, grammar and template apart from the behaviour block; the only variable is `system_under_test.braking_mode = proportional_braking` (paper M4), now read from the requirement's `performed by`. Prediction pre-registered in `Notes.md` §8.8; compare with `python -m scripts.analysis.compare` (see that section for the exact command). Code reached Narval via the source overlay (section 4b) *after* round 1 had exited. Headline: the pedestrian is detected in most runs but only at ~6 m while the ego does ~7.2 m/s (needs ~8 m to stop); braking releases when detection drops; no grammar setting changes the outcome; 23 of 88 simulations were "no encounter" (car never near the pedestrian).
