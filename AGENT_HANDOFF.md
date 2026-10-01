# Handoff: REAL → real-av ICSE tool artifact

Written for the agent picking this project up next. Read this first, then
[Notes.md](Notes.md) (the full engineering log with rationale for every
decision) and [infra/hpc/README.md](infra/hpc/README.md) (the container/Narval
operational reference). This document is the "what you need to know before
touching anything" layer — it duplicates as little as possible; where
something is explained better elsewhere, it points there instead of repeating.

**Status as of 2026-10-01**: all nine stages are built and have run on real
data. Round 1 (emergency braking, job 3830258, run
`35acc09e8c224fdc953e3bf82ba57e96`) and round 2 (proportional braking, job
3843349, run `882fb2fe00bf4568bdb480a281db9e8b`) are analysed, compared and
reviewed; see [Notes.md §8](Notes.md#8-2026-09-23--failure-analysis-stages-6-7-the-grid-run-and-what-it-found)
— the findings differ from the paper's, read them. Rounds 1-2 are an
implementation comparison under a fixed requirement R0; the REAL loop proper
starts at round 3. The work up to 2026-09-23 is committed (`1495e32`, tag
`round2-2026-09-23`); the 2026-09-24/25 hardening (progressive review page,
S/R/D/T labels, `.dsl` example files, parse errors, `REAL_REQUIREMENT_FILE`,
92 tests) is committed in M0 of the roadmap.

**What comes next** is in [docs/design/roadmap.md](docs/design/roadmap.md)
(milestones M0-M6, agreed in direction 2026-10-01; supervisor points and the paper comparison in Notes.md §8.13 and [docs/design/tool_paper_alignment.md](docs/design/tool_paper_alignment.md)). M1 (the analysis side of [docs/design/domain_assumptions.md](docs/design/domain_assumptions.md)
(agreed 2026-09-30)) is **complete** (Notes §8.18; `docs/examples/R_baseline.dsl`; rounds 1-2
re-judged in `artifacts/runs/<run>/baseline_D0/`). The next is M2. Background: rounds 1-2 stated **no** domain assumptions, so every
failure was "valid" by construction and the valid/spurious split never ran
on real data. Before any new Narval run: the staging copy `~/real-av-build`
is stale — rebuild and rsync first (§4.3), and the template fixes in M2
(8 m trigger, no-encounter geometry, dead `distance`) are still open.

Venue is **ICSE** (was FSE; branch name `fse-tool` is historical). The user
has dropped the 2026-10-01 deadline. User style preference: short,
plain-language replies; every code change is proposed as a diff and approved
first; docs are updated with every code change (this file, Notes.md,
README.md, infra/hpc/README.md); every result is saved to a file in the run
folder, never only in chat.

## 1. What this project is

REAL is a PhD research prototype for autonomous-vehicle requirement
engineering. Pipeline: a natural-language safety requirement, written in a
structured KAOS-style DSL, is parsed, turned into a constraint-aware grammar,
searched via grammatical evolution (GE, using the `grape`/DEAP libraries) to
find scenario parameters that falsify the requirement under real CARLA
simulation with real YOLOv5 perception, and (future work) the falsifying
scenarios are diagnosed and turned into proposed requirement patches for a
human to review. The full target pipeline, as specified by the user's
supervisor:

```
Input DSL → Requirement Parser → Constraint-aware grammar → Testing Generator
(GRAPE/GE search) → Test Executor → Compute Diagnostic via Obstacle Exploration
→ Cross-layer mitigation → Requirement Refiner → Requirement Patches
```

The goal of the current work is to turn this from a research prototype into a
reusable ICSE (International Conference on Software Engineering) tool-paper
artifact: installable, config-driven, documented, and — critically — actually
verified to run end-to-end, not just plausible-looking code.

**Scope (updated 2026-09-23):** stages 1-5 work end-to-end; stages 6-7 are
built (`scripts/analysis/`); the user asked on 2026-09-23 to implement the
rest of the pipeline (failure analysis → human-in-the-loop requirement
refinement). Stages 8-9 follow the design in Notes.md §8.7 — still confirm
each concrete change before editing, per §5 below.

## 2. Where things live

- **Working directory**: `/Users/ayobamidele/Documents/PhD/REAL/REAL`
- **Git remotes**: `origin` = `git@github.com:PaulAyobamidele/REAL.git` (the
  user's fork), `upstream` = `https://github.com/darkaengl/REAL.git` (original
  research repo, read-only in practice).
- **Current branch**: `fse-tool`, tracking `origin/fse-tool`. Other local
  branches (`development`, `main`, `oa`) exist but are not the active line of
  work — don't merge into them or base new work on them without asking.
- **Compute**: Narval (Digital Research Alliance of Canada / Compute Canada
  HPC), accessed via `ssh narval`, using Slurm. Mandatory Duo MFA on every
  fresh SSH connection, passphrase-protected SSH key — both mean any
  Narval-touching command needs to run somewhere that can prompt interactively
  (a real terminal with the user present), not from a fully unattended agent
  loop.

## 3. What the repo consists of right now

This is a vendored, multi-submodule research repo, not a clean library. Know
the shape before changing anything:

**Git submodules** (`.gitmodules`): `VerifAI` (BerkeleyLearnVerify/VerifAI,
falsification framework), `scenario_runner` (carla-simulator/scenario_runner),
`grape` (bdsul/grape, the grammatical-evolution library). `Scenic` (the
probabilistic scenario language) is present but is a **vendored copy with
local patches** — not a clean submodule — because two of its files needed
direct bug fixes (see §6). One odd but apparently-benign observation: `git
status` currently reports `grape` as `??` (untracked) even though `git ls-tree
HEAD -- grape` and `git ls-files -s grape` both show it correctly registered
as a gitlink at the expected commit, and `grape/.git` correctly points at
`../.git/modules/grape`. Not yet root-caused — worth a `git submodule status`
check before it matters, but nothing currently depends on it being fixed.

**New, previously-nonexistent files (all untracked, none committed):**
- [`real_config.py`](real_config.py) — the single source of truth for every
  environment-dependent value (Redis host/port, MLflow URI, CARLA host/port/
  map paths, API bind, grammar/artifacts/model directories). A
  `pydantic.BaseSettings` (pydantic 1.x — pinned `<2`, see §5). Import this
  and use `settings.<field>`; never hardcode `localhost`, `127.0.0.1`, a port
  number, or a CARLA map path again — grep for those patterns before adding
  new code that touches any of them.
- [`pyproject.toml`](pyproject.toml) — the package definition. `pip install
  -e .` from the repo root installs `real-av` in editable mode.
- [`.env.example`](.env.example) — every `real_config.Settings` field with its
  current default. Copy to `.env` to override locally; never put real secrets
  in it (see §5).
- [`tests/`](tests/) — 23 tests, all passing as of this writing (`sim_env/bin/
  python -m pytest tests/ -q` → `23 passed`). Covers config defaults/
  overrides, constraint extraction, run persistence, video stitching, and a
  monkeypatched (no-CARLA) run through the real GRAPE/DEAP loop. **Cannot**
  and does not test the real CARLA-driven fitness function — that's only ever
  been verified on Narval (see §7).
- [`scripts/evolve/constraints.py`](scripts/evolve/constraints.py) — keyword-
  spots a small controlled vocabulary (fog→`fog_density`, adult/child→
  `pedestrian`, left/right→`direction`, close/far→`distance`) against the
  parsed requirement's free-text scenario description, and biases (not
  replaces) GE population initialization toward matching individuals.
- [`scripts/evolve/run_output.py`](scripts/evolve/run_output.py) — gives every
  real (`sample=False`) GE run a `run_id` and persists `run_meta.json`,
  `generations.csv`, `best_phenotype.txt`, `best_scenario.scenic` under
  `settings.artifacts_dir/runs/<run_id>/`.
- [`scripts/evolve/video.py`](scripts/evolve/video.py) — stitches the frames
  Scenic's built-in `RecordingMonitor` already produces into an `.mp4`.
  Sorts by the **leading integer** in the filename, not lexicographically —
  frame numbers are unpadded (`2_...png` vs `10_...png`).
- [`scripts/evolve/grid.py`](scripts/evolve/grid.py) — exhaustive run of all
  32 grammar scenarios × N trials (`/run_grid`), the fair-comparison
  counterpart to the GE search; writes `scenarios.csv` incrementally.
- [`scripts/analysis/`](scripts/analysis/) — stages 6-7: `telemetry.py`
  (per-simulation rows + traces, called from the template and the monitor),
  `admissibility.py` + `admissibility_rules.json` (valid vs spurious; `QUANTITIES` +
  `parse_assumption()` classify `assuming` items as scenario / run / free text /
  rejected; `check_assumptions()` marks each simulation held / broken / not measured,
  and only broken sets it aside; `assumption_verdicts()` says whether each one
  matters (load-bearing / not / untested / ...) — checked after the run, never imposed on the simulator),
  `failure_model.py` (rates, failure types, timing, sanity warnings),
  `obstacles.py` (KAOS obstacles + behaviour/soft-goal ones + candidates +
  per-layer mitigations), `report.py` (`python -m scripts.analysis.report
  <run_dir>` → `analysis_report.md/.json`), `compare.py` (`python -m
  scripts.analysis.compare <run_a> <run_b> [--assume-a k=v]` → one-variable
  check + comparable metric → `comparison.md/.json` in run_b),
  `decisions.py` (the `decisions.json` schema — THE artefact of the human
  review; nothing is applied from it automatically), `review.py`
  (`python -m scripts.analysis.review <run> --previous <prev> --reviewer X`,
  terminal walk-through that writes it; `--answers FILE` for replay).
  Laptop-only, reads `simulations.csv`. Outcomes include `no_encounter`
  (excluded from rates) and `passed_stalled` (standoff; counted as pass,
  reported apart). The catalogue has a fifth mitigation layer, `scenario`,
  and `SCENARIO_ARTEFACTS` for defects of the test itself. `refine.py`
  (`python -m scripts.analysis.refine <run>` → `R0.dsl`, `R1.dsl`; assumption verdicts
  keep/tighten/loosen/drop/added become `[D]` lines,
  `requirement_diff.md` with [S]/[R]/[D] labels; R1 parse-checked; nothing
  applied). Provenance: `/run_grid?...&parent_run_id=&round=&requirement_source=`
  → `run_meta.json`.
- [`pages/4_review.py`](pages/4_review.py) — offline Streamlit review page
  (reads run folders only; writes the same files as the CLI on Accept).
  Env `REAL_REVIEW_RUN_DIR` / `REAL_REVIEW_PREVIOUS_DIR` pre-fill it.
- DSL (`scripts/redsl/grammar.py`): optional `assuming "..."` (domain
  assumptions → scope rules) and `ensuring "..."` (soft goals) clauses;
  `get_operations()`, `get_module_for(task)`, `get_assumptions()`,
  `get_soft_goals()`. Old requirements parse unchanged.
- [`scripts/simulations/util.py`](scripts/simulations/util.py) —
  pedestrian-only `MyMonitor`; `configure()` / `RUN_CONTEXT` /
  `BRAKING_BEHAVIOURS` (the system under test, from the requirement);
  `build_scenario()`; `evaluate_phenotype()` shared by GE and grid.
- [`scripts/scenarios/scratch.temp`](scripts/scenarios/scratch.temp) — the
  live Scenic template: `perceive()` (YOLO once per step + telemetry),
  `brake_now()`, `<ego_behavior>` placeholder, `record ego.speed` /
  `pedestrian_distance`. Known limitation: `distance` does not move the
  pedestrian; lane choice can send the car away (no-encounter runs).
- [`infra/hpc/`](infra/hpc/) — `carla.def` (Apptainer image definition),
  `run_real_av.slurm` (the Slurm job script: now `/run_grid`, a **source
  overlay** bind-mount of `$SCRATCH/real_project/REAL` over the baked-in copy
  so code changes need no image rebuild, and an API readiness poll),
  `README.md` (the operational reference — read this before touching the
  container workflow).
- [`Notes.md`](Notes.md) — the full engineering log: every decision, every
  bug found on real hardware and why, the first successful run's results, and
  the draft plan for stages 6-9.
- [`artifacts/`](artifacts/) — pulled-back results from the first successful
  Narval run: `artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/` (scenic file,
  mp4, 26 PNG frames, phenotype, metadata) and
  `artifacts/real-av-carla-3564897.out` (the full job console log). This
  mirrors — not replaces — the copy still sitting on Narval at
  `$SCRATCH/real_project/artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/`.

**Modified existing files** (all still just config/path fixes replacing
hardcoded values with `settings.*`, or the two vendored-Scenic bug fixes —
nothing behavioral beyond that): `README.md`, `api_app.py`, `scenic_utility.py`,
`scratch.py`, `model/model_logger.py`, `pages/1_grammar.py`,
`pages/2_evolution.py`, `pages/3_results.py`, `scripts/evolve/ge.py`,
`scripts/evolve/util.py`, `scripts/mlops/train.py`,
`scripts/mlops/vanilla_model.py`,
`scripts/mlops/yolo_models/models/model_logger.py`,
`scripts/mlops/yolo_models/yolo_model.py`, `scripts/scenarios/scratch.temp`,
`scripts/simulations/test.py`, `scripts/simulations/util.py`,
`scripts/templates/old/scenic_template.py`,
`Scenic/src/scenic/core/utils.py`,
`Scenic/src/scenic/domains/driving/model.scenic`. Full rationale for each in
[Notes.md §2](Notes.md#2-phase-1--packaging--config-driven-core) and
[Notes.md §3.2](Notes.md#32-build-time-fixes-and-why-each-was-necessary).

**Not touched, deliberately**: `infra/credentials.json`, `infra/config.env`
contain real, already-committed secrets. Standing decision: packaging hygiene
only (ship `.env.example` with placeholders), never commit new secrets, but do
**not** touch git history and do **not** rotate the already-compromised live
credentials — that's a separate, higher-risk decision reserved for the user.
`.gitignore` documents this reasoning inline. React UI work is also untouched
— explicitly deprioritized by the user in favor of getting the pipeline
itself running cleanly.

## 4. Workflow

### 4.1 Local development (Mac)

```bash
cd ~/Documents/PhD/REAL/REAL
sim_env/bin/pip install -e .          # editable install of real-av
sim_env/bin/python -m pytest tests/ -q  # 23 tests, no CARLA needed
```

`sim_env/` is the existing local Python virtualenv — use its `bin/python`/
`bin/pip`, not a system Python. Local testing cannot exercise the real
CARLA-driven fitness function (no `carla` package or server available on this
Mac) — everything CARLA-dependent is mocked/monkeypatched in `tests/`. Do not
assume a green local test run means the real pipeline works; it means the
non-CARLA parts work. The only way to verify the CARLA-dependent path is a
real Narval run (§4.3).

### 4.2 Building the container (Mac → Lima VM → Apptainer image)

Full detail and every gotcha: [infra/hpc/README.md §§1-3](infra/hpc/README.md).
Short version:

```bash
# One-time VM setup (already done on this Mac, included for a fresh machine):
brew install lima
limactl start template://apptainer-rootful --name=apptainer --tty=false
limactl shell apptainer -- sudo apt-get install -y qemu-user qemu-user-binfmt binfmt-support

# Re-run this after ANY local source change:
mkdir -p ~/real-av-build && rm -rf ~/real-av-build/REAL
rsync -a --exclude='.git' --exclude='sim_env' --exclude='mlruns' \
  --exclude='__pycache__' --exclude='.pytest_cache' \
  --exclude='infra/credentials.json' --exclude='infra/config.env' \
  ~/Documents/PhD/REAL/REAL/ ~/real-av-build/REAL/
  # (see infra/hpc/README.md for the FULL exclude list — abbreviated here)

limactl shell apptainer -- sudo APPTAINER_TMPDIR=/var/tmp/apptainer-build \
  apptainer build /home/ayobamidele.linux/carla.sif infra/hpc/carla.def
```

This is amd64-on-arm64 emulation (QEMU) — expect it to be slow (15-20 min),
and expect `import api_app` (pulls in `mlflow` → `pyarrow`) to **segfault**
under local emulation. That's expected, not a regression — see
[infra/hpc/README.md §3](infra/hpc/README.md#3-verifying-the-build-and-its-real-limits-locally).
Local verification is necessarily piece-by-piece (`import real_config`,
`numpy`, `scenic`, `verifai` individually); true end-to-end verification only
happens on Narval.

### 4.3 Running on Narval

```bash
# Get the built image onto the Mac's real disk (it only exists inside the VM):
limactl copy apptainer:/home/ayobamidele.linux/carla.sif ~/real-av-build/carla.sif

# Transfer natively (run on the Mac's own terminal — NOT inside the Lima VM,
# NOT inside an existing Narval SSH session; prompts for key passphrase + Duo):
rsync -avP --partial ~/real-av-build/carla.sif narval:scratch/real_project/carla.sif

# Push the job script and submit:
scp infra/hpc/run_real_av.slurm narval:scratch/real_project/run_real_av.slurm
ssh narval "cd scratch/real_project && sbatch run_real_av.slurm"
ssh narval "squeue -u \$USER"

# Watch it:
ssh narval "tail -f scratch/real_project/real-av-carla-<JOBID>.out"
```

Inside the job, `run_real_av.slurm` runs `apptainer exec --nv --unsquash`
(not the default FUSE mount — that idle-times-out and kills long-running
backgrounded CARLA/API processes), starts Redis, an MLflow tracking server,
CARLA off-screen, and `api_app.py`, then makes one HTTP request to
`/get_testcases?sample=false` with a small `population_size`/
`max_generations` override (10/2 — a full 1000/200 search is far too slow for
any reasonable walltime with real CARLA falsification) and a properly
KAOS-structured requirement string. Results land in
`real-av-carla-<jobid>.out` and, once the run completes,
`$SCRATCH/real_project/artifacts/runs/<run_id>/`.

**What "done" looks like** (this is what job 3564897 actually printed, and
what to expect from a healthy run): a final line of JSON from the API,
`{'run_id': '...', 'best_phenotype': '...', 'STATUS': 'OK'}`, followed by
clean FastAPI/uvicorn shutdown log lines. Per-individual noise that is
**expected and not a failure** — see §6 before treating either as a new bug.

### 4.4 Pulling results back

```bash
rsync -avP --partial \
  narval:scratch/real_project/artifacts/runs/<run_id>/ \
  ~/Documents/PhD/REAL/REAL/artifacts/runs/<run_id>/
```

## 5. Standing rules — do not relitigate these

- **No unapproved code edits.** Get explicit go-ahead before any Write/Edit or
  file-mutating command, even a "low risk" fix. This has held for every single
  change described in this document, including patching vendored third-party
  code (`Scenic/`) — that one specifically got its own separate confirmation
  after the issue was explained in detail, because patching vendored code is a
  step up in risk from patching this project's own files.
- **Secrets in `infra/`**: packaging hygiene only, as described in §3. Don't
  touch git history, don't rotate the already-compromised live credentials.
- **Secrets in chat**: if a real credential is ever pasted into a
  conversation (this happened once already — a live Sylabs access token), 
  treat it as compromised immediately, have the user revoke/rotate at the
  source, and have any replacement entered directly in their own terminal,
  never back into chat.
- **React UI**: deprioritized by explicit user decision. Don't start it
  without being asked.
- **Stages 8-9**: designed (Notes.md §8.7), not started. Two of §7.3's open
  questions are answered: "cross-layer" = data/model/system/requirement
  layers (the paper, Sec. IV-C); the obstacle catalogue is *both* fixed
  (paper's names) and open (unnamed candidates for the human to name). Still
  open: how many rounds/runs before trusting correlations.
- **Narval access from this tool**: the user's `~/.ssh/config` shares one
  login for 8 h (`ControlMaster auto`, `ControlPersist 8h`). Once the user
  has run `ssh narval` in their own terminal (Duo), `ssh -o BatchMode=yes
  narval "..."` works from the Bash tool with no prompts; check with
  `ssh -O check narval`. Never run ssh in a way that would prompt.
- **Never sync code to Narval while a job is running**: the job re-reads
  `scratch.temp` for every scenario from the overlay directory.
- **Before any destructive git operation** (checkout/restore/reset/clean,
  force-push, rm -rf in the repo): run `git status` first. As of this
  writing there is a substantial amount of uncommitted work-tree state (see
  §3) that has not yet been reviewed/committed by the user — treat it as
  live, in-progress work, not scratch.

## 6. Known-benign noise (don't chase these as bugs)

Every successful run shows both of these; they're recorded so nobody wastes
time re-diagnosing them:

- **pip `AutoUpdate` retry failures** for `yolov5`'s optional dependencies
  (`pillow`, `seaborn`, `setuptools`) — the compute node has no outbound
  internet, both retries predictably fail, and it falls back to the
  already-cached model. This is by design (see Notes.md §3.2 item 5), not a
  missing dependency.
- **`WARNING: attempting to destroy an actor that is already dead`** during
  per-individual CARLA cleanup — a benign double-free race in VerifAI/Scenic's
  own teardown code, not something this project's code controls. Simulations
  still complete and fitness is still recorded correctly when this appears.

If you see a **new** warning/error pattern not in this list or in
[Notes.md §4](Notes.md#4-the-obstacle-log--every-bug-found-running-on-real-narval-hardware)
(the full 11-item obstacle log), treat it as a real signal worth investigating
— don't assume it's noise just because other noise exists.

## 7. What's proven vs. not

**Proven, on real hardware, 2026-09-21 (job 3564897):** structured KAOS
requirement → Lark parse → constraint extraction → constrained population
init → real 10×2 GE search with real CARLA + real YOLOv5 perception → 
persisted output (scenic file, mp4, generations.csv, run_meta.json). Full
results and interpretation in
[Notes.md §5](Notes.md#5-first-confirmed-end-to-end-success). The `best_phenotype`
result is the **most falsifying** individual the search found — a video
showing a near-miss/collision is the search succeeding at its actual
objective (minimizing pass-rate), not a defect.

**Proven 2026-09-23 (job 3830258, run 35acc09e…):** the same path with
pedestrian-only scoring, per-scenario seeds, and full per-simulation
telemetry, over all 32 scenarios × 5 trials; the laptop-side report ran on
the real `simulations.csv`. Findings in Notes.md §8.6 — headline: the
pedestrian *is* detected but too late for the approach speed, and braking
releases when detection drops; the paper's three setting-based obstacles were
not supported in this set-up. Do not describe stage 6 as "future work" any more.

**Not yet verified/built:**
- Stages 8-9 (decisions file + review CLI, requirement writer, round-to-round
  comparison, run lineage) — designed in Notes.md §8.7, not built.
- Round 2 (same requirement, `proportional_braking` now honoured) — the first
  real mitigation experiment; run it after the round-1 job completes and
  compare the two reports.
- Scenario geometry fixes: the dead `distance` parameter and the
  no-encounter lane choice in `scratch.temp`.
- A hardened backend (run IDs + polling endpoints, beyond the current
  one-shot synchronous `/get_testcases` call) — next phase per the original
  roadmap, not started.
- CI, Zenodo archival/DOI, the STATUS file declaring ACM badges — future
  phases, not started.
- Multiple/varied requirements through the real pipeline — only one
  requirement (the pedestrian/fog example) has been run end-to-end so far.
  Notes.md §7.3 flags this explicitly: don't trust failure-model correlations
  (once built) from a single run.

## 8. If you get stuck

Read, in this order: this document → [Notes.md](Notes.md) (why, not just
what) → [infra/hpc/README.md](infra/hpc/README.md) (operational detail +
the full obstacle log) → the code itself. The obstacle log in particular
exists specifically so a new session doesn't have to re-discover the same 11
bugs by trial and error against a slow (Slurm-queued, MFA-gated) feedback
loop — check it before assuming something is a new problem.
