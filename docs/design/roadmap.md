# Roadmap: from rounds 1-2 to the ICSE artifact

Written 2026-10-01; revised the same day after the supervisor meeting and the
paper comparison ([tool_paper_alignment.md](tool_paper_alignment.md)).
Status: **agreed in direction by Paul 2026-10-01**; M0, M1 done; M2/M2c built.
**Since 2026-10-06 the plan is driven by the ICSE 2027 Tool Demonstration
deadline, Friday 23 October 2026 (AoE)** — see the section below and
[docs/paper/icse27_call.md](../paper/icse27_call.md).

## ICSE 2027 submission plan (deadline Fri 23 Oct 2026, AoE)

Deliverables: a 4-page IEEE paper **including references**, a 3-5 min YouTube
video, and the tool in a form reviewers can run **without building it**.

| Dates | Work | Needs Narval | Done when |
|---|---|---|---|
| Oct 6-7 | Smoke run 3 (job 4779526) passes: car on the road in all 32, video shows the crossing, plausible braking. Fix + re-smoke if not. | yes | smoke_check.md says pass |
| Oct 6-9 ✅ (built Oct 6; publish pending) | **Demo mode** (M5.1) + **Docker image** that runs it and the review page, no CARLA/GPU; README "Try it in 5 minutes" | no | `docker run …` opens the review page on the bundled rounds |
| Oct 7-10 | **Run 2b** (grid, round-2 car, fixed scene, `R_baseline.dsl`) and **first GE run** (~60 simulations) — submitted back to back | yes | both pulled, reported, prediction pre-registered |
| Oct 9-11 | GE grid check (24 simulations); review of 2b with the supervisor → **round 3 decisions** (one D, one R, one S) | yes | decisions.json signed by a person |
| Oct 10-13 | **Round 3** run + comparison 2b → 3 | yes | Table 1 complete |
| Oct 11-16 | **Paper draft** (4 pages incl. refs): users, challenge, workflow, case study, planned study, carbon footprint; figures: architecture, review page, Table 1 | no | supervisor has v1 by Oct 16 |
| Oct 14-18 | **Video** (3-5 min): screen recordings of demo + review page + one Narval run, voice-over from docs/voiceover.md trimmed; upload to YouTube (unlisted) | no | URL in the abstract |
| Oct 16-20 | Public release: tag, Zenodo DOI, Docker image published, repo cleanup | no | DOI and image link in the paper |
| Oct 19-22 | Supervisor review, polish, page-limit and format check, ORCIDs | no | final PDF |
| **Oct 23** | **Submit** on HotCRP (abstract ends with the video URL) | — | submitted |

**Cut list if time runs short** (in this order): YOLO26 runs (M2b) → model/data
layer runs (M4b) → the GE grid check (state GE results as leads only) →
round 3 (fall back to "design of the planned round" + rounds 1, 2, 2b as
validation). Never cut: the working demo + Docker image, the video, and an
honest Table 1.

**Main risk:** Narval queue waits (hours to a day per job). Submit runs as
soon as each is ready; keep laptop work (demo, Docker, paper, video) moving
in parallel.

Two goals, pursued together:

- **Research aim** - show the REAL loop working on real data as the paper
  describes it: failures → obstacles → human decisions → revised artefacts,
  with **all three** of D (domain assumptions), S (system) and R
  (requirement, incl. soft goals) adjustable, and mitigation across all four
  layers (data, model, system, requirement), every round traceable.
- **Artifact aim** - an installable, documented, tested tool that ICSE
  artifact reviewers can run, earning the Available + Functional + Reusable
  badges, plus a tool paper.

Rules for every milestone: code changes are proposed as diffs and approved
first; results go to files in the run folder (never chat-only, never
overwritten, labelled if partial or hypothetical); docs (README, Notes,
AGENT_HANDOFF, infra/hpc/README) updated in the same session; Paul commits
and tags at the end.

**Experimental rule (new):** a change to D or R does not change what the car
does, only how a run is judged — so it is evaluated by **re-analysing the
same runs** on the laptop. Only a change to S (the car: braking, model,
weights) needs a **new Narval run**, and each such run changes one thing.
This keeps every comparison attributable.

Order: M0 → M1 → M2 → M2c (GE) (+ M2b) → M3 → M4 → M4b → M6. M5 runs in parallel,
mostly while Narval jobs are queued or running. M6.0 starts now.

---

## M0 - Secure what exists

| # | Task | Done when |
|---|---|---|
| 0.1 | Commit the 2026-09-24/25 work (≈30 files, 92 tests) | tag `post-presentation-2026-09-25` — **done** (`6e805c0`) |
| 0.2 | Docs catch-up (Notes §8.12, AGENT_HANDOFF, README `assuming` rules, debt inventory) | **done 2026-10-01** |

## M1 - The baseline requirement and the admissibility check (laptop only)

Step 1 of [domain_assumptions.md](domain_assumptions.md).

| # | Task | Done when |
|---|---|---|
| 1.1 ✅ | Vocabulary `QUANTITIES` in `scripts/analysis/admissibility.py` (name, level scenario/run, unit, source, available) | unit test lists every quantity in the design table |
| 1.2 ✅ | Parse each `assuming` item into: scenario / run / free text / rejected (about the car, or unknown quantity, with a message) | tests: `ego_speed <= 5` rejected, `sun_angle > 3` rejected, `"daylight"` free text |
| 1.3 ✅ | Per-simulation check: held / broken / not measured; `initial_separation_m` from trace `distance_m[0]` | admissible = every assumption held; spurious = some broken (named); not measured kept apart |
| 1.4 ✅ | Report section "Assumptions": per assumption, times broken, failure rate held vs broken, verdict; and a "Soft goals" section listing each `ensuring` item as checked or **not yet measurable** | sections in `analysis_report.md` / `.json` |
| 1.5 ✅ | Review items keep / tighten / loosen / drop / add (D) in `decisions.py`, `review.py`, review page | AppTest clicks one of each |
| 1.6 ✅ | `refine.py` writes `[D]` changes; flags loosening an "untested" assumption | test per row of the design table |
| 1.7 ✅ | **`docs/examples/R_baseline.dsl`**: R0's system + `assuming` D0 + `ensuring` E0 (baseline soft goals, see M2.5) — the baseline with both slots, as agreed with the supervisor | parse-checked by `test_example_files_parse` |
| 1.8 ✅ | Re-analyse rounds 1 and 2 against the baseline into `artifacts/runs/<run>/baseline_D0/`, banner "assumptions stated after the run" | both folders exist; originals untouched |
| 1.9 ✅ | Docs + commit + tag `baseline-analysis` | `da48cc8` |

**M1 complete 2026-10-01** (Notes §8.14-§8.18): under the baseline, every round 1-2 failure
stays a real violation; the rounds give no evidence for or against any assumption. Assumptions are checked after each
run, never imposed on the simulator; tightening the scenario grammar to an
agreed assumption is deferred (a later per-round choice).

## M2 - Fix the test scene; measure what is missing

Diagnosis: Notes §8.19. Code done 2026-10-01 (Notes §8.20), Narval check pending.

| # | Task | Done when |
|---|---|---|
| 2.1 ✅ | Crossing trigger as a setting (`CROSSING_TRIGGER_M`, default 100 m = "at once"; was a fixed 8 m) | in every row and `run_meta.scene` |
| 2.2 ✅ | Both directions cross: kerb start, heading ±90° (`util.DIRECTIONS`; RL used to walk along the road) | `test_scene_v2` |
| 2.3 ✅ | Car must start on the pedestrian's lane (`require ego.lane == lane`); run ends 20 m past the crossing point | smoke run: no-encounter near 0 |
| 2.4 ✅ | `distance` is real: Short 20 m / Long 35 m car start (`util.EGO_START_M`) | two values give different `initial_separation_m` |
| 2.5 ✅ | New measures per simulation: pedestrian speed, crossing-start distance, peak deceleration, peak jerk, min time-to-collision, stop / resumed / resume time (`telemetry.motion_metrics`); `clear_lateral_m` dropped (needs more recording); step cap 100 → 250 (25 s) | columns filled on the smoke run |
| 2.6 ✅ | Soft goals checkable (`scripts/analysis/soft_goals.py`: met / missed / not measured over encounters); `R_baseline.dsl` now `ensuring "resume_within_s <= 10"` + smoothness as text until a jerk threshold is chosen | report lists them |
| 2.7 | Rebuild `~/real-av-build`, rsync (only when no job runs), short smoke run on Narval; check one video per direction | `.out` ends `STATUS: OK`; no-encounter near 0; both directions cross; new columns filled |
| 2.8 | Docs + commit + tag `scene-v2` | - |

## M2c - GE as the main search (Paul, 2026-10-01)

GE builds every scenario from the same template, so it needs the scene fixes
first; and the current grammar has only 32 scenarios, too few for GE to
search. Agreed order: scene fixes (M2) → GE-ready grammar → GE through the
Slurm/requirement path → analysis aware of GE's uneven sampling.

| # | Task | Done when |
|---|---|---|
| 2c.1 ✅ | GE-ready grammar: numeric ranges for the new settings (fog 0-100, car start distance, pedestrian speed, crossing trigger) alongside the categories | grammar parse test; GE sees > 32 distinct scenarios |
| 2c.2 ✅ | Slurm job can run GE (`/get_testcases` with the requirement file, provenance like `/run_grid`) | `run_meta.json` mode `ge` with requirement source, round, parent, scene |
| 2c.3 ✅ | Analysis marks GE samples "not balanced"; setting effects / obstacle support corrected or caveated; a small grid check of GE's worst scenarios | report states sampling; check run planned |

## M2b - A newer YOLO as a model-layer option (supervisor request)

| # | Task | Done when |
|---|---|---|
| 2b.1 ✅ | Choose the model (**YOLO26s**, Notes §8.29): newest Ultralytics detector that runs on Python 3.8 / the container's torch (candidates YOLO26, YOLO11 — verify, do not assume) | choice + reason in Notes |
| 2b.2 | Loader handling both families: `torch.hub` for v5 weights, `ultralytics.YOLO` for newer ones, in the vendored driving model and `scratch.temp` | one function returns "highest person confidence" for both |
| 2b.3 | Weights downloaded on the laptop and shipped in `model/` (Narval compute nodes have no internet) | `resolve_yolo_model` finds it; `performed by "<name>"` selects it |
| 2b.4 | Local test on a stored frame: same image, both models, person confidence returned | test passes without CARLA |
| 2b.5 | Container check (Python 3.8, torch version) + Narval smoke run | `.out` ends `STATUS: OK`; model name in `run_meta.json` |

## M3 - Run 2b: round-2 car, fixed scene, baseline requirement

Separates "the scene was biased" from "the car changed".

| # | Task | Done when |
|---|---|---|
| 3.1 | Pre-register the prediction in Notes before submitting | entry dated before the job id |
| 3.2 | Submit: `proportional_braking` + `yolov5s`, `REAL_REQUIREMENT_FILE=R_baseline.dsl`, 32 × 5 | job id + run id in Notes |
| 3.3 | Pull everything (traces, frames, mp4, `.out`) before any conclusion | folder complete |
| 3.4 | Report + `compare.py` round 2 vs 2b (only the scene differs) | `comparison.md` flags nothing else |
| 3.5 | Write up; commit + tag `run-2b` | - |

## M4 - Round 3: the first full REAL loop round, all three levers

| # | Task | Done when |
|---|---|---|
| 4.1 | Human review of 2b (Paul, with supervisor if possible) → `decisions.json` signed by a person | reviewer field is a person |
| 4.2 | Decisions cover **each lever**: at least one D decision (keep/tighten/loosen/drop/add), one R decision (soft goal), one S decision (mitigation) | `requirement_diff.md` has `[D]`, `[R]` and `[S]` lines |
| 4.3 | D and R changes evaluated by re-analysing 2b (no new run), into a labelled subfolder | per-lever effect visible without simulation |
| 4.4 | S change run on Narval with `REAL_PARENT_RUN_ID=<2b>`, `REAL_ROUND=3` | `run_meta.json` links to 2b and the decisions file |
| 4.5 | Pull, report, compare 2b vs 3; each obstacle: resolved, masked or shifted | Notes entry |
| 4.6 | Stop or continue (tool shows the signals, human decides) | decision recorded |
| 4.7 | Commit + tag `round3` | - |

## M4b - Cover all four mitigation layers and the search

Each is one S change against 2b, same scene, same requirement — the paper's
MLSv1→v3 progression done with repeated, comparable runs.

| # | Layer | Run | Paper |
|---|---|---|---|
| 4b.1 | model | `performed by "yolov5m"` | M1 |
| 4b.2 | model | newer YOLO (M2b) | (new) |
| 4b.3 | data | `performed by "fine_tune"` | M2 |
| 4b.4 | search | one GE run (not the grid) under `R_baseline.dsl`, compared with the grid's worst scenarios | §IV-A |

Optional: `few_shot` (paper's M3). Order and how many are run is decided
after round 3 (Narval budget).

## M5 - Artifact hardening (in parallel)

| # | Task | Badge |
|---|---|---|
| 5.1 | **Demo mode without CARLA/GPU**: ship a small real run folder so reviewers can run analysis → review → refine on a laptop in minutes | Functional |
| 5.2 | Clean-machine walkthrough: fresh venv, `pip install -e .`, `pytest`, demo mode; fix every step that breaks | Reusable |
| 5.3 | CI (GitHub Actions): tests + example-file parse check | Reusable |
| 5.4 | Remaining debt: duplicate `/get_testcases`; `ge.py` → `simulations.util` coupling | Reusable |
| 5.5 | Bake code into the Apptainer image for releases (retire the source overlay), pinned versions | Reusable |
| 5.6 | UI: keep Streamlit unless decided otherwise | - |
| 5.7 | Licences of vendored code; `CITATION.cff`; `STATUS` file | Available |
| 5.8 | Zenodo release with DOI from a tagged commit | Available |

## M6 - Tool paper and demo

| # | Task |
|---|---|
| 6.0 ✅ (outline) | **Now**: check the ICSE call (track, page limit, video); outline with each section mapped to the run that supplies its evidence, using [tool_paper_alignment.md](tool_paper_alignment.md) |
| 6.1 | Draft: the loop, the tool, the case study (rounds 1 → 2 → 2b → 3 → layer runs), limits stated openly; differences from the research paper reported (alignment §4) |
| 6.2 | Demo video: requirement → run → review page → revised requirement |
| 6.3 | Artifact appendix pointing to the DOI and demo mode |

---

## Open questions for Paul

1. Streamlit for the artifact (recommended) or the React UI from the original plan?
2. 5 trials per scenario for every new run (recommended, so rounds compare)?
3. Who signs round 3's decisions — Paul alone, or with the supervisor?
4. Which ICSE track and its real deadline? (M6.0 checks the call.)
5. Which layer runs in M4b fit the Narval budget, and in what order?

## Next action

M2.7 — finish and pull the scene v2 smoke run (job 4354082), check it against the pass criteria; then size and submit the first GE run (M2c done).
