# Brief: study mode in the review interface (`ui/`)

For the chat that owns `ui/`. Written 2026-10-16 from the code and files as
they are today; every fact below was checked, with the file it comes from.
Where something is not decided, it is listed under **Open questions**: ask
the study owner, do not guess.

---

## 0. How to work

1. Read this whole brief and the files it names before changing anything.
2. Before editing, show the study owner your plan, and then each change as a
   diff; edit only after an explicit go-ahead (the owner's standing rule).
3. Ask the **open questions in section 7** first; their answers change the
   build.
4. Only `ui/` and, if approved, `scripts/redsl/serve.py` are yours for this
   task. The other chat will not touch `ui/` while you work. Do not edit the
   analysis code (`scripts/analysis/`), the study data
   (`artifacts/study/`) or the job scripts.
5. New files carry no names, e-mail addresses, `/Users/...` paths, cluster
   host names or job ids (the repository is published).
6. No commit, push or deployment without the owner asking for it.
7. Keep the documents current with every change: `ui/README.md`,
   `docs/design/review_ui.md`, a dated entry in `Notes.md` (section 8), and
   tick items 1b.1-1b.5 in `docs/paper/study_plan.md` when their check passes.

---

## 1. Why study mode exists

The tool's paper (ICSE 2027 tool demonstrations, deadline 23 Oct 2026) needs
evidence that the human decision step matters. About 10 participants each
review **the same pre-computed round** and decide independently. We then
compare their decisions, and give each a before/after result. Design:
`docs/paper/experiment_design.md` (sections 1, 7, 8, 10, 11) and
`docs/paper/study_plan.md` (dimension 1b).

The normal review page already lets a person review a round and sign. Study
mode adds what makes the decisions **the participant's own and analysable**:
the tool's verdicts hidden, one record per participant, a full interaction
log, only car changes that have a pre-computed result, and a signing check.

**Normal mode must not change.** Study mode is added alongside it.

---

## 2. The round participants review (ready, do not regenerate)

`artifacts/study/presented/study_C1/` (93 MB), an ordinary run folder:

| File | Content |
|---|---|
| `run_meta.json` | `run_id` = `study_C1`; `requirement` = the **v2** study requirement (the one shown); `requirement_as_run` = what the jobs recorded; `presented_note` explains both; `merged_from` lists the 13 source runs |
| `analysis_report.json` / `.md` | the analysis against the v2 requirement (path-aware safety rule) |
| `cluster_map.json` | the map of behaviours (851 points) |
| `simulations.csv` | 864 rows: 288 scenarios x 3 runs; car `proportional_braking` + `yolov5s`; column `source_run_id` gives each row's origin |
| `scenarios.csv` | 288 rows |
| `traces/` | one `<scenario>_<sim>.json` per simulation |
| *(no video, no frames)* | the merged round has no worst-scenario video; the page already shows its "No video for this round" notice |
| *(no `decisions.json`)* | keep it that way for study sessions (see 3.3) |

Key numbers (from that report): 376 valid encounters, 22 failures (5.9 %),
332 of 354 passes stalled, `resume_within_s <= 10` missed in 251 of 376; 481
simulations out of scope (fog 70 and night), 7 test defects.

The requirement shown (`infra/hpc/study/R_study_v2_C1.dsl`):
`assuming "fog_density <= 50" & "sun_altitude_angle >= 0" &
"initial_separation_m >= 15" & "pedestrian on foot"`, `ensuring
"resume_within_s <= 10" & "braking is smooth unless an emergency stop is
needed"`, car `performed by "yolov5s"` and `"proportional_braking"`.
Why the speed assumption was removed:
`artifacts/study/speed_assumption_2026-10-16.md`.

The pre-computed follow-ups (same 288 scenarios and seeds):
`artifacts/study/rounds/C2|C3|C4/` with their v2 reports in `judged_v2/`.
C2 = `path_aware_braking` + `yolov5s`; C3 = `proportional_braking` +
`yolov5m`; C4 = `path_aware_braking` + `yolov5m`.

---

## 3. What exists today (checked in the code)

### 3.1 Screens and routes (`ui/src/state/route.ts`)

`#/` workspace, `#/lineage`, `#/author`, `#/review/<run id>/<step 1-5>[?focus=...]`.
The five review steps (`ui/src/components/review/stepNames.ts`): 1 *The
requirement under test*, 2 *Test Execution Result*, 3 *Failure Analysis*, 4
*Obstacle triage*, 5 *Requirement revision*. Pages: `ui/src/pages/review/Step1Asked.tsx`
... `Step5Becomes.tsx`.

### 3.2 How a round reaches the page (`ui/src/services/workspace/`)

Three sources: a folder picked with `showDirectoryPicker()` (Chromium only;
read/write, so signing writes into the folder) - `directorySource.ts`;
dropped files - `droppedFilesSource.ts`; a folder served next to the build
with an `index.json` written by `ui/scripts/make-workspace-index.mjs` -
`staticSource.ts`. Files read: `KNOWN_FILES` in `fileSource.ts`
(`run_meta.json`, `analysis_report.json`, `cluster_map.json`,
`simulations.csv`, `decisions.json`, `R0.dsl`, `R1.dsl`,
`requirement_diff.md`, videos, `frames/front_rgb`, `traces`).

### 3.3 Where pre-filled verdicts come from (`ui/src/state/draft.ts`)

`buildDecisions` (`ui/src/domain/decisions.ts`) starts every human verdict
as `null`. Verdicts are **pre-filled only from an existing `decisions.json`
in the round folder** (draft.ts, `existing` -> `prefill`), shown with the
"Pre-filled verdicts" notice in `Step4Decide.tsx`. The study round has no
`decisions.json`; study mode must also refuse to load one.

### 3.4 Where the tool's own verdicts are shown

Each obstacle carries `tool_verdict` (`supported` / `not_supported` /
`insufficient_data`) and each assumption a `tool_verdict` (`load-bearing`,
`not load-bearing`, `untested`, `insufficient data`, ...), copied from the
report by `buildDecisions`. They are displayed in
`ui/src/components/review/DecisionCards.tsx` (the only component whose source
names `tool_verdict`). **Inventory every other place** where the tool's
judgement is visible - e.g. support labels, bars or wording in
`ObstacleSummary.tsx`, Step 3, the goal model with obstacles attached - and
list them for the owner before hiding anything.

### 3.5 The `decisions.json` contract (`scripts/analysis/decisions.py`)

Schema version 1 (see the module docstring for the full shape). Validation
(`validate()`) checks known values only: obstacle verdicts `accept / rename /
reject / defer`; assumption verdicts `keep / tighten / loosen / drop`;
mitigation layers `data / model / system / requirement / scenario`; change
kinds `S / R / D / T`. The UI reproduces Python's output exactly (contract
tests `ui/tests/contract/python.test.ts`). Any field study mode adds must not
break `validate()` or those tests - check `validate()` before adding keys.

### 3.6 Signing (`ui/src/services/signing.ts`)

Produces `decisions.json`, `R0.dsl`, `R1.dsl`, `requirement_diff.md`; writes
them into the folder when the source is writable, otherwise offers them as
downloads. A reviewer-edited R1 is flagged `r1Edited` ("this build cannot
parse-check").

### 3.7 The backend (`scripts/redsl/serve.py`)

Python standard-library HTTP server on `127.0.0.1:8765`
(`sim_env/bin/python -m scripts.redsl.serve`), proxied under `/authoring` by
`vite.config.ts` (dev and preview) and by nginx in the Docker image. It has
`GET /authoring/catalog` and `POST /authoring/check` (parses a requirement;
says whether each named module is implemented: `modules.perception.runs`,
`modules.braking.runs`), `/authoring/match`, `/authoring/runs/...`, and the
cluster endpoints (`/authoring/run...`, `/authoring/jobs/...`). **It has no
endpoint that saves files.** Any new endpoint is a backend change: diff
first, owner's approval.

### 3.8 Tests and builds

`ui/`: `npm test` (Vitest, 24 test files under `ui/tests/`), `npm run
typecheck`, `npm run lint`, `npm run build`. CI: `.github/workflows/ui.yml`.
Python: `sim_env/bin/python -m pytest -q` (315 pass today). The public Docker
image (`Dockerfile.review`) builds `ui/` and serves it with `serve.py`
behind `/authoring`.

### 3.9 The mitigation menu today

Options come from the report's obstacle catalogue
(`scripts/analysis/obstacles.py`, `OBSTACLE_CATALOGUE`), one free-text action
per layer. For the study round several are **out of date or misleading**,
e.g. DetectionTooLate's `system` option proposes proportional braking (C1
already has it); StandoffUnnecessaryStop's `scenario` option refers to an
old crossing trigger. So study mode needs its own menu (section 4.6).

---

## 4. What study mode must do

### 4.1 The switch

- Two tabs in the header: **Normal** and **Study**. Normal = today's tool,
  unchanged.
- Opening the app with a participant link (`?p=P01`, or the form the owner
  chooses: Q1) puts it in Study **and locks it there**: no Normal tab, no
  workspace switch, no author or lineage pages, no way to reach the tool's
  verdicts.
- Opening without a participant link: the researcher can switch freely.

### 4.2 Participant identity

- An ID of the form `P01`...`P99` (Q1). Shown on every screen.
- Every file the session writes carries it. No names anywhere.

### 4.3 Load the round as a labelled replay

- Study mode opens `study_C1` directly (where it is served from: Q3).
- A visible label on every step: *"Pre-computed round: the same results for
  every participant (run study_C1, 288 scenarios x 3 runs)"* (wording: Q6).

### 4.4 The tool's verdicts hidden

- No pre-fill: refuse a `decisions.json` in the round folder.
- Hide every display of the tool's judgement found in 3.4: obstacle
  `tool_verdict`, assumption `tool_verdict`, and any wording or styling
  derived from them (owner approves the inventory first).
- **Keep the evidence**: counts, rates by factor level, traces, the map. The
  participant judges the evidence, not the tool's label.
- Which obstacles to list when labels are hidden: Q4.
- Record in the participant's `decisions.json` that verdicts were hidden.

### 4.5 Interaction log

An append-only, time-stamped log, one JSON object per line (`log.jsonl`):
participant ID, ISO time, screen/step, event type, target (obstacle id,
assumption text, evidence item), old value, new value. Events at least:
session start/end, step entered/left, evidence opened (trace, table filter,
map cluster, obstacle detail), every verdict set or changed, reason text
committed, mitigation chosen or changed, assumption decision, requirement
edited, sign attempted (and why refused), signed. It must be possible to
reconstruct the session from the log alone.

### 4.6 The study's mitigation menu

Per accepted obstacle, the participant picks **one** of:

| Choice | What follows (for the record) |
|---|---|
| Change the car: **path-aware braking** | pre-computed result C2 |
| Change the car: **larger detector (YOLOv5m)** | pre-computed result C3 |
| Change the car: **both** | pre-computed result C4 |
| Change the **requirement** (the promise) - free text | re-judged on C1's simulations |
| Change a **domain assumption** - via the assumption decisions | re-judged on C1's simulations |
| Something else (data, model, test, other car change) - free text | recorded, not run |

Map each to a valid `mitigation.layer` (`system` for the three car changes,
`requirement`, and `data` / `model` / `scenario` for "something else") and
keep the participant's own words in `action`. Exact wording and whether more
than one choice is allowed: Q5.

### 4.7 Signing check

Before signing, the revised requirement (R1) goes to `POST
/authoring/check`: it must parse, and both named modules must be implemented
(`runs: true`). If not: refuse to sign, say why, and log the refusal. If the
backend is not reachable: Q2.

### 4.8 Saving per participant

Files: `decisions.json`, `R0.dsl`, `R1.dsl`, `requirement_diff.md` (as
signing makes today) and `log.jsonl`, all under `study/<participant id>/`
(where: Q2). Never overwrite an existing participant's files.

---

## 5. Acceptance checks (all must pass; show each to the owner)

1. Normal mode behaves exactly as before; all existing `ui/` tests pass.
2. A participant link opens Study, locked; Normal, author, lineage and
   workspace are unreachable.
3. Two participant IDs produce two separate folders; nothing is overwritten.
4. No tool verdict is visible anywhere in Study (owner checks the
   inventory); all evidence still is.
5. A `decisions.json` in the round folder is refused in Study.
6. The log reconstructs a test session step by step.
7. An R1 that does not parse, or names an unimplemented module, cannot be
   signed; the refusal is logged.
8. The signed `decisions.json` passes `scripts/analysis/decisions.py`
   `validate()` and records the participant, hidden verdicts and the menu
   offered.
9. Only the section 4.6 menu is offered in Study.
10. Works in the Docker image (`Dockerfile.review`) and with
    `npm run dev` + `serve.py`; new tests for each check above;
    `npm test`, `typecheck`, `lint`, `build` and the Python tests pass.

---

## 6. Out of scope

Running follow-ups, the analysis across participants, the Cloudflare
deployment, the paper. Do not change the analysis, the study data or the
cluster scripts.

---

## 7. Open questions: ask the study owner before building

- **Q1 Participant link.** `?p=P01` in the URL, a field at the start, or
  both? ID format `P01`-`P99`?
- **Q2 Where sessions run and where files go.** In person on the owner's
  laptop (local `npm run preview` + `serve.py`: files can be written
  directly, e.g. through a new save endpoint in `serve.py` or the folder
  picker), or remote on a hosted page (files come back as downloads)? If the
  backend is unreachable, may a participant still sign (with the check
  skipped and flagged), or not?
- **Q3 Serving the round.** Bundle `study_C1` as a static workspace
  (`index.json`) in the build, or open it from a folder on the laptop?
- **Q4 Obstacles listed.** With labels hidden: show all six obstacles in the
  report (including the three the tool marks not supported), or only the
  supported ones (which leaks the tool's verdict)?
- **Q5 Menu.** Exact wording of the section 4.6 choices; one choice per
  obstacle or several?
- **Q6 Labels.** Wording of the replay label and of any instructions shown
  inside the tool (the spoken briefing is separate:
  `docs/paper/study_briefing.md`, to be written by the other chat).
- **Q7 Timing.** Show time on screen to the participant, or record only?
