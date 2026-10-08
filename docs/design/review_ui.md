# Review interface (`ui/`): findings and plan

Written 2026-10-08, before any code. Status: **proposed, awaiting approval**.
This document records (1) what the repository's data files do and do not
contain, measured against the brief for the review interface, (2) the Python
additions the interface needs, and (3) the architecture of the interface
itself. The Streamlit page (`pages/4_review.py`) stays where it is and keeps
working; it remains the reference for step names and wording.

## 1. What the interface is

A static, file-backed web application (React + TypeScript) that reads a
*workspace* (a folder of run folders) and lets a reviewer walk one round
through five steps, record verdicts, and sign them. It writes exactly the
files the command-line review writes: `decisions.json`, `R1.dsl`,
`requirement_diff.md` (plus `R0.dsl`, as the CLI does). No server, no
database, no network. The sketch (three panels: load the requirement →
scenario specification and run → goal model with failure evidence top right
and fixes bottom right) maps onto the flow as follows:

| Sketch panel | Interface |
|---|---|
| Load or build your requirement | Step 1 *What we asked*: the requirement the round ran with, `performed by` / `assuming` / `ensuring` highlighted, "none stated" when a clause is absent. Read-only: this build loads; it does not author requirements, because a new requirement needs a simulator run, which is out of scope. The layout leaves room for a loader later. |
| Scenic specs + run | The Workspace screen (which folder, which files) and Step 2 *What happened* (raw counts beside the previous round, one video). Read-only: nothing is launched. |
| Goal model / failures video evidence / fixes patches | Step 3 *What pattern*: goal tree left, evidence panel (simulations, trace, video) top right, candidate mitigations grouped by layer bottom right. |

Steps 4 (*What you decide*) and 5 (*What the requirement becomes*) follow the
Streamlit page one for one.

## 2. Data check: what the files contain

Checked against the real run folders under `artifacts/runs/` (rounds 1 and 2,
run 2b smoke runs, scene v2.3 smoke run) and the code that writes them.

### 2.1 Parsed requirement tree (brief §9, prerequisite 1): **partially present**

`analysis_report.json → requirement` holds the leaves and clauses:
`operations[]` (task, condition, module, inputs, outputs), `assumptions[]`,
`soft_goals[]` (reports from 2026-10-01 on), `scenario_text`,
`detection_module`, `parsed`. It does **not** hold the top goal (`MAINTAIN
"Pedestrian Safety"`), the refined goals (`"Pedestrian Check" using
"Perception Module"`, `"braking" using "braking module"`), or how they are
composed (`followed by` / `parallely`). The Lark parse tree has all of this
(`goal → objective, refined_goal(refined_goal, refined_goal), scenario,
assumption*, soft_goal*`); only the export is missing. The combinator keyword
is an anonymous token Lark drops, so it has to be recovered from the source
text between the two child goals (`propagate_positions=True`), which avoids
touching the grammar.

**Needed:** `DSL.get_goal_tree()` in `scripts/redsl/grammar.py`;
`requirement_context()` in `scripts/analysis/obstacles.py` adds it as
`requirement.tree`. Shape:

```json
"tree": {
  "temporal": "MAINTAIN", "objective": "Pedestrian Safety",
  "refinement": {"combinator": "followed by", "goals": [
    {"objective": "Pedestrian Check", "agent": "Perception Module",
     "operations": [{"tasks": ["Detect Pedestrian"], "condition": null, "module": "yolov5s",
                     "inputs": ["image"], "outputs": ["pedestrian detection confidence", "pedestrian detection flag"]}]},
    {"objective": "braking", "agent": "braking module",
     "operations": [{"tasks": ["Bring down throttle", "Apply Brakes"], "condition": "pedestrian detection flag=True",
                     "module": "proportional_braking", "inputs": ["pedestrian detection flag"], "outputs": ["Braking Status Flag"]}]}]},
  "scenario": "A pedestrian trying to cross the street in fog.",
  "assumptions": ["..."], "soft_goals": ["..."]
}
```

Reports without `tree` are still loadable: the interface shows the
requirement text and the operations as a flat list, says the goal tree is not
in this report, and attaches nothing.

### 2.2 What each obstacle obstructs (brief §9, prerequisite 2): **present**

Every obstacle carries `blocks_goal` (a task or goal name: `Detect
Pedestrian`, `Apply Brakes`, `Pedestrian Safety`, or the soft goal `Smooth
Braking / Progress`) and `domain_property` (`PedestrianVisible`,
`PedestrianCrossesWhenSafe`, or null). Attachment is a name lookup, not a
computation: an obstacle attaches to the operation whose `tasks` contain
`blocks_goal`, or to the top goal; otherwise it is shown **unattached** with
its named domain property. On every run so far, `StandoffUnnecessaryStop`
is unattached (the requirement states no soft goal of that name), and the
paper's domain properties never match an `assuming` item, so no obstacle
attaches to an assumption. That is the truthful picture and the brief asks
for it to be shown, not hidden.

Optional later improvement (not needed now): let a catalogue entry name the
soft-goal quantity it concerns (`resume_within_s`) so the report can link it
to a stated `ensuring` item.

### 2.3 Per-simulation outcome and admissibility: **absent from the files** (not in §9, but required by Features 3 and 4)

`simulations.csv` has `passed` and the raw measures. The outcome of each
simulation (`passed`, `passed_stalled`, `no_encounter`, `left_road`,
`not_crossed`, `never_detected`, `detected_too_late`, `brake_released`,
`braking_insufficient`, `stopped_too_close`), whether it counts as an
encounter, whether it is admissible and why not, and each assumption's
held / broken / not-measured status are computed by
`scripts/analysis/failure_model.py` and `admissibility.py` **in memory** and
only aggregated into the report. Without them the evidence table cannot show
an outcome or a set-aside reason per row, and only setting-based obstacles
(`pedestrian = Child`) can be traced to rows; behaviour-based ones
(`detected_too_late`) and the outcome-based one (`passed_stalled`) cannot.
Re-deriving them in TypeScript would duplicate the stopping-distance rule
and the encounter rule, the same drift risk §9 names for the parser.

**Needed:** `scripts/analysis/report.py` adds to `analysis_report.json`:

```json
"schema_version": 2,
"simulations": [
  {"scenario_id": "0", "sim_index": 0, "outcome": "passed_stalled", "encounter": true, "failed": false,
   "admissible": true, "set_aside_reason": "", "assumptions": {"fog_density <= 50": "held"},
   "soft_goals": {"resume_within_s <= 10": "missed"}, "trace": "traces/0_0.json"}
]
```

One entry per row of `simulations.csv` (about 160; ~30 KB). Rows for the
`best_video` recording pass are listed with `"recording_pass": true` so they
are visible but never counted. The report gains a `schema_version` so the
interface can refuse a version it does not understand by name; reports
without one are treated as version 1 (loadable, degraded as in §2.1).

### 2.4 The proposed requirement: the change tables live only in Python

Step 5 shows R1 beside R0 as the reviewer decides. R1 is derived by
`scripts/analysis/refine.py`: the table *(obstacle, mitigation layer) →
change* (`S_CHANGES`, `R_CHANGES`), the executor's available modules, the
rule inversion for out-of-scope verdicts, and the text assembly
(`apply_changes`). Porting the tables to TypeScript would create a second
source of truth.

**Needed:** `refine.py` exposes `change_for(obstacle_id, layer, action)`
(the existing logic, factored out; `plan_changes` calls it so there is one
source); `report.py` records, per obstacle, `changes: {layer: change}` next
to `mitigations`, and per admissibility rule `as_assumption` (the inverted
rule as `assuming` text). The interface then only *selects* changes and
assembles text. The assembly (`apply_changes`, `render_diff`, the
assumption keep / tighten / loosen / drop logic) is ported to TypeScript and
held to Python by a contract test (§4).

What the browser cannot do is parse-check a hand-edited R1 with the Lark
grammar. A tool-assembled R1 parses by construction when R0 parsed; a
hand-edited R1 is written with a visible note that it has not been
parse-checked here and that `python -m scripts.analysis.refine` re-checks it.

### 2.5 Videos: not playable in a browser

`scripts/evolve/video.py` writes `best_scenario.mp4` with the `mp4v`
four-character code, i.e. MPEG-4 Part 2. Chrome, Safari and Firefox do not
decode it; a `<video>` element shows an error. Every run folder also has the
recorded frames (`frames/front_rgb/*.png`, 26 to 124 per run). OpenCV in the
local environment can write H.264 (`avc1`), verified 2026-10-08.

**Needed:** `video.py` tries `avc1` first and falls back to `mp4v`,
recording which it used. For existing runs, a one-off re-stitch from the
saved frames into a sibling file (`best_scenario_h264.mp4`), never
overwriting the original. The interface prefers the H.264 file, detects a
playback error otherwise, says so, and offers the frame sequence as a
scrubber. The sampling of the frame recording is unchanged.

### 2.6 `decisions.json`: the contract to match byte for byte

The CLI path (`review.py` → `decisions.save`, then `refine.refine` adding
`requirement_changes`) writes with Python's `json.dump(doc, indent=2)`:
two-space indent, keys in `from_analysis` insertion order, non-ASCII
escaped as `\uXXXX`, no trailing newline, `decided_at` as
`YYYY-MM-DDTHH:MM:SS.ffffff+00:00`. The Streamlit page adds one extra key
(`proposed_by_tool: false`); the interface follows the CLI shape. A
pre-existing `decisions.json` is shown as **pre-filled, not yet confirmed**
whatever its reviewer field says, with its provenance (reviewer, date,
whether it is the tool's proposal) beside every verdict; signing writes the
current reviewer's name. This is the state the brief singles out
(§15) and it is the first thing to get right.

### 2.7 Regenerating the committed reports

Re-running `python -m scripts.analysis.report` on rounds 1, 2 and the 2026-10-06
smoke run (into a scratch folder, 2026-10-08) changes **no number**: the only
differences are the newer keys (`sampling`, `by_scenario` outcome columns,
`n_left_road`, `n_not_crossed`, `failure_rate_scenarios`, …) and one
warning sentence's wording. Regenerating the committed reports in place is
therefore safe numerically, but it is the user's call (the standing rule is
never to overwrite a result). Until then the interface loads them as
version-1 reports.

## 3. Architecture of `ui/`

Stack: React 18, TypeScript, Vite, Tailwind, Vitest + React Testing
Library. Deviations from the brief, each with its reason:

- **Tailwind v4** (CSS-first `@theme` tokens in `src/styles/tokens.css`)
  rather than a v3 `tailwind.config` extension: v4 is the current, maintained
  line; a v3 token table converts mechanically. The design-system tokens go
  in when the document arrives; until then a neutral placeholder set is used
  and nothing else in the code depends on token values.
- **Radix UI has no tree primitive.** `RadioGroup` is used for verdicts; the
  goal tree follows the WAI-ARIA tree pattern (roles `tree` / `treeitem` /
  `group`, roving tab index, arrow keys, `aria-expanded`, `aria-selected`),
  implemented in-house (~150 lines) and keyboard-tested.
- **zod** for schemas: the schemas are written from the real files and the
  TypeScript types are inferred from them, so loading validates and a missing
  field is a named error (`analysis_report.json: failure_model.passes is
  missing`). This replaces "types generated from JSON" with one artefact that
  does both.
- **papaparse** for `simulations.csv` (quoted fields, 55-column headers that
  differ between scene versions); **diff** (jsdiff) for the line diff on
  step 5 and in `requirement_diff.md`.
- **No router library.** Three screens and a step index are kept in a
  20-line hash route (`#/workspace`, `#/lineage`, `#/review/<run>/<step>`) so
  reload and the browser's Back keep their place.
- **Fonts** are self-hosted through `@fontsource/*` packages (bundled woff2
  files, no CDN) once the design system names them.

Reading and writing files with no server:

- **Source A, static:** a folder served at `/workspace/` next to the build
  (the container demo). A static server cannot list directories, so the
  folder carries `index.json` (rounds and the files each has), written by
  `ui/scripts/make-workspace-index.mjs` or by the Python demo. Writes are
  impossible here: signing offers the three files as downloads and says so.
- **Source B, local folder:** `showDirectoryPicker()` (Chromium: Chrome,
  Edge) gives read *and* write access to the chosen workspace, so signing
  writes into the run folder exactly as the CLI does. Browsers without the
  File System Access API fall back to a folder `<input>` / drag-and-drop
  (read-only) and downloads on signing. The Workspace screen states which
  mode is active before the reviewer starts.
- Every file read is named on the Workspace screen and on the step that uses
  it. Nothing derived from file content is fetched or executed.

Layout:

```
ui/
├── index.html, package.json, vite.config.ts, tsconfig.json, eslint.config.js
├── public/            fonts (via @fontsource), workspace/ (gitignored; demo copies a workspace here)
├── scripts/           make-workspace-index.mjs
├── src/
│   ├── main.tsx, App.tsx
│   ├── pages/         WorkspacePage, LineagePage, ReviewPage
│   ├── layouts/       AppShell, ReviewShell (step indicator + Back/Next, always in view)
│   ├── components/
│   │   ├── ui/        Button, Chip (S/R/D/T kinds, verdict states), Field, Table, Notice
│   │   ├── requirement/  DslBlock (three parts highlighted), GoalTree, GoalNode, ObstacleNode, RequirementDiff
│   │   ├── evidence/  SimulationTable (cards on mobile), TraceView, VideoPanel (H.264 or frame scrubber)
│   │   ├── review/    VerdictControl (empty / pre-filled / confirmed), MitigationMenu, ScopeVerdict, AssumptionVerdict
│   │   ├── lineage/   RoundRow, ChangeRow
│   │   └── feedback/  Empty, LoadError, Loading, UnsupportedSchema
│   ├── services/      workspace sources (static, directory handle, dropped files); loaders; writers; schemas (zod)
│   ├── domain/        pure functions: lineage, attachObstacles, buildDecisions (= from_analysis), planChanges, applyChanges, renderDiff, pythonJson (json.dump-compatible serialiser)
│   ├── state/         WorkspaceContext; DraftDecisionsContext (useReducer, sessionStorage per run id)
│   ├── hooks/, types/, utils/, styles/
├── tests/             unit (domain), component (RTL), contract/ (Python parity, skipped without Python)
└── README.md
```

State: UI state (step, selected obstacle, filters) is local; loaded data is
in one context; draft decisions are one serialisable document per run id in
`useReducer`, mirrored to `sessionStorage` under `real-review:draft:<run_id>`
and clearly labelled a draft everywhere. The signed file on disk is never
read back into the draft silently: opening a round with a `decisions.json`
shows it as pre-filled (§2.6).

Lineage: rounds are ordered by `round`, then `created_at`; the link between
two rounds is `parent_run_id`, and the change row between them comes from
the parent's `decisions.json → requirement_changes` with its reviewer.
Rounds without `parent_run_id` (rounds 1 and 2) are shown in date order with
the link labelled "no recorded lineage". The requirement version column
labels identical requirement texts identically (same text, same label) and
shows `requirement_source` when recorded. State per round is read from file
presence: no `analysis_report.json` → not analysed; `decisions.json` with
`decided_at` → signed (or "tool proposal" when marked so); otherwise awaiting
signature; `run_meta.status != complete` → not finished.

Numbers: every count on screen is the file's value; the interface displays
the rows behind it and, if the row count disagrees with the file's number,
says so instead of trusting either. Set-aside simulations are a group of
their own with their reason and never counted as passes.

## 4. Validation

- Unit tests on the pure domain functions (attachment, lineage, decision
  document, change planning, serialisation).
- Component tests with React Testing Library: the five-step walk with draft
  preservation, every verdict path, the pre-filled state, empty and error
  states for a missing or malformed file, set-aside rows never counted.
- **Contract tests against Python** (skipped when no interpreter is found):
  the `decisions.json` the interface writes is byte-identical to
  `decisions.save` + `refine.refine` for the same inputs; `applyChanges`
  and `renderDiff` match `refine.apply_changes` / `render_diff`.
- Build, type check, lint; then the full flow in a real browser on the real
  round-2 folder, desktop and phone widths.

## 5. Repository hygiene

The new code contains no personal names, machine paths, cluster names or
job identifiers; the package has no author field; the bundled example
workspace is labelled as example data in the interface. `.gitignore` gains
`ui/node_modules`, `ui/dist`, `ui/coverage`, `ui/public/workspace`. A
GitHub Actions workflow for `ui/` (install, lint, type check, test, build)
is proposed alongside. Existing documents (`AGENT_HANDOFF.md`, `Notes.md`,
the demo section of `README.md`) still contain identifying material and are
left for a separate anonymisation pass.

## 6. Proposed Python changes (all additive; nothing applied automatically)

| File | Change | Tests |
|---|---|---|
| `scripts/redsl/grammar.py` | `Lark(..., propagate_positions=True)`; `get_goal_tree()` | tree of `R0_rounds1_2.dsl` and `R_baseline.dsl`; combinator recovered; unparsed → `None` |
| `scripts/analysis/obstacles.py` | `requirement_context()` adds `tree` | existing tests + one |
| `scripts/analysis/refine.py` | factor `change_for()`; `plan_changes` uses it | existing `test_refine.py` unchanged and green |
| `scripts/analysis/report.py` | `schema_version: 2`; `simulations[]`; `obstacles[i].changes`; `rules[i].as_assumption` | counts in `simulations[]` equal `failure_model` counts; JSON round-trips |
| `scripts/evolve/video.py` | prefer `avc1`, fall back to `mp4v`; one-off re-stitch script writing `best_scenario_h264.mp4` | writer opens; file contains `avc1` |

Existing `analysis_report.json` files are not rewritten unless asked (§2.7).
`pages/4_review.py` is untouched and keeps working.

## 7. Order of work

1. Python additions above, with tests; regenerate reports only into the demo
   workspace (the demo already writes to its own output folder).
2. `ui/` scaffold: tooling, tokens placeholder, schemas, loaders, the
   `decisions.json` writer and its Python contract test.
3. Step 3 (goal model + evidence + mitigations), then steps 4 and 5 with the
   sign action, then steps 1 and 2, then lineage and the Workspace screen.
4. Browser validation on the real round-2 folder; documentation
   (`ui/README.md`, `README.md`, `AGENT_HANDOFF.md`, `Notes.md`).
