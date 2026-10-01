# REAL → real-av: engineering log and next-phase plan

This is the working engineering log for turning REAL (a PhD research prototype for
AV requirement engineering) into a reusable ICSE tool-paper artifact. It records
*why* each engineering decision was made, not just what changed — the code and
git history already show the "what." Fork: `PaulAyobamidele/REAL`, branch
`fse-tool` (the branch name predates the venue change from FSE to ICSE; the
2026-10-01 deadline was dropped by the user on 2026-09-23 — quality over speed).

## 1. The target pipeline

The supervisor's target research pipeline has nine stages:

```
Input DSL → Requirement Parser → Constraint-aware grammar → Testing Generator
(GRAPE/GE search) → Test Executor → Compute Diagnostic via Obstacle Exploration
→ Cross-layer mitigation → Requirement Refiner → Requirement Patches
```

Scope decision (confirmed with the user 2026-09-17): **stages 1-5 must work
end-to-end** for this artifact, including a real GE search (not just sampling),
persisted `.scenic`/`.txt` outputs, and a video per run. **Stages 6-9 are future
work**, documented but not implemented in this phase. This was an explicit,
deliberate scope cut ("I will make obstacle-clustering secondary for now"), not
an oversight — see §5 for the plan to pick it back up.

## 2. Phase 1 — packaging + config-driven core

### 2.1 The starting state

Before this phase, the codebase had no config mechanism at all: no
`real_config`, no `pyproject.toml`, no env-var reads. The README documented
`MLFLOW_TRACKING_URI`/`CARLA_ROOT`/`REDIS_HOST`/`REDIS_PORT` as if they were
read from the environment, but nothing actually read them — Redis host/port was
hardcoded verbatim in 10 files, the MLflow tracking URI in ~8, and the CARLA map
path was baked into the live scenario-generation template. Worse: the natural
language requirement was parsed by the DSL but its result was **discarded**
before test generation — `/get_testcases` only ever sampled a fixed, unrelated
BNF grammar. The real evolutionary loop (`ge_eaSimpleWithElitism`) existed and
looked correct, but was never invoked from the API. Generated Scenic code lived
only in memory; no `.scenic` file was ever written; no video was ever produced.

### 2.2 `real_config.py` — single source of truth for environment-dependent values

[`real_config.py`](real_config.py) is a `pydantic.BaseSettings` (pydantic 1.x —
already pinned `<2` due to a `mlserver` conflict, see §4.3) with every field
defaulting to **exactly the previous hardcoded value**, so importing it changes
zero behavior unless an env var is actually set. This was the deliberate design
constraint: config-driven refactors are usually low-risk *if and only if* the
defaults are provably identical to what was there before, so every default was
checked against the literal it replaced rather than "improved."

Fields: `redis_host`/`redis_port`, `mlflow_tracking_uri`, `api_host`/`api_port`,
`carla_host`/`carla_port`/`carla_root`/`carla_map_path`/`carla_map_name`,
`grammar_base_dir`, `artifacts_dir`, `model_dir` — the last three are
`__file__`-anchored (not CWD-relative) so the package works correctly no matter
what directory it's invoked from, which turned out to matter in practice: the
`BNF_GRAMMAR` path bug in [`scripts/evolve/ge.py`](scripts/evolve/ge.py) was a
real, latent bug (CWD-relative), only exposed once the Slurm container ran
`api_app.py` from a different working directory than local development ever had.

### 2.3 Wiring the real GE loop end-to-end

[`scripts/evolve/ge.py`](scripts/evolve/ge.py)'s `start_ge()` was extended with
`constraints`, `run_id`, `requirement`, `scenario_text`, `population_size`,
`max_generations`, `record_video` parameters. The `sample=True` branch (the
Streamlit UI's existing "sample" button) was kept byte-for-byte unchanged —
since `start_ge` was, at the time, only ever called with `sample=True` in
practice (confirmed via grep before touching anything), changing the
`sample=False` branch's return shape was zero-risk to existing behavior.

[`api_app.py`](api_app.py)'s `/get_testcases` route now reads the `sample` query
param the Streamlit UI was already silently sending
([`pages/1_grammar.py`](pages/1_grammar.py)) instead of hardcoding `True`.
`sample=False` triggers the real path: extract constraints from the parsed
requirement (§2.4), generate a `run_id`, call the real GE search, and persist
its output (§2.5).

New [`scripts/evolve/run_output.py`](scripts/evolve/run_output.py):
`new_run_id()`, `run_dir()`, `persist_run()` — writes `run_meta.json` (inputs
and params), `generations.csv` (per-generation logbook stats), and
`best_phenotype.txt`/`best_scenario.scenic` for the fittest individual, reusing
the same Scenic-generation code path
([`scripts/simulations/util.py::get_scenic_script`](scripts/simulations/util.py))
the live GE loop actually runs through — not the separate, similarly-named
`scenic_template.py::get_scenic_code` path used by `/validate`, which would have
silently produced scenarios that didn't match what was actually evaluated.

### 2.4 Constraint-aware grammar v1

New [`scripts/evolve/constraints.py`](scripts/evolve/constraints.py):
`extract_constraints()` keyword-spots a small controlled vocabulary (fog→
`fog_density`, adult/child→`pedestrian`, left/right→`direction`, close/far→
`distance`) against the DSL's free-text scenario description.
`constrain_population()` takes an **oversampled** population (3×`pop_size`)
from GRAPE's existing, unmodified `sensible_initialisation`, scores each
individual's match against the extracted constraints, and returns exactly
`pop_size` individuals biased toward matches while keeping some non-matching
individuals for diversity. This only touches population *initialization* — no
changes to `grape`/DEAP internals. Two alternative designs were considered and
rejected: mutation-biasing (would require decoding codon-to-terminal mappings
per grammar position — fragile for a v1) and fitness-penalty (would conflate
constraint-matching with CARLA-safety fitness in one scalar, confounding the
GE search's actual falsification objective).

### 2.5 Video capture — reusing an existing, broken-by-path mechanism

The initial assumption was that video capture needed to be built from scratch.
Reading the vendored Scenic source directly disproved this: a recording
mechanism already existed and was already invoked live in
[`scripts/scenarios/scratch.temp`](scripts/scenarios/scratch.temp) — Scenic's
built-in `RecordingMonitor`
([`Scenic/src/scenic/domains/driving/model.scenic:478`](Scenic/src/scenic/domains/driving/model.scenic)),
which periodically calls `car.save_observations(path, frame_number)`, writing
each `front_rgb` frame to `<path>/front_rgb/{frame_number}_{timestamp}.png`
(verified directly in
[`Scenic/src/scenic/simulators/carla/sensors.py`](Scenic/src/scenic/simulators/carla/sensors.py)).
The only real problems were that `path` was hardcoded to a nonexistent user
directory (`/home/darkaengl/Project`), and nothing stitched the PNGs into a
video.

Fix: `scratch.temp`'s hardcoded path became a `<run_frames_dir>` template
placeholder, injected by `evaluate()` before scenario generation; new
[`scripts/evolve/video.py::frames_to_mp4()`](scripts/evolve/video.py) globs the
frames and stitches them via `cv2.VideoWriter`, **sorting by the leading
integer in the filename, not lexicographically** — frame numbers are unpadded
(`2_...png`, `10_...png`), so a plain string sort would order frame 10 before
frame 2. This was caught by writing a unit test with a deliberately
mixed-digit-count filename set before ever running against real frames.

Video recording is deliberately **off by default** during the bulk GE search
(`param_dict['recording_statement'] = ''` in
[`scripts/simulations/util.py::evaluate()`](scripts/simulations/util.py)) —
recording every one of `population_size × max_generations` individuals would be
wasteful and slow. Only the best-of-run (via `persist_run()`) and single-test
`/validate` calls record.

### 2.6 Packaging fixes

[`pyproject.toml`](pyproject.toml): dependency list corrected against what the
code actually imports (`tqdm` was missing — see §4, obstacle log item 2);
`antlr4-python3-runtime` removed as unused; `mlserver` deliberately excluded
(see §4.3); `grammar/kaos`/`grammar/example` dropped from `packages=[...]`
after confirming via repo-wide grep that nothing imports them — they're
superseded by the Lark grammar in
[`scripts/redsl/grammar.py`](scripts/redsl/grammar.py) but left on disk rather
than deleted, since that's a content decision for the user/supervisor, not a
packaging one.

New [`tests/`](tests/) directory: 23 tests covering config defaults/overrides,
constraint extraction, run persistence, video stitching, and a monkeypatched
(no-CARLA) run through the real GRAPE/DEAP loop. All CARLA-dependent paths were
explicitly **not** verifiable in the development environment (no `carla`
package or server available there) — flagged as a known gap in the plan, closed
only by the real Narval run in §4.

New [`.env.example`](.env.example) lists every `Settings` field with its
current default — not `infra/config.env`'s real secrets, which stays untouched
and gitignored per an earlier, separate decision (see §6).

## 3. Why a container, and why Narval

Phase 1's own plan flagged a real gap: nothing in the local development
environment could run `carla` (no package, no server), so the real
GE-search-driven-by-actual-CARLA-falsification path was only ever verified
against mocks. That gap could only be closed by running on hardware with a real
GPU and a real CARLA server — which meant Narval (Digital Research Alliance of
Canada HPC), and meant packaging the whole pipeline (CARLA 0.9.13 + this
project + its Python environment) into a single Apptainer image so a Slurm job
could run it unattended on a compute node with no interactive access.

### 3.1 Building an amd64 container on an arm64 Mac

Apptainer doesn't run natively on macOS, and Narval/CARLA both need amd64, not
the Mac's arm64. Sylabs Cloud's remote builder was the first thing tried,
specifically to avoid emulation — but the installed Apptainer version (1.5.3)
had already removed the `--remote` build flag from its CLI; only an
unscriptable web UI remained. The fallback, and what actually shipped: a Lima
VM running rootful Apptainer, with `qemu-user`/`qemu-user-binfmt` registered so
the VM can execute amd64 binaries under emulation. Slower, but fully local and
reliable once a handful of emulation-specific issues (below) were worked
around.

### 3.2 Build-time fixes, and why each was necessary

All baked into [`infra/hpc/carla.def`](infra/hpc/carla.def) — see that file's
`README.md` companion
([`infra/hpc/README.md`](infra/hpc/README.md#build-fixes-baked-into-carladef-found-the-hard-way--keep-these-if-you-edit-the-file))
for the authoritative, continuously-updated list. In summary:

1. The Lima VM's `/tmp` is a 2GB tmpfs, separate from the 96GB real disk.
   Apptainer's own build staging redirects via `APPTAINER_TMPDIR`, but pip's
   *own* download/build temp files ignore that variable and default to `/tmp`
   regardless — `pip install torch` failed with "No space left on device"
   despite 80GB+ free, until `%post` set `TMPDIR` itself.
2. The base `carlasim/carla:0.9.13` image's NVIDIA CUDA apt repo has an expired
   upstream signing key, which silently skips the entire `apt-get install` step
   via `&&` short-circuiting. Fixed by removing that repo's `.list` file before
   `apt-get update`.
3. `mlserver` cannot be declared in `pyproject.toml` at all: every release
   through `1.4.0.dev2` pins `fastapi<=0.89.1`, conflicting with this project's
   `fastapi>=0.109`. The two work fine together in practice (this is exactly
   what the original `setup_env.sh` does, installing them as separate `pip
   install` calls that never cross-check each other) — so `mlserver` installs
   as a separate `pip install --no-deps` step, with a comment in the `.def`
   file explaining why it's not a normal dependency.
4. Everything under `%post` runs slower than native amd64 hardware would,
   purely because of QEMU emulation — expected, not a bug.
5. **The YOLO perception model needs `torch.hub`'s `ultralytics/yolov5` repo
   definition cached, and Narval's compute nodes have no internet access.**
   The original code called `torch.hub.load(..., force_reload=True)`, which
   *always* re-fetches from GitHub — categorically incompatible with an
   offline compute node. The fix has three parts, because a single "just cache
   it" fix doesn't work: (a) `%post` pre-warms the cache at *build* time
   (the Lima VM has internet) using `torch.hub._get_cache_or_reload()` directly
   rather than the full `torch.hub.load()` — the latter also *constructs* the
   model, doing real tensor ops that reliably segfault under this Mac's QEMU
   emulation; only the pure fetch-and-extract step runs at build time, and
   actual model construction happens for the first time at runtime on Narval's
   real (non-emulated) hardware; (b) `%environment` sets
   `TORCH_HOME=/opt/torch_cache` so that cache is found at runtime; (c) the
   vendored
   [`Scenic/src/scenic/domains/driving/model.scenic`](Scenic/src/scenic/domains/driving/model.scenic)
   was patched to `force_reload=False` (reuse the cache) with a config-driven
   model path. This patch to vendored, third-party code was only made after
   explicitly asking the user for approval, given the standing "no unapproved
   edits" instruction.

### 3.3 Local verification limits

`import real_config`, `numpy`, `scenic`, and `verifai` each import fine
individually under QEMU emulation. `import api_app` (which pulls in `mlflow` →
`pyarrow`) reliably segfaults under emulation (`qemu: uncaught target signal
11`) — a QEMU/TCG limitation with `pyarrow`'s native code, not a defect in the
image. This meant **the full pipeline could only ever be verified piece by
piece locally** — true end-to-end verification could only happen natively, on
Narval. That expectation was stated explicitly before the first real run, so
that a first-run failure wouldn't be a surprise but a normal part of the plan.

### 3.4 Transfer mechanics

Narval requires mandatory Duo MFA on every fresh SSH connection, and the
project's SSH key is passphrase-protected — both mean any transfer needs to run
somewhere that can prompt interactively. Running the transfer via
`limactl shell → ssh` (nested) was ruled out: `ssh`'s `ControlPath`
tilde-expansion resolves via the system passwd entry, not `$HOME`, so the VM's
own `ssh` could never find the Mac-side `~/.ssh` control socket no matter how
`$HOME`/`-F` were overridden. The reliable path that shipped: `limactl copy`
the built `.sif` out of the VM onto the Mac's real disk, then `rsync` natively
from the Mac to Narval — sidestepping the nested-shell problem entirely.

`apptainer exec --nv --unsquash` (not the default FUSE-mounted `.sif`) was
required, not optional: the default `squashfuse_ll` mount has an idle timeout
that doesn't play well with long-running backgrounded processes (CARLA +
`api_app.py`, both launched with `&`) — the mount got torn down mid-run,
crashing both Python's import machinery and CARLA's own mmap'd binary
(`Bus error (core dumped)`). `--unsquash` extracts the image to a real temp
directory instead, avoiding the FUSE mount lifecycle entirely.

## 4. The obstacle log — every bug found running on real Narval hardware

This project's `.gitignore` already documents the philosophy for the *codebase's*
own obstacle log (committed secrets, treated as compromised, never removed from
history but never repeated). This section is the same idea applied to the
Narval deployment: every one of these was found only by actually running on
real hardware, not by code review or local testing, and every fix is already
baked into the source (`carla.def`, `run_real_av.slurm`, `api_app.py`, the
vendored `Scenic/` patches) — re-running the pipeline from scratch needs no
manual re-patching.

1. **`ConnectionRefusedError` / `Bus error (core dumped)` from CARLA** — the
   default FUSE-mounted `.sif` idle-timed-out mid-run. Fixed with
   `apptainer exec --unsquash` (§3.4).
2. **`No module named 'tqdm'`** — a real gap in `pyproject.toml`:
   [`scripts/simulations/util.py`](scripts/simulations/util.py) and
   [`scripts/evolve/util.py`](scripts/evolve/util.py) both import `tqdm`
   directly, but it was never declared (only worked locally because something
   else pulled it in transitively). Added as an explicit dependency.
3. **`AttributeError: 'NoneType' object has no attribute 'iter_subtrees'`** —
   not a pipeline bug, a smoke-test input bug: the DSL grammar requires a
   structured KAOS-style requirement string and silently swallows all parse
   exceptions (returning `None`), so a plain sentence like `"a pedestrian
   crossing in fog"` fails with no visible error until something tries to use
   the nonexistent parse tree. Fixed by using a properly structured requirement
   string in the smoke test, written via a quoted heredoc in the Slurm script
   to sidestep nested bash/Python quote-escaping.
4. **MLflow `ConnectionRefused` on `127.0.0.1:5000`** —
   `evaluate()` unconditionally wraps every CARLA run in
   `mlflow.start_run()`, which needs a running tracking server, not just the
   client library. Added an `mlflow server` step (local file-based
   backend/artifact store under `/artifacts`, so results survive the job's
   temp sandbox being cleaned up) to the Slurm script.
5. **YOLO/`torch.hub` needing internet on an offline compute node** — the
   three-part fix in §3.2 item 5.
6. **Live-pasted Sylabs access token** — the user accidentally pasted a live
   API token into chat while debugging an unrelated transfer issue. Treated as
   compromised immediately: instructed to revoke it at cloud.sylabs.io and
   generate a fresh one, entered directly at the terminal, never back into
   chat. Not a pipeline bug, but recorded here because it shaped how every
   subsequent credential-adjacent step in this log was handled — see §6.
7. **`signal only works in main thread`** — FastAPI dispatches plain `def`
   routes to a worker thread; Scenic's per-step simulation timeout uses
   `signal.alarm()`, main-thread-only. `/get_testcases` became `async def`
   (FastAPI keeps `async def` routes on the main event-loop thread; no `await`
   needed inside since the GE/CARLA work is itself synchronous — this
   intentionally blocks the event loop for the run's duration, which is fine
   since nothing else needs concurrent serving here).
8. **DEAP `TypeError: Both weights and assigned values must be a sequence of
   numbers`** — `evaluate()`'s final `return fitness,` wrapped the *whole*
   `{total, passed, failed, pct}` dict in a 1-tuple instead of a number.
   `FitnessMin`'s `weights=(-1.0,)` needs a 1-tuple of numbers. Fixed to
   `return (fitness['pct'],)` — minimizing `pct` (percent of trials passed) is
   exactly the falsification objective: search for parameter combinations that
   make the safety property fail.
9. **Client-side `ReadTimeout` at 30 minutes** — per-individual overhead (YOLO
   reload + 2 failed offline auto-update attempts, not just the 5 CARLA
   simulations) runs ~2-3 min/individual in practice, not the ~25s the
   simulation-only progress bars suggest. 10 individuals × 2 generations needs
   well over 30 min. Raised the smoke test's request timeout to 7000s and the
   Slurm job's `--time` to match, with headroom for CARLA/MLflow
   startup/shutdown.
10. **Bash syntax error from an apostrophe in a comment** — a comment
    containing `yolov5's` inside the Slurm script's single-quoted
    `bash -c '...'` block terminated the quote early. Fixed by removing the
    apostrophe and verifying every subsequent edit to that block with
    `bash -n` before resubmitting — a cheap check that would have caught this
    immediately.
11. **Missing `import types`** in vendored
    [`Scenic/src/scenic/core/utils.py`](Scenic/src/scenic/core/utils.py) — a
    genuine bug in Scenic's own `get_type_hints` Python-version-compatibility
    fallback (references `types.ModuleType` without ever importing `types`).
    Only became visible once `traceback.print_exc()` was added to
    `api_app.py`'s exception handlers — before that, the same failure surfaced
    only as an opaque, swallowed exception. This is the kind of bug that
    justifies "always print the real traceback before optimizing anything
    else" as a standing debugging practice for this project.

Two further observations, not bugs: pip `AutoUpdate` retry warnings for
`yolov5`'s optional dependencies (no outbound internet, both retries
predictably fail, falls back to the cache by design — see fix 5) and CARLA's
`WARNING: attempting to destroy an actor that is already dead` during
per-individual cleanup (a benign double-free race in VerifAI/Scenic's own
teardown) both appear in *every* successful run and need no action — recorded
here so a future debugging session doesn't waste time on them again.

## 5. First confirmed end-to-end success

**Job 3564897, 2026-09-21.** The full pipeline — structured KAOS requirement →
Lark parse → constraint extraction (`fog_density=50`) → constrained population
initialization → 10-individual × 2-generation real GE search, each individual
evaluated by 5 real CARLA falsification trials with real YOLOv5 perception →
persisted output — completed successfully on a Narval A100, with every fix in
§4 holding simultaneously for the first time. Result:

```json
{"run_id": "862e8b31b0ba4c2f80778a33a17c5dc1",
 "best_phenotype": "A { pedestrian : Child } wearing a {dress : Dark} dress
   trying to cross road from { direction : LR } at { distance : Long } distance
   on a day with fog density {fog_density : 50}",
 "STATUS": "OK"}
```

`generations.csv` (pulled back to
[`artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/generations.csv`](artifacts/runs/862e8b31b0ba4c2f80778a33a17c5dc1/generations.csv))
shows the search actually converging toward falsifying scenarios, not merely
completing without crashing: average fitness (percent of trials that *passed*,
i.e. did not falsify the safety property) dropped 26.0 → 16.0 → 10.0 across the
3 logged generations, with the minimum already at `0.0` (a fully falsifying
individual) in generation 0. This is the real signal that GRAPE's
elitism-based selection pressure is doing what it's supposed to.

Artifacts pulled back from Narval to this repo's own `artifacts/runs/` for
local review: `best_scenario.scenic` (the winning Scenic program),
`best_scenario.mp4` (a 355KB stitched video of the CARLA run), 26 raw
`front_rgb` PNG frames, `best_phenotype.txt`, `run_meta.json`. The full job
console log is at `artifacts/real-av-carla-3564897.out`.

Stages 1-5 of the target pipeline (§1) are now proven end-to-end against real
CARLA on real GPU hardware — closing the one gap Phase 1's own plan had flagged
as unverifiable in the development environment.

## 6. Standing constraints (carry forward, don't re-litigate)

- **No unapproved code edits** — explicit go-ahead required before any
  Write/Edit or file-mutating command, even "low risk" fixes. Every fix in §4
  was proposed and confirmed before being applied; the one exception requiring
  extra care was patching vendored third-party code (`Scenic/`), which got an
  explicit, separate confirmation after the issue was explained in detail.
- **Secrets in `infra/`** — `infra/credentials.json` and `infra/config.env`
  contain real, already-committed secrets. The scoped decision was packaging
  hygiene only: ship `.env.example` with placeholders, never commit real
  secrets going forward, but do **not** touch git history and do **not**
  rotate the already-compromised live credentials — that's a separate,
  higher-risk decision left to the user. The `.gitignore` itself documents this
  reasoning inline.
- **Secrets in chat** — if a real credential is ever pasted into a
  conversation, treat it as compromised immediately: have the user revoke/
  rotate it at the source, and enter any replacement only in their own
  terminal, never back into chat.
- **React UI** — explicitly deprioritized ("We can put the ReactUI aside for
  now. I am very interested in the full pipeline run with cleanliness and
  reproducibility!"). Not started, not planned until the user says otherwise.
- **Stages 6-9** — explicitly out of scope for this phase ("I will make
  obstacle-clustering secondary for now"). Planned, not implemented — see §7.

## 7. Next phase: stages 6-9 (failure diagnostics → requirement patches)

The remaining pipeline stages, as specified by the supervisor:

```
FAILURE MODEL
      │
      ▼
DIAGNOSTICS
      │
      ▼
OBSTACLE MODEL
      │
      ▼
MITIGATION MODEL
      │
      ▼
REQUIREMENT PATCHES
      │
      ▼
    HUMAN
      │
      ▼
REQUIREMENT R₁
```

This is a closed loop with a human in it, not a fully automated pipeline: the
system proposes requirement patches, a human reviews/accepts/edits them, and
the accepted result becomes a revised requirement `R₁` — which can itself be
fed back into stage 1 (Input DSL) for another iteration. That framing matters
for scoping: this phase is about generating good *candidate* patches and a
legible review surface, not  vabout closing the loop autonomously.

### 7.1 What already exists to build on

The stages 1-5 work in §2-§5 was deliberately designed so this phase doesn't
start from zero:

- **Failure Model input**: every real GE run already produces exactly the raw
  material a failure model needs — `generations.csv` (per-generation fitness
  trajectory), the MLflow backing store (per-individual params + fitness,
  keyed by run), and `best_scenario.scenic` + frames/video for the worst
  (most-falsifying) individual. A "failure model" for a completed run is
  substantially a structured read of data that's already being persisted, not
  new instrumentation.
- **Constraint vocabulary**: `constraints.py::CONTROLLED_VOCAB` and
  `parse_phenotype_params()` already establish the mapping between the DSL's
  free-text scenario description and the grammar's actual terminals
  (`direction`, `distance`, `fog_density`, `pedestrian`, `dress`). An obstacle
  model needs the same kind of structured vocabulary, just inverted: from a
  falsifying phenotype back to a named "obstacle class."
- **Run identity**: every run has a stable `run_id` and a `run_dir()` layout
  (§2.3) that a diagnostics/mitigation stage can key off without inventing a
  new storage scheme.

### 7.2 Stage-by-stage plan (draft — refine before implementation)

1. **Failure Model** — given a completed run's `generations.csv` + MLflow
   records, characterize *how* it failed: which phenotype parameters
   (pedestrian age/dress, direction, distance, fog density) correlate with low
   fitness (falsification) across the population, not just report the single
   best individual. This is a statistics-over-existing-data problem, not a new
   simulation capability — feasible to prototype without new CARLA runs, using
   the already-collected `862e8b31b0ba4c2f80778a33a17c5dc1` run (and future
   runs) as real test data.
2. **Diagnostics** — turn the failure model's correlations into a human- and
   machine-readable diagnosis: e.g. "the perception module's detection
   confidence degrades sharply when `fog_density=50` combined with
   `dress=Dark`," tying back to the specific KAOS requirement sub-goals
   (`"Detect Pedestrian" performed by "yolov5s"`) that the parsed requirement
   graph already names. This is where the KAOS structure of the input DSL
   (already parsed in stage 2, currently discarded after constraint
   extraction) becomes load-bearing again — worth revisiting whether more of
   the parse tree should be retained through to this stage rather than only
   the flat `constraints` dict.
3. **Obstacle Model** — formalize the diagnosed failure condition as a named,
   reusable "obstacle" (KAOS terminology: a condition that can prevent a goal
   from being satisfied), distinct from a one-off falsifying scenario. This is
   the piece the user explicitly deferred as secondary; it's also the piece
   most directly reusable as a contribution in its own right (a library of
   named obstacles per requirement class), so it's worth scoping early even if
   implementation waits.
4. **Mitigation Model** — given a named obstacle, propose a *class* of fix
   (e.g. "add a fog-density-conditioned confidence threshold override," "add a
   redundant sensing modality for low-visibility conditions"), not yet
   requirement text. Likely the highest-uncertainty stage — needs a small
   library of mitigation patterns mapped to obstacle classes, probably
   hand-authored initially rather than learned/generated, given the artifact
   deadline.
5. **Requirement Patches** — render a chosen mitigation as an actual textual
   diff against the original KAOS requirement DSL (stage 1's input format),
   so the human reviewer is looking at a concrete before/after requirement
   text, not an abstract recommendation.
6. **Human** — the review surface. Given the React UI is deprioritized, the
   first version of this should probably be the lowest-effort thing that lets
   a human accept/reject/edit a patch and re-trigger stage 1 with the result —
   plausibly a CLI or a single Streamlit page reusing the existing
   `pages/*.py` pattern, not new infrastructure.
7. **Requirement R₁** — the accepted patch becomes a new input DSL string,
   closing the loop back to stage 1. Whether this triggers a fully automatic
   re-run or requires an explicit re-submission is a product decision, not yet
   made.

### 7.3 Open questions to resolve before implementation starts

- How many real GE runs (across varied requirements, not just the pedestrian
  example) are needed before failure-model correlations are meaningful, versus
  overfit to one scenario? Worth deciding a minimum run count before trusting
  any diagnostic output.
- Is the obstacle vocabulary meant to be closed (a fixed taxonomy the tool
  ships with) or open (extensible per-project)? Affects whether §7.2 stage 3 is
  a lookup table or something more general.
- Does "cross-layer mitigation" (as named in the original pipeline spec) imply
  mitigations spanning perception + planning + control layers specifically, or
  is "cross-layer" describing something else the supervisor meant more
  precisely? Worth a direct clarifying conversation before committing to a
  design — this document's stage 4 framing is a placeholder pending that.

§7 was written before the 2026-09-23 session; §8 records what of it has now
been built and what the first real data showed.

## 8. 2026-09-23 — failure analysis (stages 6-7), the grid run, and what it found

### 8.1 Review findings that changed the plan

A fresh read of the whole codebase against the paper surfaced validity
problems the stages-1-5 work had not caught:

1. **The safety monitor scored distance to *every* object, including the
   roadside `VendingMachine`** (~3.5 m from the lane centre, ~12 m into the
   ego's path). Any drive-by tripped the 5 m rule regardless of the
   pedestrian. Fixed: `MyMonitor` now measures distance to `Pedestrian`
   objects only (matched by class name so `util.py` never imports the CARLA
   model). The old run 862e8b31's pass/fail numbers are therefore not usable.
2. **The requirement's operational content was ignored.** `"performed by
   "yolov5s""` and `"performed by "proportional_braking""` never reached the
   simulator; `scratch.temp` always ran the baseline emergency-braking car and
   the model came from Redis/default. Only the scenario sentence's keywords
   mattered. Fixed (see 8.4).
3. **`distance` had no effect in the search template** (position is a fixed
   random range; `get_pedestrian_angle` depends only on direction). Still
   true — recorded as a known limitation of `scratch.temp`, to be fixed with
   the scenario geometry (8.6).
4. **The "converging" claim in §5 was weak**: 32 possible phenotypes, 5 noisy
   trials each (scores only in steps of 20%), DEAP never re-scores unchanged
   individuals, tournament size 7 of 10, `ELITE_SIZE=0`. The drop 26→16→10 is
   selection keeping lucky noisy scores. For failure *analysis* an exhaustive
   grid (32 × 5) is both cheaper to reason about and fairer than GE.
5. **No seed** (`random.seed` was commented out). Fixed: `settings.random_seed`
   seeds DEAP and, per scenario (`seed + scenario_id`), Scenic's sampling;
   recorded in `run_meta.json`. CARLA itself is not fully deterministic.
6. **Φ_valid (admissibility) from the paper did not exist** in code. Built
   (8.3).
7. `DSL.get_perception_model()` always returned `None` (walked one nesting
   level too deep). Fixed; `get_operations()` / `get_module_for(task)` added.
8. The paper answers §7.3's "cross-layer" question: **data / model / system /
   requirement** layers (Sec. IV-C, M1–M5), not perception/planning/control.

### 8.2 Telemetry — what every simulation now records

`scripts/analysis/telemetry.py` (plain Python, no Scenic dependency) is
called from the scenario template and the monitor and writes
`<run>/simulations.csv` (one row per simulation) plus `traces/<scenario>_<sim>.json`
(full time series), appended as each simulation ends. Per row: scenario
settings, blueprint, braking mode, perception model, seed; pass/fail and rho;
closest distance to the pedestrian and the ego's speed there; steps/duration/
termination; max/final ego speed and whether it stopped; frames seen,
frames above the confidence bar, max confidence, first-detection step/
confidence/distance and ego speed then, mean inference time; first-brake
step/distance/speed, brake steps, reaction steps. Detection logging lives in
the template's own `perceive()` (same YOLO call and 0.85 rule as the vendored
`checkPedestrianDectectedFlag`, cached once per step) — no further vendored
patches were needed. Two robustness fixes rode along: `falsify()` no longer
loops forever when Scenic cannot create a simulation (gives up after
3×`num_test` attempts) and no longer drops rho == 0.

### 8.3 Laptop-side analysis (`python -m scripts.analysis.report <run_dir>`)

- `admissibility.py` + `admissibility_rules.json`: a scenario matching any
  rule is out of scope; its failures are *spurious*. Default rule matches
  nothing in old.bnf (the paper treats 50% fog as realistic). Rules also come
  from the requirement's new `assuming "..."` clause (8.5).
- `failure_model.py`: failure rate per setting (effect = rate with minus rate
  without; <15% treated as noise), per scenario, failure types
  (`never_detected`, `detected_not_braked`, `detected_too_late`,
  `brake_released`, `braking_insufficient`, `stopped_too_close`), a
  `no_encounter` outcome (never within 10 m and never detected — excluded
  from rates, *not* a pass), a `passed_stalled` outcome (safety rule held
  only because the car stopped short and timed out — counted as a pass,
  reported separately; added after round 2's first scenario, see 8.8), a
  timing summary (first-detection and first-brake distance vs stopping
  distance; the support bars — a ≥15-point effect with ≥10 encounters on each
  side for setting-based obstacles, ≥25% of the relevant events for
  behaviour-based ones — are a judgement call set on 2026-09-23, since with
  5 trials per scenario a single scenario's rate moves in 20-point steps;
  kept identical across rounds; not from the paper, not a significance test),
  a timing summary (first-detection distance vs
  stopping distance v²/2a + margin, a = 8 m/s²), and sanity warnings — the
  key one: *failures that do not vary with any grammar setting point at the
  scoring or the fixed scenario, not at the settings*.
- `obstacles.py`: the paper's three KAOS obstacles keyed on settings, plus
  behaviour-keyed `DetectionTooLate` and `BrakingNotLatched`, plus unnamed
  candidates for any other strong effect; each with candidate mitigations per
  layer (hand-authored from the paper's M1–M5). Verdicts: supported /
  not supported / insufficient data, with the numbers.
- `report.py`: writes `analysis_report.md/.json`, ends with a "For the
  human" checklist (confirm/rename/reject obstacles; keep/drop scope rules;
  pick a mitigation → requirement change).

### 8.4 The executor now runs the system the requirement describes

`scripts/simulations/util.py`: `configure(braking_mode, yolo_model)` sets
`RUN_CONTEXT`; `build_scenario()` splices one of `BRAKING_BEHAVIOURS`
(`emergency_braking` = baseline; `proportional_braking` = paper M4 via the
vendored `adjust_based_on_confidence`, 30%→85%) into `scratch.temp` at
`<ego_behavior>`; the perception model name is published to the Redis key
`model` right before the scenario compiles (that is how the vendored driving
model picks its weights — same key the Streamlit UI uses), after checking the
`.pt` exists in `model/`. `api_app.py::system_under_test_from(dsl)` reads
both from `"performed by"` and passes them to `run_grid` / `start_ge`;
`run_meta.json` records them. Both modes use the same `EGO_SPEED` (the legacy
`scenic_template.py` used 10 for proportional vs 8 for emergency — a
confound). Two Scenic behaviours are unit-tested to parse.

### 8.5 The `assuming` clause

Option chosen by the user over "put it in the scenario sentence": the DSL
grammar gained an optional `("assuming" assumption ("&" assumption)*)?` after
the scenario clause. Machine-readable assumptions (`fog_density <= 50`) invert
into out-of-scope rules (`fog_density > 50`); free text is shown to the human.
Requirements without the clause parse identically (tested). This is the
requirement-level mitigation's landing place for the loop: accepting "only
guaranteed below 50% fog" adds one `assuming` line and the next round's
analysis applies it with no rules-file edit.

### 8.6 First grid run with telemetry — job 3830258, run `35acc09e8c224fdc953e3bf82ba57e96`

Job 3803335 (first attempt) died in 92 s: `smoke_test.py` called the API
5 s after starting it, before uvicorn was listening (the source overlay on
`$SCRATCH` made the first import slower than in the baked-in image). Fixed
with a readiness poll (every 5 s, up to 10 min). Job 3830258 started
2026-09-23 ~20:05 local, API ready after 20 s, ~2.7 min per scenario.
**System under test: emergency braking + yolov5s** (the requirement text said
`proportional_braking`, but this run predates 8.4 — it is the baseline).

Completed 21:35 local (1 h 30 min, `STATUS: OK`); 160 simulations + 1
recorded video run; all files pulled to `artifacts/runs/35acc09e…/`
(`simulations.csv`, 161 traces, `best_scenario.{scenic,mp4}`, 32 frames,
`analysis_report.md`). Final numbers (`python -m scripts.analysis.report`):

- **120 true encounters, 40 no-encounter** (the random lane/heading sent the
  car away from the pedestrian — 40 of the 69 "passes" were not passes).
- **91 of 120 encounters failed (76%)**: `detected_too_late` 70 (77% of
  failures), `brake_released` 17 (19%), `braking_insufficient` 2,
  `stopped_too_close` 1, `never_detected` 1.
- The pedestrian **was detected** (>0.85) in 119 of 120 encounters — children
  and adults, fog or not. Median first detection at **7.0 m** while doing
  **7.2 m/s**; stopping needs ~8.2 m at that speed → 65% of detections too
  late. Braking lasted a median 6 steps (0.6 s) and then, because braking is
  tied to "currently detected", the car sped up again; still moving at the
  closest point in 70% of detected encounters. YOLOv5s inference 6.8 ms/frame
  on the A100.
- Setting effects on the full, balanced grid: `direction=LR` **+24%**
  (88% vs 64% — reported as an unnamed candidate obstacle; may be geometry:
  the `RL` heading of 180° relative to the road is "walking against traffic",
  which changes when/whether the pedestrian actually crosses), `dress=Dark`
  **+15%** (borderline), `pedestrian=Child` +8%, `fog=50` −9%, `distance`
  +7% (expected ~0: it does not move the pedestrian). At the 18/32 preview no
  setting had reached 15% and the sanity warning fired; on the full grid it
  did not — a reminder that the preview was LR-only.
- Verdicts: `DetectionTooLate` **supported** (77% of failures);
  `PedestrianClothingNotVisible` **supported** (just, +15%);
  `PedestrianSizeTooSmall` and `AdverseWeather` **not supported**;
  `BrakingNotLatched` not supported (19% < 25% bar) but present;
  `Candidate(direction=LR)` supported, for the human to name or reject.
  A different picture from the paper's E1/E4 (children, fog) — worth stating
  plainly rather than smoothing over.

Implications: the dominant obstacle is system-level (approach speed vs
detection distance vs a per-frame braking trigger), and the paper's M4 fix is
exactly the round-2 experiment: same requirement, now honoured
(`proportional_braking`), compared against this baseline (8.8). Also to fix
in the scenario itself: the no-encounter geometry (lane choice / heading —
25% of simulations wasted) and the dead `distance` parameter (8.1 item 3).

### 8.8 Round 2 — pre-registered prediction (written 2026-09-23 21:35 local, before submission)

**Design.** One variable: round 2 is round 1 with the requirement's
`performed by "proportional_braking"` honoured (paper M4: brake from 30%
confidence via `adjust_based_on_confidence`, full above 85%). Same
requirement text, seed (42), 32 scenarios × 5 trials, grammar (`old.bnf`,
byte-identical), template except the behaviour block (round 1's template was
fetched back from Narval and diffed: the only functional change is
`emergency_braking` → `<ego_behavior>` filled with `proportional_braking`; the
`perceive()` rewrite is the same YOLO call, cached once per step, which the
`interrupt when` already evaluated once per step). Template sha256: round 1
`497527fe36991f67…`, round 2 `89a952d0b417f83d…` (`grid.py` now records
`template_sha256`/`grammar_sha256` in `run_meta.json` for future rounds).
Round 1's `run_meta.json` predates the `system_under_test` field; its known value is
`{braking_mode: emergency_braking, yolo_model: yolov5s}`, to be supplied to
`scripts/analysis/compare.py --assume-a`. `compare.py` flags any other
metadata difference.

**Comparable metric.** Failure rate over *true encounters*, with the
no-encounter count reported separately per round (round 1: 23 of 88 at the
18/32 preview). Not "passes", not raw pass rate.

**Prediction.**
1. `DetectionTooLate` should **drop** (count and share): braking now starts
   at 0.30 confidence, so the first brake comes earlier and at a longer
   distance than the 0.85 bar allowed; the median first-brake distance should
   rise from ~6.3 m towards or past the ~8 m stopping distance, and the
   encounter failure rate should fall from ~83%.
2. `BrakingNotLatched` (`brake_released`) **may not drop**, and its *share*
   of the remaining failures may rise: releasing the brake when confidence
   falls below the trigger is a separate defect that proportional braking
   does not address (the trigger is still per-frame).
3. The paper's setting-based obstacles (`PedestrianSizeTooSmall`,
   `PedestrianClothingNotVisible`, `AdverseWeather`) are expected to stay
   *not supported*; if proportional braking removes the timing floor, a
   setting effect could emerge - that would be new evidence, not confirmation.
4. No-encounter count should be similar to round 1 (same seeds, same
   geometry); a large change would mean the comparison is not clean.

Submitted as **job 3843349** at 21:37 local, 2026-09-23 (overlay template
sha256 `89a952d0b417f83d…` verified on Narval before `sbatch`). Started
21:40, API ready after 15 s, scenario 1/32 at 21:44; run id
**`882fb2fe00bf4568bdb480a281db9e8b`**; its `run_meta.json` records
`system_under_test.braking_mode = proportional_braking`, `yolo_model = yolov5s`. Outcome to be
recorded in 8.9 by
```
python -m scripts.analysis.compare artifacts/runs/35acc09e8c224fdc953e3bf82ba57e96 artifacts/runs/882fb2fe00bf4568bdb480a281db9e8b \
  --assume-a system_under_test.braking_mode=emergency_braking --assume-a system_under_test.yolo_model=yolov5s \
  --assume-a template_sha256=497527fe36991f675652f5aca5b96c66ec6601ba37b52a2bd82af2ecd89242d9 \
  --assume-a grammar_sha256=6b9e9a970c6e79c42a8cd3367ec30f745f15913f0976b489e73a39e9c1b3bec4 \
  --allow "template_sha256=round-1 template fetched from Narval and diffed: only the <ego_behavior> block and the perceive() cache differ"
```
(`--assume-a` supplies metadata round 1's `run_meta.json` predates — the
values are the ones measured in 8.8; `--allow` records the one inspected,
justified difference so it is listed rather than flagged.)

**Early observation (scenario 0 only, 21:55, not the comparison):** round 1
scenario 0 (Adult, Light, LR, Short, fog 0): 4/5 failed, first brake at
5.3–6.5 m, brake value always 1.0, 2–3 brake steps. Round 2 same scenario:
5/5 passed the safety rule, first brake at **17–22 m**, fractional brake
values (0.03…0.72, then 1.0), 21–91 brake steps. *But* 3 of the 5 "passes"
are a new kind of outcome: the car braked to a **standstill 9–14 m from the
pedestrian and never moved again** (termination "reached time limit",
final speed 0). The pedestrian's `CrossingBehavior` waits until the car is
within 8 m before stepping out, so the two wait for each other — a standoff.
Only 1 of 5 was a genuine pass (stopped at ~8 m, pedestrian crossed, car
resumed); 1 was geometry (car drove away). This is the paper's own
observation that a mitigation can *shift* the failure mode (M1: "increasing
unnecessary braking") — here the soft goal (progress / smooth driving) fails
where the safety goal now holds. To be reported as a separate outcome
(`passed_stalled`) alongside no-encounter, not hidden inside "passed"; the
comparable metric (failure rate over encounters) is unchanged by it.
Re-running round 1 with the new outcome: 12 of its 29 passes were also
stalled (emergency braking freezes the car too while the pedestrian stays in
view), 17 drove on.

**Classification fix forced by round 2 (22:10):** the first partial round-2
report filed 62 of 85 simulations as `no_encounter` — wrong. With
proportional braking the car reacts at 0.30 confidence and stops 12–14 m
away, so the detector never crosses the 0.85 bar that `detection_frames`
counts, and the old rule ("never detected and never within 10 m") mistook a
car that had *braked to a halt because of the pedestrian* for one that never
met it. `no_encounter` now requires **no detection AND no braking**
(`reacted()`), and the timing summary uses the same notion. Round 1 is
unaffected (its car only ever braked on a detection). Recorded here because
it is exactly the kind of oracle/classifier assumption a mitigation round can
silently break — the "one variable" discipline surfaced it.

Note for reading the comparison: on the full round-1 grid, `direction=LR`
(+24%) and `dress=Dark` (+15%) did show effects, so prediction 3's "stay not
supported" is already wrong for clothing at round 1; the relevant question
for round 2 is whether those effects persist once the timing floor is lifted.

### 8.9 Round 2 — outcome (job 3843349, run `882fb2fe00bf4568bdb480a281db9e8b`, completed 23:24, 1 h 34 min)

`python -m scripts.analysis.compare` (round 1 → round 2; round 1's missing
metadata supplied with `--assume-a`, the template change allowed with a
recorded justification — see the command in 8.8):

| | round 1 (emergency) | round 2 (proportional) |
|---|---|---|
| simulations | 160 | 160 |
| no-encounter (excluded) | 40 | 32 |
| true encounters | 120 | 128 |
| **failures / failure rate** | **91 / 76%** | **4 / 3%** |
| passes that drove on | 17 | 11 |
| **passes that stalled (standoff)** | **12** | **113** (91% of passes) |
| detected_too_late | 70 | 1 |
| brake_released | 17 | 1 |
| stopped_too_close | 1 | 2 |
| median speed at first brake | 7.2 m/s | 2.0 m/s |
| median brake steps | 6 | 90 |
| detections too late | 65% | 1% |

Against the pre-registered prediction (8.8):

1. **`DetectionTooLate` dropped — confirmed** (70 → 1; verdict supported →
   insufficient data). First brake now comes at 17–22 m on low confidence;
   the car arrives at ~2 m/s instead of 7.2.
2. **`BrakingNotLatched` — partly as predicted.** Its *count* fell (17 → 1)
   because almost nothing fails any more; its *share* of the remaining
   failures rose (19% → 25%). With 4 failures in total no verdict is possible.
3. **Setting-based obstacles — as predicted, with the round-1 correction:**
   `PedestrianClothingNotVisible` went supported → not supported, the
   `direction=LR` candidate disappeared; child size and fog stay
   unsupported. Nothing setting-related survived the timing fix.
4. **No-encounter similar — confirmed** (40 → 32; same seeds, same geometry).

**Not predicted, and the real finding:** the safety failures did not vanish,
they moved. `StandoffUnnecessaryStop` went from 12 of 29 passes (41%) to
**113 of 124 (91%)**: the car brakes on 30% confidence from ~20 m, comes to a
halt 9–14 m short of the pedestrian, and — because the pedestrian's
`CrossingBehavior` only steps out once the car is within 8 m — the two wait
for each other until the time limit. The safety goal holds; the soft goal
(progress / smooth driving) fails; and part of the effect is a defect of the
test scenario (the 8 m trigger), which makes the soft-goal obstacle partly
unmeasurable. This is the paper's Sec. IV-C claim ("model adaptation alone
can shift failure modes rather than eliminate them") reproduced with a
system-level adaptation, and it is precisely the case the review step is
for: the requirement text never said the car must keep moving, so the
mitigation optimised that away. Round 3's requirement change should say it.

Three obstacles for the reviewer, then: `DetectionTooLate` (resolved),
`StandoffUnnecessaryStop` (persisting, now dominant), and
`crossing_trigger_8m` (a scenario artefact, not an obstacle). The decision is
genuinely the human's: accept the standoff as real (system fix: resume when
clear / timeout), reject it as artefact (fix the template, re-measure), or
refine the requirement (add the progress soft goal). `decisions.json` records
whichever is chosen; nothing is applied by the tool.

Caveats: one run per arm, 5 trials per scenario, CARLA not fully
deterministic; `stopped_too_close` 1 → 2 is noise at these counts; the
proportional arm spent most of its budget standing still, so its failure
statistics rest on very few events.

### 8.7a The iteration loop — what is built (22:50, 2026-09-23)

Following the reviewer's plan (file format first, page dumb, keep the CLI as
fallback):

1. **`scripts/analysis/decisions.py`** — the `decisions.json` schema
   (v1), `from_analysis()` (fills every tool field, leaves every human field
   null; computes each obstacle's status vs the previous round: new /
   persisting / resolved / absent), `validate()`, `is_complete()`,
   `save()`/`load()`. Verdicts: obstacle → accept / rename / reject; scope
   item → out_of_scope / in_scope / **scenario_defect** (a fifth category the
   paper's four layers lack: the test itself is wrong).
2. **`scripts/analysis/review.py`** — the terminal walk-through that writes
   it: one card per obstacle in support order (condition, evidence, status,
   timing medians, a representative trace path, the video), then the
   mitigation menu for accepted ones, then the scope items. `--answers FILE`
   replays prepared answers; `input_fn`/`output_fn` make it testable.
3. **Catalogue**: a `scenario` mitigation layer (DetectionTooLate: fixed
   approach speed / spawn distance; Standoff: the 8 m crossing trigger), and
   `SCENARIO_ARTEFACTS` — `crossing_trigger_8m`, `no_encounter_geometry`,
   `distance_parameter_dead` — offered in the scope section with their
   evidence metric and a suggested fix.

Dry-run on the real round-2 partial data + round 1 as previous: statuses
came out `DetectionTooLate: resolved`, `PedestrianClothingNotVisible:
resolved`, `StandoffUnnecessaryStop: persisting` (not "new": round 1 already
had 12 of 29 passes stalled = 41%, above the 25% bar; round 2 raises it to
87% — the mitigation made an existing minor mode dominant), others absent —
which is exactly the review a human is faced with.

Steps 4–6 (built 23:45, 2026-09-23; 85 tests):

4. **`scripts/analysis/refine.py`** — `decisions.json` → `R0.dsl`, `R1.dsl`,
   `requirement_diff.md`. `plan_changes()` maps each accepted mitigation to a
   labelled change: **[S]** a `performed by` swap from the `S_CHANGES` table
   (paper M1–M4 onto the requirement's module slots; flagged when the
   executor does not implement the module yet, e.g. `latched_braking`,
   `proportional_braking_with_resume`); **[R]** an `assuming` (ODD limit) or
   `ensuring` (soft goal) item from `R_CHANGES`; **[D]** a scenario/scope fix
   that is not requirement text. Scope verdicts map too (out_of_scope →
   `assuming` with the rule inverted; in_scope → drop the rule;
   scenario_defect → the suggested template fix). `apply_changes()` edits the
   text and the result must parse or nothing is written; a human-edited R1 can
   be passed as an override (also parse-checked).
5. **Grammar**: optional `("ensuring" soft_goal ("&" soft_goal)*)?` after
   `assuming` — the soft-goal slot the round-2 finding showed was missing;
   `get_soft_goals()`. The stray `print` in `get_scenario()` is gone.
   **Provenance**: `run_grid()` / `/run_grid` take `parent_run_id`, `round`,
   `requirement_source`, recorded in `run_meta.json` (volatile for
   `compare.py`). `decisions.json` gained a `defer` verdict.
6. **`pages/4_review.py`** — the offline Streamlit page (files only): header
   with this round vs the previous, obstacle cards with video + verdict /
   reason / mitigation, scope items, R0/R1 side by side with an edit box;
   Accept writes the same files as the CLI. Smoke-tested with Streamlit's
   `AppTest`. The CLI stays the fallback.

### 8.10 The first recorded review — PROPOSED, awaiting the human (23:50)

`python -m scripts.analysis.review` was run on round 2 with round 1 as the
previous round, reviewer **"Claude (proposed - to be confirmed by Paul)"**,
from a prepared answers file. The point is that the loop closes on a
*recorded* decision; these are the tool-operator's proposals, and the human
owner should confirm, change or overrule each before round 3:

| item | status | proposed verdict | mitigation |
|---|---|---|---|
| `StandoffUnnecessaryStop` | persisting (41% → 91% of passes) | **accept** | **requirement**: add the progress soft goal |
| `DetectionTooLate` | resolved (70/91 → 1/4) | accept (keep the name) | — |
| `PedestrianClothingNotVisible` | resolved (+15% → 0%) | accept (keep the name) | — |
| `BrakingNotLatched` | absent (19% → 1 of 4) | **defer** — too few events | — |
| `PedestrianSizeTooSmall` | absent in both rounds | reject | — |
| `AdverseWeather` | absent in both rounds | reject | — |
| `crossing_trigger_8m` | artefact | **scenario defect** | fix the template |
| `no_encounter_geometry` | artefact | scenario defect | fix the template |
| `distance_parameter_dead` | artefact | scenario defect | fix the template |

`refine.py` then produced **R1** = R0 plus one line:

```
    ensuring "vehicle resumes within 10 s once the crossing is clear"
```

— an **[R]** change only (the system already runs `proportional_braking`),
plus three **[D]** scenario fixes that are not requirement text. Files:
`artifacts/runs/882fb2fe…/{decisions.json, R0.dsl, R1.dsl, requirement_diff.md}`.

What round 3 needs before it can be launched: (a) the human's confirmed
`decisions.json` / R1; (b) the three `scratch.temp` fixes (the 8 m trigger
above all — without it the soft goal is unmeasurable), which are code
changes to approve; (c) an executor check for the soft goal (`ensuring` is
parsed but not yet evaluated — a `passed_stalled` outcome is the current
proxy, and `resumes within 10 s` can be measured from the traces); then
`/run_grid?...&parent_run_id=882fb2fe…&round=3&requirement_source=artifacts/runs/882fb2fe…/R1.dsl`.

### 8.11 2026-09-25 — requirement files, parse errors, labels (post-review hardening)

Done after the reviewer's notes on the requirement-language write-up:

- **Two reference requirement files** in `docs/examples/`:
  `requirement_full_example.dsl` (every clause the DSL has: `performed by`,
  `assuming`, `ensuring`) and `R0_rounds1_2.dsl` (the exact text rounds 1–2
  ran with, header comment noting it states no assumptions and no soft goals,
  and that round 1 ignored `performed by`). Both parse-checked by
  `tests/test_grammar.py::test_example_files_parse`. Side by side they are
  the honest documentation: the aspirational form and the one that ran.
- **The grammar ignores `#` comment lines** (`COMMENT: /#[^\n]*/`,
  `%ignore COMMENT`) so a `.dsl` file can carry a header. `compare.py`
  compares requirement text modulo comments and whitespace, so a file with a
  header is still "the same requirement" as the string in `run_meta.json`.
- **The requirement is no longer a bash string.** `run_real_av.slurm`'s
  `smoke_test.py` reads `REAL_REQUIREMENT_FILE` (default
  `docs/examples/R0_rounds1_2.dsl`) and posts it with `requirement_source`;
  `REAL_PARENT_RUN_ID` / `REAL_ROUND` / `REAL_TRIALS` pass through to
  `/run_grid`, so round 3 is one `sbatch --export=ALL,…` line and its
  provenance lands in `run_meta.json` automatically.
- **No more silent parse failure.** `DSL.parse_error` keeps Lark's message
  (line, column, what was found, what was expected); `/verify_requirement`,
  `/get_testcases` and `/run_grid` return
  `{"error": "requirement does not parse: …", "hint": …, "STATUS": "NOT OK"}`
  instead of nothing or a `NoneType` crash (`get_scenario()` on an unparsed
  requirement returns None). This is the defect that cost job 3803335's
  predecessor a Narval slot (obstacle 3) — closed at the entry point.
  `tests/test_api_errors.py` exercises the endpoint function directly.
- **Change labels** now match the talk everywhere: `[S]` we changed the car
  (`performed by`), `[R]` we changed the promise (`ensuring`), `[D]` we
  changed the assumptions (`assuming`), `[T]` we fix the test or scope rules
  (not requirement text). Round 2's `requirement_diff.md` re-generated:
  one `[R]`, three `[T]`.
- **Assumptions → scope rules, verified on real data through the clause
  itself**: round 1 re-analysed with `assuming "fog_density < 50"` added to
  the requirement text sets aside 80 simulations (16 scenarios, 42 failures)
  under the rule `assumption: fog_density < 50`. Saved, banner-labelled as a
  HYPOTHETICAL bound, next to the rules-file variant in
  `artifacts/runs/35acc09e…/hypothetical_fog_lt_50/`. The honest bound for
  round 3 remains `fog_density <= 50` (everything in scope).
- First-brake distance median added to the timing summary, the report and
  the comparison (7.0 m → 21.2 m) — previously quoted from chat only.

92 tests. Not yet committed at the time of writing (Paul commits; done in
roadmap M0, 2026-10-01).

### 8.12 2026-09-30 — domain assumptions: the missing third lever

**The gap.** The REAL loop can change three things: the car (`[S]`), the
promise (`[R]`, `ensuring`) and the domain assumptions (`[D]`, `assuming`).
Until now only the first two had been exercised. R0, the requirement rounds
1-2 ran with (`docs/examples/R0_rounds1_2.dsl`), states no assumptions at
all, so:

- every failure in rounds 1-2 is "valid" by construction — nothing could
  make it spurious;
- the paper's valid/spurious split (Φ_valid: "is this failure the car's
  fault, or did the world break a stated assumption?") has never run on
  real data;
- the 76 % (round 1) and 3 % (round 2) failure rates are rates under *no*
  assumptions, and must be quoted that way.

The only use of `assuming` so far was the fog < 50 % what-if of §8.11 —
deliberately labelled hypothetical, and a scope cut rather than an
assumption about how the world behaves.

**Decision (Paul, 2026-09-30)**, written up in
[docs/design/domain_assumptions.md](docs/design/domain_assumptions.md):

- A domain assumption is about the world (pedestrian, weather, road, start
  positions), **never about the car**. Assumptions about the car (e.g.
  `ego_speed`) are rejected with a message, otherwise failures could be
  defined away by narrowing the car's own behaviour.
- Each checkable assumption is marked per simulation as held / broken /
  **not measured**. A quantity that is not recorded is never counted as
  held.
- Each assumption gets a verdict from the data (load-bearing, not
  load-bearing, fewer failures when broken, insufficient data, untested,
  not measured), with the same 15-point / 10-per-side bars as the rest of
  the analysis — a stated judgement call, not a significance test.
- A loose baseline D0 (`fog_density <= 50`, `initial_separation_m >= 15`,
  `pedestrian_speed_mps <= 3`, plus free text) is added as
  `R0_with_D0.dsl` (renamed `R_baseline.dsl`, with soft goals too, in §8.13). Rounds 1-2 may be re-analysed against it only in a
  `baseline_D0/` subfolder labelled "D0 stated after the run"; R0 and the
  original reports are never rewritten.
- The reviewer can keep / tighten / loosen / drop / add assumptions;
  `refine.py` writes them as `[D]` changes. Loosening an assumption that
  was never broken ("untested") is flagged as having no evidence behind it.

**Steps**: (1) analysis side, laptop only — roadmap M1; (2) record
`pedestrian_speed_mps` / `crossing_start_distance_m` in the template, with
the 8 m trigger / no-encounter / dead-`distance` fixes — M2; (3) run 2b
under D0 — M3; (4) round 3 — M4. See
[docs/design/roadmap.md](docs/design/roadmap.md).

### 8.13 2026-10-01 — supervisor meeting and comparison with the paper

**From the meeting (Paul and supervisor):**

1. Previous runs had no domain assumptions. The baseline requirement must
   carry **both** slots — `assuming` (D) and `ensuring` (soft goals) — as in
   `docs/examples/requirement_full_example.dsl`. → `R_baseline.dsl`
   (roadmap M1.7), used by run 2b and every round after it.
2. After a run, that baseline is what separates **admissible** failures
   (every assumption held) from **spurious** ones (some assumption broken),
   i.e. Φ_valid computed from the requirement's own text. → M1.
3. Complete what the paper is about: D, S **and** R adjustable. Only S has
   been changed so far (round 2). → round 3 must record at least one D, one
   R and one S decision (M4.2).
4. Consider the latest YOLO model. → M2b. Today every detector is loaded
   with `torch.hub.load("ultralytics/yolov5", "custom", ...)` (vendored
   `Scenic/src/scenic/domains/driving/model.scenic`) and parsed with
   `results.pandas().xyxy` (`scratch.temp`), which only works for YOLOv5
   weights; newer models need `ultralytics.YOLO` and a different result
   format. The laptop venv has `ultralytics` 8.4.137 on Python 3.8; the
   container still has to be checked, and weights must be shipped in
   `model/` because Narval compute nodes have no internet.

**Rule adopted:** D and R changes only change how runs are judged, so they
are evaluated by re-analysing existing runs; only S changes need a new
Narval run, one change per run.

**Comparison with the paper** (arXiv:2606.31589), in
[docs/design/tool_paper_alignment.md](docs/design/tool_paper_alignment.md):
the tool automates what the paper did by hand (obstacle grouping) and adds
human decisions and provenance, but has so far used only the system layer,
never D or R, never GE in a round, and measures no smoothness although the
paper's soft goal is *SmoothBraking*. Added to the roadmap: smoothness
(jerk) and time-to-collision in M2.5; M4b runs for the model layer
(`yolov5m`, newer YOLO), the data layer (`fine_tune`) and one GE run; M6.0
paper outline now. Our findings differ from the paper's (no child effect;
detection too late dominates) — to be reported, not hidden.

### 8.14 2026-10-01 — M1.1-1.2: assumption vocabulary and classification

`scripts/analysis/admissibility.py` gained `QUANTITIES` (the quantities an
`assuming` item may name, each with level scenario/run, unit, source and
whether it is recorded yet) and `parse_assumption()` / `parse_assumptions()`,
which sort each item into **scenario** (checked against grid settings),
**run** (checked against per-simulation measurements), **free text** (shown
to the human) or **rejected** (about the car — any quantity starting with
`ego` — or unknown, with a message). Unrecorded quantities
(`pedestrian_speed_mps`, `crossing_start_distance_m`) carry a "will be
reported as not measured" note. Purely additive: `rules_from_assumptions` and
the report are unchanged until M1.3, so today the old hole remains —
`ego_speed <= 5` or `initial_separation_m >= 15` still become rules on
columns that do not exist and silently count as held. `tests/test_assumptions.py`,
8 tests; 100 in total.

**Decision (Paul, 2026-10-01):** assumptions are **checked after each run,
never imposed on the simulator** — exploring outside them is how the loop
learns whether an assumption matters (the paper keeps scenario exploration
and Φ_valid apart, §IV-A). Tightening the scenario grammar to an agreed
assumption is a possible later, deliberate per-round choice ("the grammar is
an evolving artefact"), deferred. The hand-written `admissibility_rules.json`
stays as the test-scope (`[T]`) lever, separate from the requirement's D.

### 8.15 2026-10-01 — M1.3: assumptions checked per simulation

`admissibility.py`: `add_run_quantities()` (adds `initial_separation_m` =
first `distance_m` of each trace; NaN when the trace is missing),
`assumption_status()` (held / broken / not measured) and
`check_assumptions()` (one `assumption::<text>` column per checkable item;
only **broken** sets a simulation aside, with reason `assumption: <text>` —
the same wording as before, so earlier reports and decisions files still
line up). `report.analyse()` now uses these instead of
`rules_from_assumptions` (kept, marked unused). This **closes the hole** noted
in §8.14: an assumption about the car is listed as REJECTED and sets nothing
aside; an unrecorded quantity is "not measured" and sets nothing aside. The
rules file is still applied first, as the separate `[T]` lever. The report's
Scope section lists every assumption with its counts, and says explicitly
when the requirement states none. JSON: `admissibility.assumptions`.
14 tests in `tests/test_assumptions.py`; 106 in total. No saved report was
regenerated.

Smoke check (in memory, nothing written; R0 + the D0 `assuming` line patched
into `run_meta` for the call): round 1 `35acc09e…` — `fog_density <= 50`
held 160 / broken 0; `initial_separation_m >= 15` held 154 / broken 6;
`pedestrian_speed_mps <= 3` not measured 160. Round 2 `882fb2fe…` — 160/0;
152/8; not measured 160. Matches the 6 / 8 in the design doc. The saved,
labelled re-analysis is M1.8.

### 8.16 2026-10-01 — M1.4: per-assumption verdicts, soft goals in the report

`admissibility.assumption_verdicts()` compares, over real encounters only,
the failure rate when each assumption held vs when it was broken, with the
analysis' usual bars (`failure_model.MIN_EFFECT` 15 points, `MIN_N` 10 per
side): load-bearing / not load-bearing / fewer failures when broken /
insufficient data / untested / not measured. The report's Scope lines carry
the verdict and both rates, plus a one-line legend ("a judgement call, not a
significance test"). `requirement_context` now also returns `soft_goals`; the
Overall section lists each `ensuring` item as "not checked automatically yet
(roadmap M2.5)", points at stalled passes when there are any, and says so
when the requirement states none. 19 tests in `tests/test_assumptions.py`;
111 in total. No saved report regenerated.

Smoke check (in memory, nothing written; R0 + D0 line patched into
`run_meta`): round 1 — `fog_density <= 50` untested (never broken);
`initial_separation_m >= 15` **untested over encounters**: all 6 runs that
started closer than 15 m were no-encounter runs; `pedestrian_speed_mps <= 3`
not measured. Round 2 — fog untested; separation **insufficient data** (2
of the 8 close starts were encounters, both passed; held 126 at 3.2 %
failures); speed not measured. So rounds 1-2 give **no evidence for or
against any D0 assumption** — another reason the scene fixes (M2) and run 2b
come before any loosening. The saved, labelled version is M1.8.

### 8.17 2026-10-01 — M1.5-1.6: reviewing assumptions and writing [D] changes

- **decisions.json** gains optional `assumptions` (one item per stated
  assumption, incl. free text and rejected: verdict keep / tighten / loosen /
  drop, `new_text`, the tool's verdict, evidence, reason) and
  `added_assumptions`. Schema version stays 1; older files load unchanged.
  Spurious groups caused only by broken assumptions are no longer repeated
  under `scope` — they are reviewed once, as assumption items; rules-file
  groups stay in scope (`[T]`). `validate` refuses an unknown verdict,
  tighten/loosen without new text, and new or added text about the car;
  `is_complete` needs a verdict on every assumption.
- **refine.py** `assumption_changes()` implements the design table ("in R0"
  = in the run's own `assuming` clause): keep → nothing / added if stated
  after the run; tighten, loosen → replaced / new text added; drop → removed /
  nothing; added → added. `apply_changes` now replaces and removes items.
  `requirement_diff.md` (and the page) flag loosening an *untested*
  assumption as "no evidence behind it". `plan_changes(doc, r0)` takes R0.
- **review.py**: an ASSUMPTIONS (D) section after scope; "Add an assumption"
  is asked only when the requirement states assumptions (so the existing
  interactive flow is unchanged); `--answers` takes `assumptions` and
  `added_assumptions`.
- **pages/4_review.py**: a "Domain assumptions (D)" box per item on screen 4
  (verdict, new text, reason, the untested-loosen warning) and a text area
  to add assumptions; saved choices survive a reload.

`tests/test_assumption_review.py`, 6 tests (incl. every row of the design
table and an AppTest Accept that writes a `[D]` R1); 117 in total. No saved
decisions or R1 regenerated.

### 8.18 2026-10-01 — M1.7-1.8: the baseline requirement, rounds 1-2 re-judged (M1 complete)

- `docs/examples/R_baseline.dsl`: R0's system (`yolov5s`, `proportional_braking`)
  + `assuming "fog_density <= 50" & "initial_separation_m >= 15" &
  "pedestrian_speed_mps <= 3" & "daylight, dry road" & "pedestrian on foot"`
  + `ensuring "vehicle resumes within 10 s once the crossing is clear" &
  "braking is smooth unless an emergency stop is needed"` (text only until
  M2.5). Parse-checked in `test_example_files_parse`. Used from run 2b on.
- `report.py` can re-judge a finished run: `--requirement FILE --out DIR
  --banner TEXT` (`analyse(..., requirement=)`, `write_report(..., out_dir=,
  banner=)`); it refuses to write into the run folder itself, so an original
  report is never overwritten; `run_meta.requirement_as_run` keeps the text
  the run used. 2 tests; 119 in total.
- Re-judged rounds 1-2 into `artifacts/runs/<run>/baseline_D0/`
  (`analysis_report.{md,json}` with a banner, and
  `requirement_judged_against.dsl` = the text each run **actually** ran with
  + the baseline `assuming`/`ensuring` lines — not `R_baseline.dsl` itself,
  because round 1 ran emergency braking). Commands:
  `python -m scripts.analysis.report artifacts/runs/<run> --requirement
  artifacts/runs/<run>/baseline_D0/requirement_judged_against.dsl --out
  artifacts/runs/<run>/baseline_D0 --banner "Assumptions stated AFTER the run: …"`.

**Result (from the saved files):**

| | as run (R0, no assumptions) | re-judged with D0 (stated after) |
|---|---|---|
| Round 1 `35acc09e…` | 160 sims, 120 encounters, 91 failed (75.8 %), 12 stalled | 154 in scope, 120 encounters, 91 failed (75.8 %), 12 stalled |
| Round 2 `882fb2fe…` | 160 sims, 128 encounters, 4 failed (3.1 %), 113 stalled | 152 in scope, 126 encounters, 4 failed (3.2 %), 113 stalled |

Set aside: round 1 — 6 simulations (`initial_separation_m >= 15` broken), all
no-encounter, 0 failed; round 2 — 8 (2 of them encounters, both passed).
Supported obstacles unchanged in both rounds. Verdicts: fog untested;
separation untested (round 1) / insufficient data (round 2); walking speed not
measured.

**Reading:** under the baseline assumptions, **every failure in rounds 1-2
stays a real requirement violation** — none is explained away by a broken
assumption. The car's failures are the car's. Equally, the rounds give **no
evidence** for or against any D0 assumption (none was broken often enough in
real encounters), so nothing may be loosened on their strength. That needs
the fixed scene (M2) and run 2b. **M1 is complete.**

### 8.19 2026-10-01 — M2 diagnosis of the test scene (read-only, before any change)

From `scripts/scenarios/scratch.temp`, `scripts/templates/old/scenic_template.py`
and the vendored `CrossingBehavior` (`Scenic/src/scenic/simulators/carla/behaviors.scenic`),
plus the round 1-2 traces:

1. **8 m trigger.** `PedestrianBehavior` → `CrossingBehavior(ego, 2.0, THRESHOLD=8)`:
   the pedestrian waits until the car is within 8 m, then steps out. At
   7.5 m/s the car needs ~8 m to stop, so detection-too-late is built into
   the scene; and once a cautious car stops >8 m away the pedestrian never
   moves — the round-2 standoff (§8.9).
2. **`RL` is not a crossing.** `get_pedestrian_angle`: LR → heading 90°, RL →
   180° relative to the road, i.e. RL walks along the road towards the car,
   not across it; both start 0.5 m left to 3 m right of the lane centre
   (`LATERAL_RANGE`). The round-1 `direction=LR` +24 points effect is
   therefore at least partly a scene artefact, not a perception finding —
   to be stated in the paper. (Scenic convention assumed: local x to the
   right, y forward, positive heading = to the left; to be confirmed on the
   smoke-run video.)
3. **`distance` does nothing.** It only feeds `get_pedestrian_angle`, where
   Long and Short give the same angle; it never reaches the template.
4. **No-encounter runs drive away.** In round 1's 40 no-encounter runs the
   car-pedestrian distance *grows* from the start (e.g. 21 → 36 m) or the car
   barely moves; median closest approach 18.6 m (min 13.6). Spread over all
   direction/distance cells (LR-Long 15, LR-Short 6, RL-Long 8, RL-Short 11),
   so not a direction effect. Likely cause: the car is placed `following
   roadDirection from spot for -15` and then follows *its own* lane, which
   need not be the pedestrian's lane (`lane = Uniform(*network.lanes)`).
   Cause probable, not proven.
5. **Not recorded:** pedestrian speed, when the pedestrian starts, braking
   smoothness, time-to-collision, whether/when the car moves on again.

### 8.20 2026-10-01 — M2: scene v2 (code; Narval check pending)

Fixes for §8.19, all in the template and its filler, recorded per run:

- `scratch.temp`: `CROSSING_TRIGGER_M`, `EGO_START_M`, `PEDESTRIAN_SIDE`
  placeholders; the pedestrian starts at a kerb (`KERB_OFFSET_M` 3 m ± 0.3,
  ±1 m along the road) and walks across at ±90°; `require ego.lane == lane`;
  `record pedestrian.speed`; termination = the car is 20 m past the crossing
  point (the old `distance to spot > 30` would end Long runs at once).
- `util.py`: `SCENE_VERSION = 2`, `DIRECTIONS` (LR = left kerb, heading −90°;
  RL = right kerb, +90°, driver's view), `EGO_START_M` (Short 20 m, Long 35 m),
  `DEFAULT_CROSSING_TRIGGER_M = 100` (start at once; `CrossingBehavior` paces
  the walk to meet the car, so no built-in standoff), `MAX_STEPS = 250` (25 s;
  was 100 = 10 s, too short to observe a 10 s resume goal — runs on average
  get longer, budget Narval time accordingly), `scene_settings()`; the
  monitor passes the pedestrian speed series on. `get_pedestrian_angle`
  (old template module) is no longer used.
- `telemetry.py`: `motion_metrics()` → `pedestrian_speed_mps`,
  `crossing_start_distance_m`, `peak_decel_mps2`, `peak_jerk_mps3`,
  `min_ttc_s`, `first_stop_step`, `resumed`, `resume_after_s`,
  `resume_within_s` (0 never stopped / seconds / inf = standoff), plus
  `ego_start_m`, `crossing_trigger_m`; traces gain `pedestrian_speed`.
  `run_meta.scene` (grid and GE) records version, step cap and geometry, so
  `compare.py` flags a scene change between rounds.
- `soft_goals.py`: `ensuring` items checked per in-scope encounter (met /
  missed / not measured) on `resume_within_s`, `peak_decel_mps2`,
  `peak_jerk_mps3`, `min_ttc_s`; free text listed. `pedestrian_speed_mps` and
  `crossing_start_distance_m` are now "available" assumption quantities
  (older runs: not measured). `R_baseline.dsl` → `ensuring "resume_within_s
  <= 10" & "braking is smooth unless an emergency stop is needed"` (jerk is
  measured; the threshold is a requirement decision, left to Paul).
  `clear_lateral_m` dropped (needs a lateral recording).

`tests/test_scene_v2.py` (9: geometry, the template parses with Scenic,
motion measures on hand-made series, CSV/trace columns, soft goals); 128 in
total. **Not yet run in CARLA**: `ego.lane == lane`, the kerb geometry and
the termination expression are only checked by the Narval smoke run (M2.7),
including one video per direction.

**Decision (Paul, 2026-10-01): GE is the main search from here on**, after
the scene fixes — roadmap M2c (GE-ready grammar with numeric ranges, GE via
Slurm, analysis aware of uneven sampling).

### 8.7 The iteration loop (stages 7-9) — original design

Per round: requirement R_n → run (grid) → `simulations.csv` → report →
**human** records decisions in a `decisions.json` (accept/rename/reject each
obstacle; keep/drop each scope rule; pick a mitigation) → tool proposes R_{n+1}
as a side-by-side text change (`performed by` module for system/model/data
fixes; `assuming` line for requirement-level scoping) → human accepts/edits →
next round, whose report compares against the previous round; every
`run_meta.json` records `parent_run_id`. Stopping is the human's call; the
tool shows the signals (no supported obstacles, rate under a threshold, no
change over two rounds). Still to build: `decisions.json` + review CLI, the
requirement writer, the round-to-round comparison, run lineage.
