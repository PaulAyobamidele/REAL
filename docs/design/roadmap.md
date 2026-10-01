# Roadmap: from rounds 1-2 to the ICSE artifact

Written 2026-10-01; revised the same day after the supervisor meeting and the
paper comparison ([tool_paper_alignment.md](tool_paper_alignment.md)).
Status: **agreed in direction by Paul 2026-10-01**; M0 done (commit `6e805c0`, tag
`post-presentation-2026-09-25`); M1 in progress.

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

Order: M0 → M1 → M2 (+ M2b) → M3 → M4 → M4b → M6. M5 runs in parallel,
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
| 1.7 | **`docs/examples/R_baseline.dsl`**: R0's system + `assuming` D0 + `ensuring` E0 (baseline soft goals, see M2.5) — the baseline with both slots, as agreed with the supervisor | parse-checked by `test_example_files_parse` |
| 1.8 | Re-analyse rounds 1 and 2 against the baseline into `artifacts/runs/<run>/baseline_D0/`, banner "assumptions stated after the run" | both folders exist; originals untouched |
| 1.9 | Docs + commit + tag `baseline-analysis` | - |

M1.1-1.6 done 2026-10-01 (Notes §8.14-§8.17). Assumptions are checked after each
run, never imposed on the simulator; tightening the scenario grammar to an
agreed assumption is deferred (a later per-round choice).

## M2 - Fix the test scene; measure what is missing

Step 2 of the design. All changes to `scratch.temp` / `telemetry.py` need approval.

| # | Task | Done when |
|---|---|---|
| 2.1 | Pedestrian crossing trigger as a setting, not a fixed 8 m wait-for-car | trigger distance in `run_meta.json` |
| 2.2 | Lane / start geometry so car and pedestrian meet (no-encounter near 0, from ~25 %) | local Scenic parse test; smoke run has an encounter |
| 2.3 | The grid's `distance` setting actually changes the scene | two values give different `initial_separation_m` |
| 2.4 | Record `pedestrian_speed_mps`, `crossing_start_distance_m` | columns filled |
| 2.5 | Measured soft goals for `ensuring`: **smoothness** (peak deceleration, peak jerk — the paper's *SmoothBraking*), **minimum time-to-collision** (named in the paper's threats), **resume** (`resume_speed_mps`, `resume_within_s`, `clear_lateral_m`) | a stalled pass breaks the resume goal; an emergency stop shows in jerk |
| 2.6 | Rebuild `~/real-av-build`, rsync (only when no job runs), smoke job 1 scenario × 1 trial | `.out` ends `STATUS: OK`; new columns filled |
| 2.7 | Docs + commit + tag `template-v2` | - |

## M2b - A newer YOLO as a model-layer option (supervisor request)

| # | Task | Done when |
|---|---|---|
| 2b.1 | Choose the model: newest Ultralytics detector that runs on Python 3.8 / the container's torch (candidates YOLO26, YOLO11 — verify, do not assume) | choice + reason in Notes |
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
| 6.0 | **Now**: check the ICSE call (track, page limit, video); outline with each section mapped to the run that supplies its evidence, using [tool_paper_alignment.md](tool_paper_alignment.md) |
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

M1.7 — `docs/examples/R_baseline.dsl` (R0's system + D0 + baseline soft goals), then M1.8 — the labelled re-analysis of rounds 1-2 into `baseline_D0/`.
