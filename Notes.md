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
previous round, reviewer **"scripted review (proposed - to be confirmed by Paul)"**,
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

### 8.21 2026-10-01 — scene v2 smoke run submitted (job 4354082)

Job 4353379 (submitted 00:34 the same day) was cancelled by Paul before it
started: it had been rsynced from the Sep 23 staging copy (no scene v2, no
`docs/examples/`), so with the new job script it would have failed on the
missing requirement file. Staging copy rebuilt from commit `c28cdb4`
(scene v2), rsynced (verified on Narval: `CROSSING_TRIGGER_M` in
`scratch.temp`, `SCENE_VERSION = 2`, `soft_goals.py`, all three `.dsl`
files), and the smoke run submitted as **job 4354082**:
`REAL_REQUIREMENT_FILE=docs/examples/R_baseline.dsl, REAL_TRIALS=1` (32
scenarios x 1). Pass criteria: infra/hpc/README.md "Scene v2 smoke run".

### 8.22 2026-10-01 — M2c.1: the GE grammar for scene v2

- `scripts/templates/v2/scene_v2.bnf` (old.bnf unchanged, still the grid
  grammar): pedestrian, dress, direction as before; `fog_density` 0-100 in
  steps of 10; `approach_distance_m` 10/15/20/25/30/35/40/50;
  `pedestrian_min_speed_mps` 1.0/1.5/2.0/2.5/3.0/4.0; `crossing_trigger_m`
  8/15/20/30/100 — **21,120 scenarios** (old.bnf: 32, too few for GE). Ranges
  agreed with Paul. They go **beyond the baseline assumptions on purpose**
  (fog > 50, start < 15 m, faster than 3 m/s), so GE runs produce the
  broken-assumption cases rounds 1-2 never had and the D verdicts get
  evidence; the old 8 m trigger stays as one value so its effect can be
  measured.
- `util.scene_settings()` takes the numeric settings when a scenario gives
  them, otherwise `distance` Short/Long and the defaults (`NUMERIC_SETTINGS`,
  `DEFAULT_PEDESTRIAN_MIN_SPEED_MPS = 2.0`), so old.bnf / grid behave as in
  §8.20. `scratch.temp`: `PEDESTRIAN_MIN_SPEED = <pedestrian_min_speed_mps>`
  (was fixed 2.0; `CrossingBehavior` walks faster than this to meet the car).
- **Renamed `ego_start_m` → `approach_distance_m`** everywhere in code (a
  start position is part of the scene; names starting with `ego` are refused
  as assumptions). The loader maps the old column name, because the smoke run
  job 4354082 was rsynced before the rename and writes `ego_start_m`.
- New scene-level assumption quantities: `approach_distance_m`,
  `crossing_trigger_m`, `pedestrian_min_speed_mps`; telemetry column
  `pedestrian_min_speed_mps`; `run_meta.scene` includes its default.

`tests/test_ge_grammar_v2.py` (5: space size and ranges, GRAPE samples v2
phenotypes that build and parse in Scenic, old.bnf meaning unchanged, the
settings are checkable assumptions, the smoke-run column alias); 133 in total.
Next: M2c.2 (GE through the Slurm job), M2c.3 (analysis aware of GE's
uneven sampling).

### 8.23 2026-10-01 — M2c.2: GE through the Slurm/requirement path

- **Two bugs fixed that would have broken a GE run on scene_v2.bnf:**
  (1) GE scenarios were labelled with their full phenotype text, which is the
  trace file name — scene_v2 phenotypes contain "m/s", so the first trace
  write would fail; now `util.scenario_label()` = `g` + 10 hex of the SHA-1
  (full text stays in `phenotype`). (2) A GE run wrote `run_meta.json` only at
  the end, so a run cut off by the time limit recorded nothing about what it
  tested; now `run_output.write_meta()` at the start (`status: running`) and
  `persist_run` completes it (`status: complete`, `completed_at`).
- `util.evaluate` (GE fitness): trials per individual from
  `GE_SETTINGS` (`configure_ge(trials)`, was a fixed 5) and a per-run cache —
  a scenario GE already simulated is not simulated again.
- `ge.start_ge(..., trials, parent_run_id, round_no, requirement_source)`;
  early meta records mode `ge`, grammar file + sha256, template sha256, scene,
  system under test, population, generations, trials per individual and a
  `sampling` caveat ("not sampled evenly").
- `/get_testcases`: `trials`, `grammar_file` (default `v2/scene_v2.bnf`),
  `record_video`, `parent_run_id`, `round`, `requirement_source`;
  `sample=true` unchanged.
- `run_real_av.slurm`: `REAL_SEARCH=grid` (default, unchanged) or `ge` with
  `REAL_GRAMMAR` (v2/scene_v2.bnf), `REAL_POPULATION` (16),
  `REAL_GENERATIONS` (6), `REAL_TRIALS` (2); prints what it requests.

`tests/test_ge_slurm.py` (6, incl. executing the job script's Python block
with a fake `requests`); 139 in total. Budget: at most population x
(generations + 1) new scenarios x trials (16 x 7 x 2 = 224 simulations),
fewer with reuse; the final sizes wait for the smoke run's time per
simulation. Next: M2c.3 (analysis aware of GE's uneven sampling).

### 8.24 2026-10-01 — M2c.3: analysis aware of GE's uneven sampling; grid check

GE breeds scenarios towards failure, so on GE data failure rates are biased
upward and settings that travel together look like effects. Now:

- **Sampling banner** at the top of every report (`report.sampling_of`,
  from `run_meta.mode`): "balanced grid" / "a chosen list" / "GE search -
  bred towards failure … leads to confirm, not findings", with the number of
  distinct scenarios and the most repeats of one.
- **Each scenario counted once** (`failure_model._scenario_rate`):
  `failure_rate_scenarios` overall and `scenario_effect` per setting, shown
  next to the per-simulation numbers on GE runs.
- **Numeric settings in the effects table**, split at the grammar midpoint
  (`BANDS`: fog 50, approach 25 m, walking speed 2.0 m/s, trigger 20 m) when
  a setting has more than two values; old.bnf's fog 0/50 keeps its values.
  Fixed on the way: grouping by scenario dropped every row when a run lacked
  the new numeric columns (`groupby(..., dropna=False)`, unused settings left
  out).
- **Supported obstacles on GE data** are shown as "SUPPORTED (GE lead -
  confirm on grid)" in the report, the CLI review and the page
  (`obstacles.verdict_label`); the stored verdict is unchanged.
- **Grid check** (`scripts/analysis/grid_check.py`): picks GE's worst and
  safest distinct scenarios (default 4 + 4), writes
  `<ge_run>/grid_check/scenarios.txt` + `selection.json`; the job runs them
  equally often with `REAL_SEARCH=list REAL_SCENARIOS=… REAL_TRIALS=3`
  (`run_grid(phenotypes=…)`, mode `list`, `/run_grid?scenario_file=`); then
  `--compare <check_run>` writes `grid_check_comparison.md` (GE rate vs
  repeat rate per scenario, and whether each GE-supported obstacle holds).
  Size cut from 8 + 8 x 5 to 4 + 4 x 3 = 24 simulations (Paul), because a
  scene-v2 simulation takes ~3 min on Narval (smoke run, partial).
- The stalled-pass warning no longer blames the 8 m trigger outside scene v1.

`tests/test_ge_analysis.py` (10); 149 in total. No saved report regenerated.

### 8.25 2026-10-01 — scene v2 smoke run result (job 4354082): not yet a valid scene

Run `130e0c8b8b974f0eac6c4f7c76ee510f`, pulled complete; full write-up in
`artifacts/runs/130e0c8b…/smoke_check.md`, report in `analysis_report.md`
there. Passed: STATUS OK, new columns filled, no-encounter 1/32 (was ~25 %),
`distance` works (initial separation Short 20.0 m / Long 34.9 m). **Failed:
the video shows the car steering over the kerb and stopping on the pavement**
(frames 8-14 of the Child/Dark/RL/Short re-run), pedestrian never in view;
frame 1 has the yellow centre line on the car's right. Probable cause: the
car's heading (`following roadDirection from spot`) is opposite to its lane's
direction, and FollowLaneBehavior turns it off the road — possibly also the
cause of rounds 1-2's no-encounter runs. Also: braking starts at ~20 m (as
soon as a person is visible above 30 %) and lasts most of the run; 13 stalled
passes; pedestrian top speed > 3 m/s in 7 runs (CrossingBehavior speeds the
walker up); deceleration / jerk values implausible (21 m/s^2, 214 m/s^3) —
kerb impacts or spawn transient. Timing: 1 h 23 min for 32 simulations
(~2.6 min each). Check script (run from the repo root):
`failure_model.add_failure_types(load_simulations(run))` +
`admissibility.add_run_quantities`, grouped by distance / direction. Not a
valid baseline until the placement is fixed and re-smoked.

### 8.26 2026-10-01 — fix for the off-road car (scene v2.1), second smoke run

- `scratch.temp`: everything placed along the chosen lane's own direction —
  `spot = new OrientedPoint on lane.centerline, facing lane.orientation`;
  vending spot and car `following lane.orientation`; pedestrian heading
  `spot.heading ± 90°` (no `roadDirection` left in the code);
  `require abs(relative heading of ego from spot) < 20 deg`;
  `record (ego.position in network.drivableRegion) as "on_road"`.
- telemetry: `left_road`, `left_road_step`; deceleration / jerk skip the first
  `SETTLE_STEPS = 10` (1 s, spawn jolt) and any step off the road.
- analysis: outcome `left_road` = a test defect, excluded from every rate like
  `no_encounter` (`NOT_ENCOUNTERS`), with a warning ("fix the scene before
  reading anything else") and a line in the report.
- 3 new tests in `tests/test_scene_v2.py`; 152 in total. The heading check and
  `drivableRegion` only parse-checked locally; the second smoke run is the test.
  Pass now also needs `left_road` False in every row and the video car on the road.
  Staging copy rebuilt and rsynced (verified on Narval); **second smoke run = job
  4385790** (`R_baseline.dsl`, 1 trial per scenario).

### 8.27 2026-10-06 — smoke run 2 failed at compile; off-road hypothesis rejected

- **Job 4385790 failed after 4 min** (2026-10-01 10:19-10:23): `/run_grid`
  returned `facing x with x not a heading or orientation (expected
  Orientation, got VectorField)` — `spot = new OrientedPoint on
  lane.centerline, facing lane.orientation` (§8.26) is not valid in this
  Scenic. The local tests only *parse* the template, which cannot catch it.
  (My background watcher had reported the job "gone" at 15:01 that day only
  because the SSH connection had expired; the job had in fact ended at 10:23.)
- **Local compile check now possible without CARLA**: build the scenario with
  the repo's map (`Scenic/assets/maps/CARLA/Town01.xodr`) and stand-ins for
  `carla`, Redis and `torch.hub.load`, then sample scenes. It reproduces the
  Narval error exactly. Two working alternatives, sampled in both directions
  (4 scenes each): `crossing = new Point on lane.centerline` then
  `spot = new OrientedPoint at crossing, facing lane.orientation[crossing.position]`
  (or `following lane.orientation from crossing for 0.1`) — car aligned with
  its lane (0°), 20 m before the crossing; LR pedestrian on the left facing
  −90°, RL on the right facing +90°.
- **The "car faces against its lane" explanation of the off-road run (§8.25)
  is rejected**: with the smoke-run-1 placement (`roadDirection`), the car
  faced along its lane in 40 of 40 sampled scenes. The cause of the car
  leaving the road is **unknown**; candidates: the lane-following controller
  itself, the map version on Narval vs the repo copy, or something at the
  crossing point. It may be the same thing that produced rounds 1-2's
  "drives away" runs. Scratch scripts: compile_scene.py, try_variants.py,
  old_placement.py (session scratchpad; to be turned into a test).

### 8.28 2026-10-06 — step 1: working placement, laptop check, off-road recordings

- `scratch.temp`: `crossing = new Point on lane.centerline` +
  `spot = new OrientedPoint at crossing, facing lane.orientation[crossing.position]`
  (variant B of §8.27). New per-step records: `ego_heading`, `lane_heading`
  (= `spot.heading`), `lane_offset_m` (`distance from ego to lane.centerline`),
  to find why a car leaves the road. These record expressions can only be
  exercised in a real simulation (smoke run 3).
- telemetry: `max_heading_off_lane_deg`, `max_lane_offset_m` per row; the
  traces keep `on_road`, `ego_heading`, `lane_heading`, `lane_offset_m` series.
- **`tests/test_scene_compile.py` — the laptop check**: compiles the real
  template against `Scenic/assets/maps/CARLA/Town01.xodr` with stand-ins for
  `carla` / Redis / `torch.hub.load`, samples 3 scenes for each of LR/RL x
  Short/Long and checks the car is within 20° of its lane, the pedestrian is
  ahead at the chosen distance (±2.5 m), at its kerb and facing across. ~6 s.
  Would have caught smoke run 2's error before submitting.
  Staging copy rebuilt and rsynced (verified on Narval); **smoke run 3 = job
  4779526** (`R_baseline.dsl`, 1 trial per scenario), submitted 2026-10-06.
  157 tests in total. Rule from now on: run it before every Narval submission.

### 8.29 2026-10-06 — M2b.1: newer YOLO choice (read-only check)

The laptop venv's `ultralytics` 8.4.137 (Python 3.8) ships model configs for
YOLO26, YOLO12, YOLO11, v10, v9, v8, v5 (+ RT-DETR). `YOLO("yolo26s.pt")`
downloaded the official weights (v8.4.0 release asset, 19.5 MB) into the
session scratchpad (not the repo) and ran on three frames of the scene-v2
smoke run 1 video: ~80-140 ms per frame on the laptop CPU, no person found
(those frames show the car on the pavement with no pedestrian in view, so
this is a load-and-run check, not an accuracy result). **Proposed choice:
YOLO26s** (newest family that runs on our Python 3.8; "s" = same size class
as yolov5s, so the comparison is like for like). Still open: the
container's ultralytics version on Narval, and the loader in the vendored
driving model / `scratch.temp` (today `torch.hub` YOLOv5 only) — roadmap M2b.2-2b.5.

### 8.30 2026-10-06 — demo mode and Docker image (ICSE: "do not expect reviewers to build your code")

- `scripts/demo.py` (`python -m scripts.demo [--page]`, console script
  `real-demo`): copies `examples/demo_runs/` (rounds 1 and 2 as run on
  Narval, 9.4 MB: run_meta, simulations/scenarios csv, traces, the video; no
  raw frames, no analysis outputs) into a fresh output folder (never reused)
  and runs every laptop-side step: both reports, the round 1 → 2 comparison
  (round-1 metadata and the inspected template difference as in §8.8),
  round 2 re-judged against the baseline assumptions, a scripted review
  (`examples/demo_runs/review_answers.json`, reviewer labelled "demo
  (scripted review …)"), and the requirement writer. ~6 s. Output matches the
  published numbers (91/120; 4/128 with 113 standoffs). `--page` serves the
  review page on the result.
- `Dockerfile` (python:3.8-slim, 730 MB) + `.dockerignore` (allow-list: only
  the laptop-side code, the templates, the example requirements and the
  demo runs) + `requirements-demo.txt` (pandas, numpy, lark, pydantic 1.x,
  streamlit, pinned as tested). `docker run --rm -p 8501:8501 real-demo` runs
  the demo and serves the page on 0.0.0.0. Checked: the container prints the
  loop and `/_stcore/health` answers `ok`; all 5 review screens render inside
  the container (Streamlit AppTest, no exception).
- `tests/test_demo.py` (2: the loop's files and numbers, the bundle is left
  byte-identical, an existing output folder is refused); 159 in total.
  README "Try it in 5 minutes" at the top. Still to do for the submission:
  publish the image (GHCR / Docker Hub) and archive it with the Zenodo DOI;
  once run 2b and round 3 exist, add them to the bundle so the demo shows a
  D/S/R round.

### 8.31 2026-10-06 — smoke run 3 (job 4779526): car fixed, pedestrian walks away

Full write-up: `artifacts/runs/7ee91f4d…/smoke_check.md`. Passed: the scene
builds on Narval, **the car stays on the road in all 30 recorded runs**, no
no-encounter runs, distance works (20.0 / 35.3 m). Failed: (1) **the
pedestrian walks away from the road** (video, zoomed frames: starts at the
left road edge, walks left across the pavement) — so the run's 0 failures
mean nothing; (2) scenarios 23 and 27 (Child, Dark, RL; #23 Short fog 50, #27 Long fog 0) could not be
created by CARLA in 3 attempts and were **silently skipped**. Also: braking
stop-starts with the detector's confidence (the source of 21.6 m/s² median
deceleration — a lead about the braking rule); one harmless post-crossing
lane-offset reading. The walking-direction mirror is between Scenic and
CARLA, cause not pinned down from the code; fix proposed: walk towards a
far-kerb target by position, record the pedestrian's lateral position and
mark runs where it did not cross (test defect), and report scenarios that
could not be simulated.

### 8.32 2026-10-07 — scene v2.2: the pedestrian walks to the far kerb; crossing is measured

- `scratch.temp`: `far_kerb = new Point at (-PEDESTRIAN_SIDE * (KERB_OFFSET_M + 1.0), 0, 0)
  relative to spot`; new behaviour `CrossToKerb` (waits for the trigger, then
  each step `SetWalkingDirectionAction(angle from self to target)` + the same
  speed matching as CrossingBehavior; stops at the kerb) replaces
  `CrossingBehavior`, which walks along the pedestrian's own heading — the
  heading is mirrored between Scenic and CARLA, positions are not.
  New record `ped_lateral_m` (pedestrian's position across the road, m from
  the lane centre).
- telemetry: `ped_lateral_start_m`, `ped_lateral_end_m`, `crossed` (reached
  1.0 m past the lane centre on the far side; `crossing()`).
- analysis: outcome `not_crossed` = a test defect, excluded from every rate,
  with a warning; the report lists **scenarios that could not be simulated**
  (in scenarios.csv but without any simulation row) — on smoke run 3 it lists
  #23 (Child, Dark, RL, Short, fog 50) and #27 (Child, Dark, RL, Long, fog 0).
- `infra/hpc/smoke_scenarios.txt`: 4 scenarios (Adult, Light, fog 0; LR/RL x
  Short/Long) for a quick check with `REAL_SEARCH=list`.
- 3 new tests; 162 in total; laptop check passes. If the pedestrian still
  walks the wrong way, `crossed` = False will show it in every row, and the
  direction gets flipped on that evidence.
- Laptop check passed (4/4); staging rebuilt, rsynced, verified on Narval;
  **smoke run 4 = job 4885691** (`REAL_SEARCH=list`, the 4 scenarios above, 1 trial,
  `R_baseline.dsl`), submitted 2026-10-07.

### 8.33 2026-10-07 — smoke run 4 (job 4885691): crossing works; scene v2.3 "meet the car"

Run `a9bd6134…` (4 scenarios, 14.5 min; `smoke_check.md` there): **all 4
pedestrians crossed** (lateral −2.8 → +3.9, +3.2 → −4.2, −3.1 → +3.9,
+3.3 → −4.1 m), car on the road in all, video agrees. But stepping out at once
(trigger 100 m) at 2 m/s empties the road ~2 s in, before the car arrives —
the 4 passes mean nothing. Speed matching only ever speeds the pedestrian up.

Scene v2.3: `CROSSING_TRIGGER_M = 0` = **"meet the car"** (default): the
pedestrian steps out once the car's time to reach its line (`rel.y / speed`)
is no more than its own time to reach the car's path (`|rel.x| / min_speed`),
so both arrive together; `> 0` keeps the distance trigger (GE grammar 8-100 m);
`CROSSING_TIMEOUT_S = 6` — it steps out after 6 s anyway, so a car that stops
far back cannot freeze the scene (and the resume soft goal gets tested).
`run_meta.scene` records the meaning and the timeout. 162 tests; laptop
check passes. `simulation().timestep` / `currentTime` in the behaviour are
only exercised on Narval. Committed `83a8e4b`; laptop check passed; staging
rsynced and verified; **smoke run 5 = job 4966321** (the 4 quick-check
scenarios, 1 trial, `R_baseline.dsl`), submitted 2026-10-08.
  Its estimated start was 2026-10-09 20:38 (3.5 h limit = slower queue tier), so
  it was cancelled (Paul's go-ahead) and resubmitted with `--time=00:45:00` as
  **job 4968144** (same scenarios and settings).

### 8.34 2026-10-08 — run times on scene v2; job limit raised to 5 h

From the saved runs: a scenario costs ~2 min to start (Scenic compile, YOLO
load) plus ~0.3-0.6 min per simulation (scene-v2 runs last up to 25 s; was
10 s). Rounds 1-2 (5 trials per scenario): 0.55 min per simulation, 1.5 h
per run; smoke runs (1 trial per scenario): ~2.5 min per simulation. A scene-v2
32 x 5 grid (run 2b, round 3) therefore needs ~2.5-3 h — too tight for the 3.5 h
limit. `run_real_av.slurm`: `--time=05:00:00` and the request `timeout`
12000 → 17400 s. Both old and new limits are above 3 h, so the job stays in
the same Narval queue tier; Slurm charges elapsed time, not requested time.
Experimental timeline: docs/paper/master_plan.md.

### 8.35 2026-10-08 — carbon footprint so far (task B9)

Source: `sacct -u paulad -S 2026-08-01 -X` on Narval (Slurm's own accounting,
elapsed time per job). All REAL GPU jobs to date (2026-09-19 → 2026-10-07):
**22 jobs (16 completed), 8.41 GPU-hours** on NVIDIA A100-SXM4-40GB (1 GPU,
8 CPU cores, 32 GB per job).

Energy, as an upper bound: 8.41 h x 0.40 kW (the A100's 400 W power limit) =
3.4 kWh; with the job's CPU share, ~0.55 kW → 4.6 kWh; with a data-centre
overhead (PUE) of 1.2 → **≤ 5.6 kWh**. Assumptions to verify before quoting
in the paper: the PUE of Narval's data centre (1.2 is a placeholder), and the
carbon intensity of Québec's grid (hydro-dominated, on the order of a few g
CO2e/kWh — take the figure from Hydro-Québec or Canada's National Inventory
Report and cite it). At even 10 g/kWh that is **< 0.06 kg CO2e**; at a world
average of ~475 g/kWh it would be ~2.6 kg. The remaining planned runs (2b, GE,
grid check, round 3, maybe YOLO26) add roughly 12-15 GPU-hours. The Docker
demo needs no GPU at all. Recompute with the final job list for the paper.

### 8.36 2026-10-08 — why 2 scenarios "could not be created" (task A4)

`util.falsifier.falsify(num_test, max_attempts=3*num_test)`: every attempt
calls VerifAI's `run_server()`, which samples a **new** scene; Scenic returns
no simulation (rho None) when it rejects one — `RejectSimulationException`
/ `GuardViolation` from a requirement violated *during* the run. The template's
`require always (ego.laneSection._slowerLane is None)` and `... _fasterLane
is None` are checked at every step, so a road whose next section gains a lane
rejects the simulation. With **1 trial per scenario the budget is 3 attempts**:
scenarios 23 and 27 drew 3 such roads in a row (the per-scenario seed makes the
sequence repeatable). Real runs use 5 trials = 15 attempts, so giving up is
much less likely, and the report now lists any scenario without data
(§8.32). Not a spawn or blueprint problem (the same Child/Dark/RL settings
ran in other scenarios). Possible improvement, not made: log Scenic's
rejection reason (verbosity) and count rejected attempts per scenario.

### 8.37 Run 2b and the first GE run — pre-registered predictions (written 2026-10-08, before either is submitted)

Both assume the scene passes its checks (smoke run 5, job 4968144, and the
full 32-scenario smoke run); if the scene changes again before they run, this
entry is revised **with a dated note**, not silently.

**Run 2b — design.** Round 2's system (`proportional_braking` + `yolov5s`),
scene v2.3 ("meet the car", 6 s timeout, car on the pedestrian's lane, real
crossing both ways), `docs/examples/R_baseline.dsl` (D0 + soft goals),
`old.bnf`, 32 scenarios x 5 trials, seed 42. Differences from round 2 that
`compare.py` must list and nothing else: scene / template, step cap (25 s),
requirement text (the added `assuming` / `ensuring` only change how runs are
judged). Comparable metric: failure rate over valid encounters, with test
defects (no encounter, left road, not crossed, not simulated) reported apart.

**Run 2b — predictions.**
1. Test defects are rare: no-encounter + left-road + not-crossed ≤ 5 % of
   simulations; no scenario without data.
2. Failures stay low but rise above round 2's 3 %: between 3 % and 20 % of
   valid encounters — the car starts braking at first sight (median first
   brake ≥ 15 m), but the pedestrian now steps into its path when it is due.
3. The standoff persists: `resume_within_s <= 10` missed in ≥ 30 % of
   in-scope encounters, because proportional braking holds while a person
   is visible above 30 % confidence; StandoffUnnecessaryStop stays supported.
4. **The direction effect disappears**: |LR − RL| < 15 points (round 1's
   +24 points was a scene artefact, §8.19). This is the key test of that
   diagnosis.
5. Distance now matters: Short (20 m) has at least as many failures as Long
   (35 m).
6. Assumptions: `fog_density <= 50` and `initial_separation_m >= 15` are
   **untested** (the grid never breaks them); `pedestrian_speed_mps <= 3` is
   broken in a minority of runs (speed matching) → insufficient data or not
   load-bearing.
7. Braking is not smooth: median peak deceleration > 8 m/s² (the stop-start
   seen in smoke runs 3-4).

**GE run — design.** Same system and requirement; `v2/scene_v2.bnf`
(21,120 scenarios, settings beyond D0); population 12, generations 4,
1 trial per new scenario (≈ 60 simulations); seed 42.

**GE run — predictions.**
1. GE concentrates on hard settings: among its failing scenarios, approach
   distance ≤ 15 m and crossing trigger ≤ 15 m are over-represented compared
   with the grammar's share (2/8 and 2/5).
2. The best fitness improves: the lowest pass rate found in the last
   generation is no higher than in generation 0.
3. Breaking assumptions goes with more failures: `initial_separation_m >= 15`
   comes out **load-bearing** if both sides have ≥ 10 encounters (otherwise
   insufficient data); fog > 50 goes with more failures than fog ≤ 50.
4. Grid check: at least 3 of GE's 4 worst scenarios still fail at least half
   the time on balanced repeats.

What would falsify the scene work: prediction 1 or 4 of run 2b failing.

### 8.38 2026-10-08 — smoke run 5 (job 4968144): scene mechanics pass; the standoff is real

Run `f21d72c1…` (4 scenarios, 14.6 min; `smoke_check.md` there). All 4
pedestrians cross both ways, car on the road in all, no defects. Proportional
braking stops the car 9-13 m short while the pedestrian is still on the kerb
(any person above 30 % confidence), so "meet the car" never fires and the
pedestrian goes on the 6 s timeout (step 63 in all 4); then 3 of 4 cars never
move on while the pedestrian stands on the far kerb — round 2's standoff,
measured on a valid scene. Design choice to state in the paper: the pedestrian
stops at the far kerb and stays in view. Scene v2.3 is mechanically valid.

### 8.36 2026-10-08 — the review interface (`ui/`) and report schema 2

**Decision.** The React interface from the original plan is built after all
(roadmap open question 1), as a static application with no server, because
the ICSE artifact must run on a laptop that has never seen the project and
the review is the demonstration's centre piece. The Streamlit page stays as
the earlier interface; both write the same files.

**What the data lacked** (measured before writing code; design in
`docs/design/review_ui.md`): the report carried the requirement's leaves
but not its goal tree; the per-simulation outcome, encounter flag and
set-aside reason existed only in memory in `failure_model.py` /
`admissibility.py`; the change each mitigation implies lived only in
`refine.py`'s tables; every run video is MPEG-4 part 2, which no browser
decodes; two newer reports contained bare `NaN` tokens, which `JSON.parse`
rejects. Each was fixed on the Python side rather than re-derived in
TypeScript (one parser, one set of rules): `DSL.get_goal_tree()`,
`analysis_report.json` schema version 2 (`requirement.tree`,
`simulations[]`, `obstacles[].changes`, `rules[].as_assumption`,
`scenario_artefacts`, `bars`, NaN → null), `refine.change_for()`, and
`video.py` writing H.264 first with a one-off re-stitch command. A scratch
regeneration of the committed reports changed no number (only added keys and
one warning sentence); the committed reports were left as they were, and the
interface loads version-1 reports in a reduced mode that says so.

**The one guarantee.** A verdict loaded from a `decisions.json` on disk (the
tool's proposal or an earlier signature) is shown as *pre-filled, not yet
confirmed* — dashed, in the machine colour, with its provenance written out —
until the reviewer confirms or changes it; signing is blocked while any
remains. Every number links to the simulations behind it; set-aside rows are
a group of their own and never counted; the recording pass of the worst
scenario is listed, labelled, and never counted. If the rows found in
`simulations.csv` disagree with the count in the report, the interface says
so instead of trusting either.

**Writing without a server.** In Chrome and Edge the reviewer opens the
workspace folder (File System Access API) and signing writes
`decisions.json`, `R0.dsl`, `R1.dsl`, `requirement_diff.md` into the round
folder, nothing else. Elsewhere the files are downloaded. The contract is
tested from both sides: `ui/tests/contract/oracle.py` runs
`decisions.from_analysis` + `refine.refine` on the fixture rounds and the
test compares the three files byte for byte with the interface's output,
including assumption keep / tighten / loosen / drop / add, a rename, and
non-ASCII text (`json.dump`'s `ensure_ascii` and `.0%` half-to-even rounding
are reproduced).

**Design system.** The document (v2) arrived later the same day and was
applied: token names and values, Inter + JetBrains Mono bundled from
`@fontsource-variable`, tool output as sunken surface + left rule, human input
on the raised surface, sidebar / footer step controls, obstacle nodes with a
`fail` left rule, mono tabular numerals. Screenshots at 1440 / 1200 / 900 /
390 px: no overflow, step controls always in view.

**Restyle (same day, on the user's review).** The first styling read as too
dense. Reworked to a minimal, airy look on the user's instruction: top bar
only (the steps sit in it inside a review), no sidebar, large headings with
one line under them, explanations folded into dropdowns, rounded cards,
floating round Back / Next buttons, and a sparse rust accent (#8C3A03) in
place of blue. Step 3 is now visibly the sketch's sandbox: one card, goal
model left, failures + video evidence top right, fixes bottom right, each
panel scrolling inside itself on large screens.

**Not done / open.** Radix has no tree primitive, so the goal tree is an in-house
WAI-ARIA tree. A hand-edited R1 cannot be parse-checked in the browser
(`refine.py` re-checks it). `StandoffUnnecessaryStop` attaches to nothing on
every run so far because the requirement states no soft goal of that name;
the interface shows it unattached with the reason rather than inventing a
link. `Dockerfile.review` (with `Dockerfile.review.dockerignore`) builds a
110 MB image that runs the Python demo, builds the interface and serves both
with nginx (`docker build -f Dockerfile.review -t real-review . && docker run
--rm -p 8080:80 real-review`); verified 2026-10-08 (index, workspace listing,
report and H.264 video all served, no page errors). The original `Dockerfile`
still serves the Streamlit page.

### 8.39 2026-10-08 — run 2b and the first GE run submitted

Run on exactly the code validated by smoke run 5 (already on Narval; only the
job script was updated, `--time=05:00:00`). Local, uncommitted changes not made
in this session (`ui/`, `docs/design/review_ui.md`, edits to
`scripts/analysis/{report,refine,obstacles}.py`, `scripts/evolve/video.py`)
were deliberately **not** synced. The separate 32-scenario smoke run was
skipped (Paul's go-ahead): run 2b covers every scenario and the report flags
every test defect.

- **Run 2b = job 4972493**: `REAL_SEARCH=grid`, 32 x 5, `R_baseline.dsl`,
  parent `882fb2fe…` (round 2).
- **GE run = job 4972494**: `REAL_SEARCH=ge`, `v2/scene_v2.bnf`, population
  12, generations 4, 1 trial per new scenario, `R_baseline.dsl`.
- Both `--dependency=singleton`: the job script uses fixed ports (API 7999,
  MLflow 5000, CARLA 2000), so two jobs on one node would collide; they run
  one after the other. Making the ports per-job would allow parallel runs
  (not done).
Predictions: §8.37.

### 8.40 2026-10-08 — run 2b (job 4972493): valid test; three measurement/scoring problems

Run `657a1447…`, complete pull; full reading in `run_check.md` there.
Valid test: car on the road in all 160, no no-encounter, all scenarios ran,
4 not-crossed (2.5 %). The report's numbers need three corrections first:
(1) **9 of 12 "failures" are the car driving past a pedestrian who has already
crossed and stands on the far kerb** (~3.5 m from the lane centre): the 5 m
radius safety rule counts it; only 1 genuine near-miss with the pedestrian in
the road (26_0, 3.1 m); 2 not-crossed. (2) The pedestrian's top speed is
contaminated by one-step simulator spikes (18 steps in the run), which made
`pedestrian_speed_mps <= 3` look load-bearing — an artefact. (3) Deceleration /
jerk medians (33.8 m/s², 309 m/s³) are implausible — step artefacts in the
speed series. Holds: standoff dominant (145 of 146 stopped at the limit; 103
missed `resume_within_s <= 10`; first brake ~17 m, braking for any visible
person). All three fixable offline from the traces; no 2b number goes into the
paper until re-judged.

**Predictions (§8.37) vs outcome, provisional until the re-judge:** 1 (defects
≤ 5 %) held — 2.5 %. 2 (failures 3-20 %) **failed** — ~0-1 genuine. 3
(resume missed ≥ 30 %) held — 71 %. 4 (direction effect < 15 points) held,
but trivially (no failures). 5 held trivially. 6 fog and separation untested —
held; speed assumption — not assessable until the spike fix. 7 (deceleration
> 8 m/s²) — not assessable, measure not trustworthy.

### 8.41 2026-10-08 — glitch-robust measures and a path-aware safety rule; 2b re-judged

New `scripts/analysis/trace_measures.py`: pedestrian top speed and the car's
peak deceleration / jerk are recomputed from the traces after a 5-step (0.5 s)
median filter (raw values kept as `*_raw`; a 3-step filter left two-step
spikes); `path_min_distance_m` = closest distance while the pedestrian is
within 2.5 m of the lane centre; `apply_safety_rule(df, "anywhere" | "path")`
(monitor verdict kept as `passed_anywhere`). `report.analyse(...,
safety_rule=)`, CLI `--safety path` (needs its own `--out`); every report
states its safety rule. Robust measures always apply; the safety rule
defaults to `anywhere` — which one the requirement means is an [R] decision
for the review. Also: the review page lists only folders that contain a
`simulations.csv` (an early run folder without results became the default
"previous round" and crashed the page test). 6 tests; 183 in total.

Run 2b re-judged (`robust_measures/`, `path_aware/` in its folder; details in
its `run_check.md`): spurious 1 (not 10); valid failures 9 of 155 (anywhere)
vs **3 of 155 (path)** — the 3 are genuine in-path close calls; standoff
unchanged (145 stalled; resume missed 103). Deceleration / jerk unchanged by
the filter: simulator stopping dynamics, comparable between rounds only.

### 8.42 2026-10-08 — readiness check: public repos and old credentials; Narval throughput

- Both the fork and the original repository are **public** (GitHub API).
  `infra/credentials.json` and `infra/config.env` were committed in the
  original project's history (commit "final working code", 2025-09-24) and
  untracked later (2026-09-08); they **remain readable in the public history
  of both repositories**. Contents (names only checked, values not printed):
  Postgres user/password/database, MinIO access/secret keys and root
  user/password, MLflow bucket; every host is localhost — credentials for the
  local docker-compose development stack, not a remote service. Risk: any of
  those passwords reused elsewhere. Actions for the owners: rotate them if
  reused; optionally purge from history (git filter-repo + force-push) on the
  fork; the upstream is the original authors' to decide.
- Narval throughput 2026-10-06 → 08: queue waits 1 h 20, 1 h 20, 9 min,
  ~0 min (run 2b), GE started on its dependency; 4 jobs landed in 3 days.
- Docker demo: built and run only on the development Mac (Apple Silicon);
  never on a clean machine or x86-64; image not published.
- No human-signed decisions.json yet (only the tool-proposed round-2 review
  and the demo's scripted one). Paper: skeleton, Figure 1, Table 1 rows 1-2;
  no prose yet.

### 8.43 2026-10-08 — first GE run: the search works, and exploited the safety rule

Run `884d6752…` (1 h 16 min; `run_check.md` there). 23 distinct scenarios;
average pass rate per generation 92 → 75 → 75 → 58 → 42 %; 16 of 23 break at
least one baseline assumption (fog > 50: 14; sustained pedestrian speed > 3:
8; start < 15 m: 1) — as designed. But under the path-aware rule **no
simulation fails**: everything GE scored as a failure was the car within 5 m
of a pedestrian outside its path. GE optimised the flaw in the 5 m-anywhere
rule (its fitness is the monitor's rho). Predictions §8.37 for GE: 1-3 not
assessable on these grounds (the "failures" are not the car's); 4 (grid
check) — not run, pointless here. Next: the monitor on the cluster must apply
the safety rule the requirement means (path-aware, if the review agrees),
so that GE's fitness and every run's pass/fail measure the car.

### 8.44 2026-10-08 — requirement authoring form; three more silent failures

The review interface gained _Write a requirement_: a form whose menus come
from the code and whose gate is the project's parser, through a local helper
(`python -m scripts.redsl.serve`); details in docs/design/review_ui.md.
Reading the code for it found silent failures beyond the three the spec
named (unknown module, assumption about the car, unmeasured soft goal):
(1) braking names are fuzzy-matched, so `proportional_braking_with_resume`
would run as plain `proportional_braking` - the round-3 S lever for the
standoff needs that module implemented first, or the run measures the old
car; (2) the detector and braking module are found by the task names
"Detect Pedestrian" and "Apply Brakes" only, so renaming either task falls
back to the defaults (yolov5s, emergency_braking) without a word; (3) the
scenario sentence's vocabulary steers generation more widely than assumed -
"fog" in R_baseline's "A pedestrian trying to cross the street in fog."
fixes fog_density = 50 (`constraints` in run_meta.json). The form prevents
(1) and (2) and shows (3) as it is typed. Round trip text -> form -> text is
exact (apart from whitespace and comments) for every docs/examples/*.dsl.

### 8.45 2026-10-08 — decision: the safety rule is path-aware; run 2b re-analysed

Decided (Paul, after reading §8.40-8.43): the safety goal is violated only
when the car comes within 5 m of a pedestrian **who is in its lane**
(`trace_measures.DEFAULT_SAFETY_RULE = "path"`; lane = within 2.5 m of the
lane centre). Every analysis command now defaults to it (report, review
page, clustering, pattern map); the simulator monitor's "anywhere" verdict
stays available for comparison and, like any non-default rule, writes only
to its own folder. Runs before scene v2 have no lateral series and keep the
monitor's verdict, so rounds 1-2 are unchanged.

Run 2b's main report regenerated under it (the first analysis, judged
"anywhere" and before the glitch-robust measures, moved to
`superseded_anywhere_rule/` with a note, not deleted): 159 runs counted,
155 encounters, **3 failed (1.9 %)** - the 3 genuine in-path close calls of
§8.41 - 152 passed, 145 of them stalled; 1 run set aside (was 10); 8 runs
change verdict against the monitor. StandoffUnnecessaryStop supported;
`resume_within_s <= 10` missed in 103 runs. `cluster_map.json` regenerated
under the same rule. These are the 2b numbers for the paper.

Still to do for the rule: the monitor on the cluster scores runs (and GE's
fitness) by the "anywhere" rule; until it applies the path rule, GE can
again optimise near-misses with a pedestrian outside the lane (§8.43).

### 8.46 2026-10-13 — study plan; weather and occlusion exposed end to end (task 1a.2)

Plan in `docs/paper/study_plan.md` (dimension 1a live tool, 1b study mode,
2 pre-computed space); parameter inventory in `docs/design/parameters.md`.
Exposed: sun altitude (time of day; below 0 = night), sun azimuth,
cloudiness, rain, road wetness (also sets puddles), and occlusion (a parked
car on the pedestrian's kerb, 6 m before the crossing point, 3 m from the lane
centre). Each has a scene placeholder, a telemetry column, an assumption
quantity and scenario keywords; defaults reproduce every earlier run. Fixes on
the way: negative values were not parsed in scenarios or assumptions;
"dark" and "day" left out as keywords (dark clothing; ordinary sentences).
New grammar `v3/scene_v3.bnf` for the live tool. `tests/test_world_settings.py`
(7, incl. compiling the scene with the parked car and a night sky against
the repo's Town01 and checking the car's placement).

### 8.47 2026-10-13 — tasks 1a.3-1a.5: one safety rule everywhere, exact modules, per-job ports

- **1a.3** `trace_measures.safe_values()` is the per-step robustness the
  simulator's monitor evaluates (`G safe`): with the path rule, distance -
  5 m only while the pedestrian is within 2.5 m of the lane centre, the plain
  distance otherwise. The monitor (`util.MyMonitor`) now uses it with
  `DEFAULT_SAFETY_RULE`, so every run's pass/fail **and GE's fitness** follow
  the path rule; `rho_anywhere` and `monitor_safety_rule` are recorded too.
  Analysis: the "anywhere" verdict comes from `rho_anywhere` where recorded;
  the margin used to recover distances reads `rho_anywhere`. Monitor and
  analysis verdicts agree on 200 random traces (test).
- **1a.4** Module names exact: `braking_mode_from_module` and
  `resolve_yolo_model` refuse unknown names (ValueError; the API answers
  "NOT OK" with the list of implemented modules) instead of silently running
  another car; empty = the default; three legacy spellings mapped explicitly.
  New braking module **`path_aware_braking`**: proportional braking only for
  a person the camera estimates to be in the lane, then drives on
  (`scripts/simulations/path_estimate.py`: lateral = (box centre - image
  centre) x 1.7 m / box height; a 1.2 m child is estimated further out than
  they are — a weakness the experiments can expose). Offered by the
  requirement form automatically; behaviour on the road still to be seen on
  the cluster.
- **1a.5** Per-job ports in `run_real_av.slurm` from the job number: CARLA
  20000 + 4·slot (+1; traffic manager +6000), Redis 33000 + slot, MLflow
  34000 + slot, API 35000 + slot; the scene connects to the job's CARLA port
  (`param port`). Two jobs on one node no longer collide (`--dependency=
  singleton` no longer needed).
Tests: test_monitor_rule (5), test_path_aware_braking (6), test_job_ports
(3), four older tests updated to the refusal rule; 256 in total. Needs one
cluster smoke run: path_aware_braking, occlusion, night/wet weather, ports.

### 8.48 2026-10-13 — smoke runs for scene v3, path_aware_braking and per-job ports

Committed `ab2baf7`. Smoke files: `infra/hpc/smoke/R_path_aware.dsl` (the
baseline requirement with `path_aware_braking`) and
`infra/hpc/smoke/scenarios_v3.txt` (4 scenarios: control; night + wet + rain
+ parked car; dusk + wet + parked car; fog 70, past the assumed limit).
Laptop check before submitting: the requirement resolves to
path_aware_braking + yolov5s; all four scenes build against Town01 (the
parked car present in the two occluded ones). Staging copy rebuilt (UI
`node_modules` excluded), synced and verified. Two jobs submitted together
(45-min limit, 1 trial, `REAL_SEARCH=list`): **A** path_aware_braking,
**B** proportional_braking (baseline requirement) on the same scenarios —
a comparison and a test that per-job ports keep parallel jobs apart.

### 8.49 2026-10-13 — smoke results for scene v3; MLflow per job and non-fatal

Both runs pulled (run folders `954c0cd9…` = A path_aware_braking, `0a0c13e6…`
= B proportional_braking; `smoke_check.md` in each). They ran in parallel on
different nodes, each with its own ports (logged).
- **Scene v3 works in CARLA**: B's video shows dusk light, a wet road with
  reflections and puddles, the parked car on the pedestrian's kerb and the
  pedestrian crossing in front of it. Car on the road in all 8 runs.
- **A's job failed after its 4th simulation** on MLflow (`log-batch` → HTTP
  500; B logged one such error and recovered): both MLflow servers used the
  one file store `/artifacts/mlflow_backend`. Fixed: each job gets its own
  store (`/artifacts/mlflow/job_<id>`), and `util.evaluate_phenotype` runs the
  simulations first and treats MLflow logging as a side record — a logging
  failure is printed and ignored. 2 tests; 267 in total.
- Lead (one trial each): **B (proportional) is safe in 3 of 4 but stalls in
  those 3; A (path_aware) drives on in every run but fails safety in all 4** —
  late braking by day and at dusk, no braking at all at night and in fog 70
  (it only reacts to a person it estimates in the lane). The safety-vs-progress
  trade-off of a mitigation, measured.
- **Classification problem found**: in A's night and fog-70 runs the car
  arrived as the pedestrian stepped into the lane (closest in-lane distance
  2.1 / 1.6 m), so the pedestrian "never crossed" — and the analysis sets
  such runs aside as test defects. They are dangerous close calls. Proposed
  fix: `not_crossed` is a test defect only when the pedestrian never entered
  the lane band.

### 8.50 2026-10-13 — "not crossed" is a test defect only if the pedestrian never entered the lane

`failure_model.classify_failure`: a run whose pedestrian did not finish
crossing is set aside only if the pedestrian never came within the lane band
(`path_min_distance_m` absent); a pedestrian stopped short in the lane — the
car arriving as they step in — is judged as an encounter. Older runs without
lane data behave as before. Test added; 268 in total.
- Smoke A (path_aware_braking): all 4 runs are now encounters and all 4
  failed — night run `never_detected`, fog-70 run `detected_not_braked`
  (seen, but not estimated in the lane), the two others late / released.
- **Run 2b, paper numbers updated** (main report and `cluster_map.json`
  regenerated; the previous ones moved to `superseded_not_crossed_rule/` with
  a note): 3 of the 4 not-crossed runs had the pedestrian in the lane and now
  count as encounters (all passed). **158 encounters, 3 failed (1.9 %), 155
  passed, 147 of them stalled; `resume_within_s <= 10` missed in 105;** 1 run
  set aside as spurious, 1 not-crossed test defect. Supersedes the 2b numbers
  in §8.45 (155 / 3 / 145 / 103).

### 8.50 2026-10-13/14 — task 1a.6: Run test runs the hand workflow (done)

Four diffs, each approved before it was written, each checked on the real
cluster where it could be (results in `artifacts/cluster_checks/`).
- **Cluster copy.** The 3-file check became every file a job executes
  (top-level modules, `scripts/`, the editable Scenic, VerifAI, grape: 605).
  Hashing them on `$SCRATCH` took **16 min** (965 s; ~1 file/s, login node
  load 17-40), so the sync now writes `CODE_MANIFEST.txt` into the staging
  copy (`python -m scripts.redsl.cluster_jobs --manifest <staging>`) and the
  check reads it plus a spot check of 6 real files: **1.3 s**, "matches"
  after a sync, refusal before it. `mlruns/` left out (the sync excludes it).
  Never syncs or cancels; names the jobs that make a sync unsafe.
- **Laptop check** (`scripts/redsl/preflight.py`, own process): modules via
  `util.braking_mode_from_module` / `resolve_yolo_model`; Scenic builds every
  listed scene, the 32 grid scenes (42 s) or a covering set for GE. Real:
  both smoke requirements + their 4-scene list pass (9-10 s); a misspelt
  module is refused with the implemented ones (4 s).
- **Options** = the job script's variables and `--time` (<= 05:00:00), the
  exact `sbatch` command kept in `jobs.json`. Compared with the hand submit
  lines of 5455821/2 (sacct): same time, search, trials, script, contents;
  only paths differed - a list identical in the cluster copy is now passed by
  its own path.
- **Following**: status from squeue/sacct and the log (node, ports, n/N,
  tracebacks with MLflow "Error handling request" counted apart, last lines);
  run id only from a run folder created after the job started; partial pulls
  every 5 min into `partial/after_<n>_of_<N>/` (kept), served until the final
  report; final pull in any end state with `job_log.out` and an INCOMPLETE
  banner when it ended early. Real: status of both smoke jobs right (node,
  ports, 4/4, run ids); fetch of 5455822 added the final report and cluster
  map to run `0a0c13e6…` (40 s). A real bug found and fixed (3a): the API's
  error printed in double quotes was missed.
- **Interface**: options form with _Quick check (45 min)_, progress panel,
  PARTIAL/INCOMPLETE banner on every review step, every refusal with its
  lists, the `scancel` command shown, never run.
- Job ids and cluster paths stay in git-ignored files (`jobs.json`,
  `job_logs/`, `<run>/job_log.out`): `artifacts/` is committed.
- The tool's status read smoke A's failure correctly (the API's NOT OK on
  MLflow `runs/log-batch`); the cause and its fix are in §8.49 (MLflow store
  per job, logging non-fatal).
Tests: 303 Python (incl. a partial report on run 2b cut to 10 scenarios),
119 interface. Then (2026-10-14) the run box became a guided three-step
panel (Choose / Check / Run; review_ui.md), and a one-off empty answer from
the code check - reported as "606 missing" - is now a failed check with the
raw answer kept (`artifacts/cluster_checks/*_empty_answer.txt`); 306 Python,
124 interface.
**End-to-end (2026-10-14), the done-when of 1a.6:** R_baseline + the 4-scenario
smoke list, 1 run, 45 min, submitted from the panel after all checks ticked;
51 min in the queue (fair-share), 15 min running, followed in the panel with
two partial reports written while it ran (after 2 and 4 of 4), pulled whole
with its log, analysed, marked complete (run `82e6a075…`). Against the hand
run of the same inputs (`0a0c13e6…`): the same files, mode, trials, seeds,
scene and grammar hashes, scenario list path, car, goal tree, 5 simulations,
nothing unsimulated; 0 MLflow errors (the §8.49 fix in effect). The values
differ - CARLA is not deterministic with the same seeds - and one scenario
flips at the margin (robustness -0.22 by hand, +0.03 from the tool): one
trial does not settle a borderline case.
(`artifacts/cluster_checks/2026-10-14_end_to_end_comparison.md`) Pending for 1a.6: one real run started from the UI, followed
with partial results, pulled and opened, compared with the hand run.

### 8.51 2026-10-15 — the study space: grammar, four cars, chunks, pilot ready

- Grammar `scripts/templates/study/study_space.bnf`: pedestrian x clothing x
  direction x fog (0/40/70) x sun (60/10/-10) x wetness (0/80) x occlusion
  (0/1) = **288**; car start 20 m, trigger 0, min speed 2.0, no rain, cloud 50
  as literals. Requirement C1-C4 (`infra/hpc/study/`): assumptions fog <= 50
  and **sun >= 0** (each broken by one level), separation >= 15, speed <= 3;
  neutral scenario sentence (no keyword steers). Decisions:
  `docs/paper/experiment_design.md` §10.
- **Scenario offset** (approved diff): a list-mode chunk keeps the global
  scenario number and seed (`REAL_SCENARIO_OFFSET` -> API `scenario_offset`
  -> `run_grid`; recorded in run_meta). Without it, every chunk would reuse
  seeds 0-47 and number its scenarios from 0, breaking the pairing across
  cars. Tests: grid chunk ids/seeds, job script list mode.
- Six chunks of 48 in enumeration order (chunk 1 = adult, light clothing, all
  48 combinations of the other factors); together exactly the grammar's 288
  in its order.
- Laptop check: all 288 scenes build; all four cars' modules exist. 308 tests.
- Pilot (C1, chunk 1, 3 repeats): predictions written before submission,
  experiment_design.md §11. The Run panel cannot pass an offset yet (right
  for chunk 1 only); chunks 2-6 are submitted by hand (`infra/hpc/study/README.md`).
- Videos are recorded only for a run's worst scenario; the pilot gate uses
  the per-step traces.
- Same day: the first pilot submission (one 5-h job) waited behind ~800
  pending GPU jobs (group GPU fair-share 0.23) and was cancelled before it
  started. Jobs are now half-chunks of 24 scenarios (`chunk_<n>a/b.txt`, 2.5-h
  limit; 48 jobs, same GPU time): short jobs fill the scheduler's gaps.
  Moving to another cluster was rejected: all four cars must run on the same
  hardware.
- **Pilot result** (`artifacts/study/pilot_check_2026-10-15.md`): both halves
  completed in 1 h 20 min, 0 errors. 142 of 144 simulations: scenarios 41 and
  43 (RL, dusk, parked car) used all 9 attempts of the retry limit for 2
  results, and the report's "not simulated" list misses partial scenarios.
  Every assumption verdict matches its scenario's setting. Valid: 3 failures
  of 68 (4.4 %), all brake released on a wet road; 63 of 65 passes stalled.
  Correction: chunks of 48 do not align with the 72-scenario pedestrian x
  clothing blocks, so a chunk is not balanced (only the 288 is).
- **Fix (study-v2, approved diffs):** retry limit 3x -> 10x trials, each
  attempt with no result logged, `attempts` column in scenarios.csv; the
  reason is printed by a REAL subclass of VerifAI's ScenicServer
  (`ScenicServerSayingWhy`; VerifAI is an upstream submodule and stays
  untouched); the report lists scenarios short of their repeats
  (`short_of_repeats`). Pilot reports regenerated (old ones moved aside). Top-up
  job: scenarios 41-43 (`chunks/topup_41_43.txt`, offset 41). 312 tests.
- **Top-up** (run `f01e7692…`, study-v2): 41 and 43 reached 3 of 3 after 15
  and 13 attempts, 42 at 3; seeds = the global numbering. The new log names
  the cause: 10 of 12 failed attempts were "Unable to spawn object unnamed
  Car" (CARLA could not place a car, most likely the parked car on a blocked
  spot; Scenic then resamples the crossing point), 2 were rejected while
  running. A test-selection effect in occluded scenes, not a broken test.
  Pilot gate passed. **All 46 remaining jobs submitted** (C1 chunks 2-6, C2-C4
  all 12 halves; 2.5-h limit each; ids in the git-ignored job log).

### 8.51b 2026-10-15 — the 46 jobs: two jobs on one node share one CARLA

`artifacts/study/port_isolation_failure_2026-10-15.md`. 36 completed, 8 timed
out, 2 failed. A second job on a busy node crashes its CARLA (`bind: Address
already in use`) and its client then drives the first job's CARLA; the first
job floods `Invalid session` and crawls. Per-job ports (1a.5) do not isolate
jobs: never tested on the cluster until now. 19 jobs contaminated (re-run), 27
clean (alone on their node; 24/24). Cause open: server flag or client port.
Diagnostic (3 CARLA servers in one job, 45 s apart, `infra/hpc/diag/ports_check.slurm`):
each listens only on its own port and port+1 and answers there; nothing on
2000-2002. So `-carla-port` works and idle servers coexist; what held the
second job's port in the study is still unknown. **Fix (study-v2.1, approved):**
the job stops if its own CARLA is not alive after start-up (logging the port
holder) and a watchdog stops the API if CARLA dies during the run, so a job
can never finish on another job's server. Simulation and analysis unchanged:
the 27 clean runs stand. 19 contaminated jobs re-submitted.
**Root cause (found by the new check):** inside the container `$CARLA_PORT`
was 2000. The image's `%environment` (`infra/hpc/carla.def`) sets
`CARLA_PORT=2000` and `REDIS_PORT=6379`, and Apptainer gives the image's
values priority over the job's exports: every job ran CARLA on 2000 and Redis
on 6379, so two jobs on one node shared both (a second job's CARLA crashed on
bind and its client drove the first job's server; Redis carried detections
across jobs). MLflow and API ports were not in the image, so they were per
job. **Fix (study-v2.2, approved):** `apptainer exec --env
"CARLA_PORT=...,REDIS_PORT=..."` plus an in-container echo of the ports and a
test. Of the 19 re-runs, 15 ran alone on their node (valid) and 4 stopped
themselves at start-up (CARLA could not bind 2000); those 4 re-submitted with
the fix.
The 4 with the fix ran with their own ports inside the container (e.g. CARLA
22960, Redis 33740), 24/24, no errors. **Study space complete (2026-10-16):**
1,152 cells x 3 = 3,456 simulations from 49 runs
(`artifacts/study/completeness_2026-10-16.md`, `space_manifest.csv`).
**Merged rounds and a flaw found (2026-10-16):** `scripts/study/merge_rounds.py`
merges each car's runs into one round (`artifacts/study/rounds/C1..C4`, 288 x 3
each, sources recorded). The first analysis set aside different numbers per
car: the scene's pedestrian walks faster the faster the car comes, so a car
that does not brake broke `pedestrian_speed_mps <= 3` and its failures were
excused (C2: 455). Assumption removed (study owner); rounds re-judged with
`R_study_v2_*` into `judged_v2/`: C1 5.9 % failures, 332/354 passes stalled;
C2 93.1 %; C3 1.6 %; C4 89.3 % (`artifacts/study/speed_assumption_2026-10-16.md`).

### 8.52 2026-10-15 — public repository (deployment step 1)

Public repo `PaulAyobamidele/real-tool`: a **fresh history** (one commit from
study-v2), because two old commits of this repo hold the development
credentials. MIT licence (the existing file, unchanged). Built with
`git archive` into a staging folder, so this repo was not touched. Left out:
`artifacts/` (results go to Zenodo; job logs carry the cluster username),
`Notes.md`, `AGENT_HANDOFF.md`, `docs/presentations/`, `docs/paper/latex/`,
`test.ipynb` (a literal password), `scratch.py`, duplicate weights and `.onnx`
exports. Personal paths in `infra/hpc/README.md` and `carla.def` replaced by
placeholders (here too). Submodules pinned to the same commits. Author email:
the GitHub noreply address. 1,195 files, 93 MB (vs 1.5 GB); 311 tests pass
there (1 skipped: needs run 2b). Later releases: repeat the export from a tag.

### 8.53 2026-10-15 — multi-arch Docker image (deployment step 2)

`Dockerfile.review` now ends in a Python stage with nginx serving the built
page and `scripts/redsl/serve.py` behind `/authoring` (unchanged; started by
`infra/docker/review/start.sh`, routed by `infra/docker/review/nginx.conf`), so
the requirement editor parses with the project's parser inside the container.
Detector weights are reduced to empty files with their names (the catalog
lists names; nothing runs a detector). Local arm64 build: 410 MB; page,
workspace index, catalog (4 detectors, 3 braking modules) and a check of
`R_study_C1.dsl` (5 assumptions) all answer; the Run panel's cluster check
refuses with 409 (no cluster in the container). `.github/workflows/docker.yml`
builds linux/amd64 + linux/arm64 on a `v*` tag and publishes
`ghcr.io/paulayobamidele/real-tool`.
Published (2026-10-15): tag `v0.1.0` built in 8.5 min on GitHub; the image
has linux/amd64 and linux/arm64 variants and is pullable without a login. The
amd64 variant was pulled and run (emulated, `uname -m` = x86_64): page,
catalog and the check of `R_study_C1.dsl` answer.

### 8.54 2026-10-18 — study mode (brief: docs/design/study_mode_brief.md), step 1 of 8

Decisions taken with the study owner (the brief's open questions, revised):
the study runs on a **GitHub page** as a **separate study-only build**
(`VITE_STUDY=1`), so there is no backend: results come back as one zip per
participant, and the signing check uses the saved results (R1 written only by
the tool; its car must be one of C1-C4). Participants get the **normal tool's
pages and flow**, with every cluster run **replayed** from the pre-computed
rounds (~1 min, looks live; the briefing says runs are pre-computed; the log
records it); no on-screen replay label. Start screen: profession + random
anonymous ID (`S-XXXX`). All six obstacles, alphabetical, one neutral style;
one mitigation per accepted obstacle; time recorded, not shown. Assumption or
promise changes are re-judged on C1's simulations in the page (rules ported,
contract-tested against Python). The site is built on the laptop with C1-C4
bundled (~310 MB) and published to a gh-pages branch; the study data stays out
of the main history.
Step 1 done: `ui/src/study/` (config, session, log, start screen, route log);
the header shows the participant; the normal build is unchanged (130 UI tests
pass, the study build compiles).
Step 2 done: `npm run build:study` bundles C1 (97 MB) and C2-C4 (152 MB; their
`judged_v2` reports) under neutral run ids; `artifacts/study` is only read (a
test fingerprints the source before and after). The reports' researcher
banner ("Re-judged ... study requirement ...") is hidden in the study build;
a round with `decisions.json` is refused. Checked on the built site: no
"study_C" or "Re-judged" anywhere on the Workspace or step 1. 136 UI tests.
Step 3 done: the replayed Run test. Checked end to end on the built site:
no rounds at first; R0 read only (researcher comment lines dropped in the
copy, the original kept as `study_requirement_original`); Run test -> checks
ticked at 6 s -> queued -> scenario 115 of 288 at 33 s -> C1's Test Execution
Result opened at 65 s; the Workspace then lists the round; the log has
run_test_opened, run_checks x2, run_submitted (replay, study_C1, shown id),
run_finished, result_opened. 143 UI tests. The replay shows no elapsed time
(owner: real seconds would not look like a cluster run).
Step 4 done: the tool's verdicts hidden (17 places in the end: the 13
inventoried, plus the "Supported this round" row, "What the tool says", the
status chip - "not supported in either round" - and the catalogue's fixes on
step 3, which also break "only the study menu"); obstacles A to Z; the study
menu with `choice` beside the layer ("Change a domain assumption" ->
`requirement`); every accepted obstacle needs a fix. Scanned on the built site
with the real round: steps 1-5 show no verdict word and no verdict-coloured
shape. 153 UI tests.
Step 5 done: signing. Checked on the built site: a participant accepted
BrakingNotLatched with path-aware braking, rejected the other five, kept the
scope and assumptions, signed; `study_S-4AW2.zip` downloaded with
decisions.json, R0, R1, the diff and log.jsonl; Python's
`decisions.validate()` finds no problem; the study block says car C2, verdicts
hidden, round study_C1; R1 runs path_aware_braking + yolov5s; the log has 39
events from session_start to signed. Refusals (car not bundled, a double
quote) are tested and logged. 161 UI tests, 315 Python.
Step 6 done: re-judging in the page. Python's steps before the assumptions are
exported per simulation at build time (`ui/scripts/study_quantities.py`,
~1 MB per round, 0.8 s for 160 simulations); `ui/src/study/rejudge.ts` ports
parse_assumption, assumption_status, check_assumptions, assumption_verdicts,
the soft-goal check and build_failure_model's counts. Contract test against
`report.analyse(run, requirement=R1)` for six revised requirements (as run;
fog tightened; separation dropped and sun added; a string comparison and a
slower walker; an assumption about the car, refused; every assumption
dropped plus a soft goal): identical on run 2b (160 simulations; counted
159/79/159/0/159/160) and on the study round C1 (864; counted
383/192/383/13/383/864) - artifacts/cluster_checks/2026-10-18_rejudge_contract_study_C1.txt.
The obstacles etc. of a re-judged round are not recomputed. 168 UI tests.
Decision (owner, 2026-10-18): **the session ends at signing.** The study needs
the participant's first refinement; the researchers run R1 on the cluster
afterwards. Step 7 (Run test on R1 in the page) is dropped; the re-judging
stays in the code, unused. After signing only a thank-you screen shows, with
the zip to download again (checked on the built site, also after a reload);
the log ends with session_end. 169 UI tests.
Step 8 done: `npm run publish:study` (asks before a single-commit force push
of the built site to gh-pages; tried with "n": nothing pushed); builds are
stamped `git describe --dirty`. The brief's ten acceptance checks pass on a
plain static server with the site in a sub-folder, as GitHub Pages serves it:
a full session (start, replayed run 65 s, decisions, sign, zip, thank-you,
reload) with no failed request; the zip validates, car C3, R1 with the
tightened sun assumption, 53 log events from session_start to session_end
(`artifacts/cluster_checks/2026-10-18_study_mode_acceptance.md`). Study plan:
1b.1-1b.4 ticked (1b.1 as revised: not labelled on screen); 1b.5 is the
researchers' run of each R1 after the sessions. Not committed, not deployed.

### 8.55 2026-10-19 — the interface's palette

Five colours, one job each (owner): page `#EAEAAA`; instructions box only
`#9EB200`; header `#610000` on every page; actions `#667D01` (button fill)
with `#5A6E01` for green text (the palette green is 3.7:1 on the page
background, below AA - the darker shade is 4.6:1); failed/error `#AD1F07`;
text `#172033`; light only. 24 contrast checks over the real tokens (WCAG 2.2
AA), all pass; 193 UI tests. Both builds; screenshots of the workspace, the
author page, review steps 2-4 and the study's start screen.
Same day: the study's start screen shows REAL with its sub-headline, centred,
and asks for expertise in the participant's words (`study.expertise`,
replacing `profession`); the header reads REAL in both builds. Then the
greens swapped: instructions box #667D01 with white text (its only use),
primary button #9EB200 with dark text; links, "passed", selection and focus
in the dark text colour with an underline / tick / border. 193 UI tests.
Then an Overview page before the Workspace: "How REAL works" (normal tool, its
landing page) and "About this study" (after Start; neutral, tested for no
hints). 197 UI tests. Then the study's heading became "Overview"; both pages
show the architecture figure (Fig. 1, full width) and a help-video card
("Video coming soon" until a link is set). 197 UI tests.
Then: the video plays in a pop-up on the page (no "coming soon" text); the
study build drops the Workspace (Overview -> Requirement under Test -> run ->
review; Rounds to go back), and calls the requirement page "Requirement under
Test" (the normal tool keeps "Write a requirement"). 199 UI tests.
Then the requirement page: "Requirements Compliance to Validate" (both
builds), numbered instructions under every title, one centred way on per
page (Run test, Continue, Back / Next, Sign), "Results for this requirement"
removed, the goal model's legend always under it, and a REAL-DSL editor
(CodeMirror: colours, grammar-guided completion, hover help, errors on their
line, light/dark; read only in the study). The REAL-DSL manual written as a
CADP-style man page, docs/manual/real-dsl.md, every example checked against
the parser. Fixed on the way: a requirement with one sub-goal crashed the
page (the parser returns that sub-goal itself, not a list). 230 UI tests.
Grammar observations made while writing the manual (not changed; for the
paper's limitations or a later fix): (1) a module the simulator does not
implement makes the run fail, it is not replaced by the default (the page
said otherwise; corrected); (2) the grammar says `(goal)+` but the parser
starts at `goal`, so a file holds one goal; (3) `|` in a condition reaches the
goal tree as `&`; (4) empty `followed by` / `triggering` refinements parse;
(5) one sub-goal is reported as "no sub-goal with an operation"; (6) the
legacy module name "braking module" is reported as not run, though the
executor maps it to emergency_braking; (7) mixing `followed by` and
`parallely` groups right-to-left, and the combinator is read from the raw
text between sub-goals; (8) MAINTAIN and ACHIEVE are treated alike after
parsing; (9) scenario words match as substrings ("walking along" -> distance
Long); (10) "fog density <= 50" (with a space) is classed free text, not
rejected; (11) parse errors show internal token names (__ANON_0).
Then: "Start Running Compliance Test", step 2 renamed "Test Execution
Report", the manual its own page (#/manual, in the top bar). Pending from the
owner: a best-case example on the report (the scenario that optimizes for the
failure), and a part of the study build to remove. 231 UI tests.
Then: manual without LIMITATIONS / FILES; the limitations became the work
list docs/design/real_dsl_robustness.md. Study: the run panel is gone - Start
Running Compliance Test opens the Test Execution Report directly (logged as a
direct open). Goal model as tall as the editor; hovering the REAL-DSL marks
its box in the goal model. 233 UI tests.
Then the instructions: two fuller steps per box instead of short clipped
lines, and one wider width for every page's box. 233 UI tests.
Then the owner's layout rules (instruction box above each container: context,
explanation, call to action; optional actions as icons; one centred way on;
side by side only when related) applied to the Test Execution Report, whose
header is now the whole workflow (Overview -> Requirements Compliance to
Validate -> steps 1-5, Manual / participant on the right); "What failed"
sits beside the requirement with failed and broken parts marked. Steps 1, 3,
4 and 5 still to follow. 234 UI tests.
Then simplified: instruction boxes white with a green border and green text;
the header back to logo, Manual, participant ID; the workflow as one quiet
line under the header on every page. 234 UI tests.
Then: the workflow back in the progress-tracker look (under the header, every
page); the report's worked example is the round's best scenario (lowest pass
rate, the test search's rule: the worst case for the car), replayed top-down
from its trace (exact recorded distance, 5 m margin, detections, brakes,
moments). No video for study round C1: it was merged from several jobs and
no recording run was made. Palette study published for the owner to choose.
238 UI tests.
Then the owner chose direction B, Calm canvas: wheat only on the workflow band,
a paler page, instruction boxes white with an olive rule and "What to do"
label and ink text. 241 UI tests.
Then a finished run opens the review at step 1 (the requirement under test),
not step 2. 241 UI tests.
Then the worked example became its own page between steps 1 and 2, with
CARLA's real camera recording of the best scenario (job 8ee4732c recorded
exactly C1's test case 6; re-stitched to H.264 with scripts.evolve.video,
copied into the study site as videos/6.mp4) beside the trace replay, now
captioned as a schematic. Open: LR shows the pedestrian on the car's right in
both the camera and the trace, against util.py's "left kerb" comment.
243 UI tests.
Then the Failure Analysis: opens on the Diagram, no Tree in the study, an
instruction box above every container (goal model, evidence, fixes, patterns),
CARLA's best-scenario recording in the evidence. Caught on the way: the study
diagram showed tool verdicts in obstacle boxes; now hidden, with a test.
244 UI tests.
Then the Fixes container left the Failure Analysis; the explanation of fixes
moved to Obstacle triage, which now has an instruction box above each section
(obstacles and fixes, scope, assumptions). 245 UI tests.
Then the study's triage and refinement: step 4 asks "world or car?"; the
world's choice adds the obstacle's assumption (or soft goal) to R1
automatically, refused for car-side suggestions (ego_speed); step 5 shows R1
with the added lines outlined, the re-judged failures, and the remaining
failures with three choices (refine / real system failure + car fix / next
round). Stored as values decisions.py accepts (+ explained_by, resolution);
Python validate() checked in a test. Normal tool unchanged for now. 247 UI tests.
Then "What this means" became an always-visible neutral box on every obstacle and
scope card (not a dropdown; the olive stays the instructions' colour). 247 UI tests.
Then a guided tour per page in both tools (driver.js 1.9.0): starts on a page's first
visit, replayed from the header's ?, every stop checked to exist by a test, logged in
the study. 254 UI tests.
Then the "world or car?" triage became the flow of both tools (decision A): step 4
world/car only; step 5 refined requirement + remaining failures (refine / real system
failure with a catalogue or own fix / next round). "Refine" records words, adds nothing
to R1 (refine.py skips it too, with a Python test). Old decisions and tool proposals are
mapped onto it. The review test now checks that Python's refine derives the identical R1
from the flow's decisions. DetectionTooLate: plainer reason in step 4, the speed idea
offered under "Refine" in step 5 (A + C). The workflow band shows page titles only, in
bold. 254 UI tests, 316 Python tests.
Then the REAL logo leads to each tool's first page: the study's welcome page (#/welcome,
the session kept, Continue) and the tool's Overview. 255 UI tests.
Then the normal tool got its own welcome page (REAL, four statements of what it does,
expertise, Get started); both tools open on it; expertise recorded as reviewer_expertise
when signing. 257 UI tests.
Then the ICSE video: script docs/video/icse_video.md (4:30, about 480 words of
narration, one chapter per item the call asks for); 14 clips recorded by
ui/scripts/video/record.mjs (the normal tool on round C1 via VITE_PUBLIC_DIR,
125% page, a drawn cursor, tours off, no run submitted) and the scenes in
ui/scripts/video/scenes/, converted to H.264 by ui/scripts/video/to_mp4.py;
clips in artifacts/video/2026-10-19 (not committed). Results shown: on the
same 288 scenarios, the larger detector cuts failures 22 -> 6 and path-aware
braking raises them to 349 (both: 335), the trade-off noted in 8.49.
Then (2026-10-20) the video became: opening slides, then the demonstration (owner).
Five slides in plain words (big picture, problem, context, gap, the five steps) plus
a title, shown inside the video with each point fading in as it is said:
docs/video/slides.md (cues and narration), scene pages P0-P5 in
ui/scripts/video/scenes/ (shared slide.css), clips P0-P5 in
artifacts/video/2026-10-20. They replace the old opening (S1, A1, S2, A2); the
script is now 4:45.
Same day, the slides took the style of a reference ICSE tool demo (LEGOS-SLEEC,
ICSE 2025), keeping what works there and not its unreadable full-screen IDE: a rule
under each title and slide numbers; P5 "How REAL works", a diagram that builds step
by step with a ★ on what REAL adds (CARLA and the detector are existing tools); P6
"Before and after" (R0 -> R1: the added world assumption and yolov5s -> yolov5m, each
with its reason; 22 -> 6 measured), shown in the results; the end card with a one-line
result and a QR code to the repository (qrcodejs from cdnjs, only when the link is
given). Slide 4's list was dropped (P5 says it). Script now 4:55: tight, trim holds
in the edit.
Then the header colour: wine #8A1538 replaces maroon #610000 (owner and supervisor,
after comparing four brighter maroons). Wine leans crimson, so it stays apart from the
failure brick #AD1F07 (a brighter true maroon or crimson nearly matched it); white text
9.4:1. One token (--color-accent-deep) in ui/src/styles/tokens.css. 257 UI tests. The
recorded video clips and the slide scenes still carry the old maroon.
Then docs/video/slide_notes.md corrected after the review against the parent paper
(slide_notes_review.md): three answers (world, promise, car) instead of "world or car";
the "pedestrian is at least 1.2 m tall" before/after dropped (it scopes children out,
which the paper counts as real violations, and the checker reads it as free text);
slide 7 now shows only the measured car change (yolov5s -> yolov5m, 22 -> 6 of 376 on
the same 288 scenarios, labelled an illustration); "rarely connected"; closest approach
1.35 m (3.6 m is test case 6 only); no rain; 5 m in the car's path. Still to align:
slides.md, the P0-P7 scenes, icse_video.md's S7 line, and the tool's own world
suggestion for PedestrianSizeTooSmall (refine.py), which is the 1.2 m assumption.
Then the demo clips re-recorded for the ElevenLabs edit (artifacts/video/2026-10-20/
elevenlabs/, numbered, with docs/video/demo_voiceover.md): Wine header; S7 now gives
PedestrianSizeTooSmall to the car (nothing scopes children away) and shows the refused
world option on DetectionTooLate; S8 shows the three outcomes (DetectionTooLate a system
failure with the larger detector, StandoffUnnecessaryStop refined in the reviewer's
words, the rest to the next round). Found and fixed: every clip so far had a grey border
(the recorder pads a 1536x864 page to the requested 1920x1080); now recorded at the
viewport size and scaled to 1080p by to_mp4.py. The padded clips are kept in
2026-10-20/old-padded. A cold open (C0) is cut from S5's replay, zoomed on test case 6.
Then the study's welcome box lost its "What to do" label (owner): Instructions takes
label={false} there, as the box only sets the scene. 257 UI tests. Clip 08 re-recorded.
Then clip 08 moved to the normal tool's welcome page (owner), renamed 08_welcome.mp4.
Then the full video assembled (artifacts/video/2026-10-20/elevenlabs/demo.mp4, 4:28,
1080p, with demo.srt): the owner's 22 Google Slides frames (progressive copies) + the
clips + one ElevenLabs voice-over (voice_over.mp3; a second take, voiceover2.mp3, reads
the same words). ElevenLabs ignored the <break> pauses, so the voice was transcribed
locally (faster-whisper small.en, word timings saved next to it) and aligned to the
script; ui/scripts/video/assemble.py cuts each piece at the pause midpoints, holds each
frame for its line, plays each clip at up to 1.35x (2x for the terminal) and spreads any
extra time over the pauses between sentences. The narration was cut from 853 to 610
words first (5:40 of speech was over the 5:00 limit). Frames f21/f22: the stray
"1.2 m tall" text and a faint duplicate link painted out of the images.
Then the study analysis, step 1 (owner chose "B": drawn afterwards, the study tool
unchanged): scripts/analysis/study_goal_models.py reads each participant's zip, parses
R1.dsl with the authoring parser and lists what R1 adds to R0 (assumptions D, soft goals
R, module swaps S) and the refinements written in their own words (not in R1 by design);
the combined model is R0 with every change, counted. ui/analysis.html (dev only, not in
the build) draws them with the tool's own goal-model layout, and
ui/scripts/analysis/render_goal_models.mjs saves combined.png and <participant>.png.
tests/test_study_goal_models.py. Dry run on three synthetic sessions, labelled as such:
artifacts/study/analysis_dryrun_SYNTHETIC_2026-10-20/.
Then a dry run of the study build as one participant (ui/scripts/study/dry_run.mjs;
outputs in artifacts/study/dryrun_2026-10-20/, ID S-45EY, labelled a dry run): every
page, no page error or failed request, signing disabled until every remaining failure
was decided, the zip downloaded (decisions.json, R0.dsl, R1.dsl, requirement_diff.md,
log.jsonl), decisions.validate() empty, R1 parses (car C3), every reason saved, the end
screen kept after a reload, the goal-model step runs on the zip. Found: (1) an "out of
scope" verdict on a set-aside artefact without a machine rule writes the participant's
REASON into R1 as an assumption (refine.scope_change and changes.scopeChange, by
design, but the page asks only for a "Reason"; a reason can also describe the car,
which the never-the-car rule does not catch for typed text); (2) playing the CARLA
video is not logged; (3) the triage choice "the requirement leaves this out" is stored
as explained_by "world" with an ensuring clause: the analysis must tell D from R by
the clause. Fixes await the owner.
Then both fixed (owner: "Yes"): an out-of-scope scope item with no rule to invert now
asks for "The limit to state in the requirement" in its own field (`limit` in
decisions.json); that, not the reason, goes into R1 (changes.scopeChange and
refine.scope_change, the reason kept only as a fallback for older documents); signing
waits for it (isComplete / completionGaps), and a limit about the car is refused by
validate in both TS and Python. The CARLA video logs video_played / video_paused /
video_ended with the time (study only). Tests: ui/tests/domain/scopeLimit.test.ts,
tests/test_refine.py; 261 UI tests, 317 Python. Dry run repeated (S-FT2R): R1 carries
the stated limit, no reason text, video_played logged, validate empty.
Then (owner): the study's start box became a welcome and thank-you message ("Welcome,
and thank you for taking part." above the same text); the Overview page's containers all
take the width of "Overview of the tool" (max-w-6xl), in both builds. 261 UI tests.
Then the normal tool's next run (owner: "Run Compliance Test on R1"): after signing, step 5
shows "Run Compliance Test on R1 ▸" (R<n> for later runs) with the run panel
(components/review/RunNext.tsx). useRunTest takes `provenance` (parent_run_id = this
round, round = its run number + 1, merged into the submitted options; the helper and
the cluster job already write both into run_meta.json) and `landOn: 2`, kept in
localStorage with the job so a reload still lands there: the finished run opens on its
Test Execution Report. The report shows a banner when its parent is recorded: "Second
run of this requirement · This report tests R1, the requirement refined after the first
run (date)", with a link to the first run's report (lineage.runNumberOf / runOrdinal).
RunDialog takes a title. Tests: tests/state/runNext.test.ts; 264 UI tests. (A test
that rebuilt `open` on every render looped the resume effect; the page passes the
workspace's stable `open`, so it does not.) Not yet seen on screen with a real second
run (Narval needed).
Also the owner created the Supabase project for the study's uploads (EU region, not
Canada: to be checked against the ethics approval).
Then the study's online storage built (owner): Supabase project, EU region (to check
against the ethics approval); docs/study/supabase_setup.sql run by the owner (table
`submissions`, private bucket `sessions`, 10 MB zips only; anyone may insert, only a
signed-in user may read; sign-ups off, one researcher account). At signing the zip is
uploaded (src/study/upload.ts: `<ID>/study_<ID>_<UTC stamp>.zip`, never overwritten) and
still downloaded as the backup; the end screen says sent / sending / could not be sent
(with "Try sending again"); the Overview and the signing note say so instead of "Nothing
is uploaded" (only when the build has the settings). The researcher's page admin.html
(study build only): sign in, every session listed (ID, expertise, car, signed, minutes,
size), Download per session and Download all (one zip of the session zips). Settings in
ui/.env.local (git-ignored; the publishable key only); nothing is sent under test.
@supabase/supabase-js 2.117.2. Live check: the dry run (S-GB63, expertise "Dry run")
was sent and reported sent, also after a reload; with the public key alone, reading,
listing, downloading, public links, changing and deleting are all refused, and a row
or file that breaks the naming or type rules is rejected. 267 UI tests.
Then, for the paper, an exhaustive inventory of what the tool adds, from two read-only
sweeps (pipeline and analysis; interface and study), merged and deduplicated:
docs/paper/feature_inventory.tex (LaTeX for Overleaf; 12-item shortlist, 169 features
F1-F169 tagged NEW / PARENT / STUDY / INFRA with evidence, 6 findings E1-E6 usable as
evaluation, 17 limitations L1-L17). For sieving, not final text.
Then (owner): a report banner is titled by what it says (src/domain/banner.ts):
"Results so far" (PARTIAL), "Incomplete run" (INCOMPLETE), "About this round" for any
other note; before, the study rounds' re-judging note showed as "Incomplete run". The
header colour became raspberry #E30B5D (white on it 4.7:1, AA; small text on the page
4.2:1, so the second-run banner's label is ink, the colour kept for its border). The
video's tool clips were re-recorded in it with the researchers' round note hidden
(record.mjs), the cold open re-cut, and the video rebuilt with the same voice-over:
demo.mp4 4:27; assemble.py now drops a clip's blank opening frames. Earlier versions
kept in artifacts/video/2026-10-20/old-wine-8A1538/ and elevenlabs/previous/. 268 UI
tests.

2026-10-21 - study readiness for the evaluation (owner: changes in the study build only;
reasons stay optional). The evaluation counts "diagnoses engineers report as unhelpful",
which nothing recorded. Study build: every diagnosis shown (each obstacle and each
set-aside scope item) asks "Was this diagnosis helpful to your decision?" (Helpful /
Partly helpful / Not helpful, with an optional "What was missing or misleading?");
stored on the item in decisions.json as `helpful: {rating, why}` (Python validate
accepts it), logged (helpful_rating, helpful_why_written), and signing waits until every
diagnosis is rated (studyBlockers). Also in the study build: the Overview's "Decide" step
describes the current triage and revision (it still said accept/rename/reject), the Sign
step says the session is sent when the build has online storage, the help-video card and
its sentence are hidden while no video is set, and the scope limit is logged per field,
not per key. Normal tool unchanged. 269 UI tests. Dry run S-EXAP (upload off) checks it.
Still open: the "1.2 m tall" world option (owner's decision), the analysis for the RQ,
republishing, a dry run on the live link, the admin page.
Then (owner): option C in both tools - the tool proposes no assumption for
PedestrianSizeTooSmall (refine.R_CHANGES entry removed; ui WORLD_IN_OWN_WORDS for reports that
still carry it); "the world explains it" there asks the engineer to write the assumption,
stored as a requirement-layer mitigation and derived identically by Python and the UI, refused
if about the car (validate, both sides). The RQ analysis scripts/analysis/study_rq.py
(requirements and assumptions refined, unhelpful diagnoses with why, Fleiss' kappa over the
triage paths, chosen cars with their measured C1-C4 results, time per step, evidence use, data
quality incl. R1 = refine(decisions) and log = file); tested on dry runs and a zip of zips.
Committed (3c3d3cf, 6dc13cc, 9ffc99b) and published; three live dry runs (S-4TJF, S-XZVV,
S-R7SX; artifacts/study/dryrun_live_2026-10-21/) found and fixed: the study's car choices
were recorded under layer "system", so refine could not re-derive R1 (refine now honours
mitigation.choice); the triage side and revision outcome were logged without their values;
a tour stayed open over the next page when the participant left (study: closed and logged
left_page) and a fast Skip went unlogged (close recorded once, however it ends). Final live
session: no problem. 321 Python, 270 UI tests. Published build 2d4d502.

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
