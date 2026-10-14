# Review interface (`ui/`): findings and plan

Written 2026-10-08, before any code; approved and built the same day. Status: **built** (see §8 for what differs from the plan).
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
| Load or build your requirement | Step 1 *The requirement under test*: the requirement the round ran with, `performed by` / `assuming` / `ensuring` highlighted, "none stated" when a clause is absent. Read-only: this build loads; it does not author requirements, because a new requirement needs a simulator run, which is out of scope. The layout leaves room for a loader later. |
| Scenic specs + run | The Workspace screen (which folder, which files) and Step 2 *Test Execution Result* (raw counts beside the previous round, one video). Read-only: nothing is launched. |
| Goal model / failures video evidence / fixes patches | Step 3 *Failure Analysis*: goal tree left, evidence panel (simulations, trace, video) top right, candidate mitigations grouped by layer bottom right. |

Steps 4 (*Obstacle triage*) and 5 (*Requirement revision*) follow the
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

## 8. What was built (2026-10-08) and how it differs from the plan

Built as planned, with these differences:

- The report also carries `scenario_artefacts` (the catalogue the scope
  items come from) and `bars` (the support bars), both needed to build the
  decision document in the browser exactly as `decisions.from_analysis` does.
- `refine.change_for()` and `scope_change()` are the single source of the
  change tables; `plan_changes` calls them; the interface selects from
  `obstacles[].changes` and `rules[].as_assumption` and never inverts a rule
  or reads a table.
- The unified diff in `requirement_diff.md` is built here (jsdiff's line
  diff grouped as difflib groups hunks); the contract tests show it
  byte-identical to Python's for the real round and for an assumption edit.
- The five-step flow is covered by a React Testing Library test on the real
  round-2 data that loads a workspace, walks all steps, confirms the
  pre-filled verdicts, edits a reason, signs, and compares the written files
  with the ones the Python demo wrote for the same decisions.
- The H.264 re-stitch was run on the six run folders under `artifacts/runs/`
  (sibling files; originals untouched) and the two example rounds in
  `examples/demo_runs/` carry the H.264 file too, so the demo workspace
  plays in a browser. The committed `analysis_report.json` files were not
  regenerated.
- `Dockerfile.review` builds a container that runs the Python demo, builds
  the interface, and serves it with the demo workspace at `/workspace/`.
- The design-system document (v2) arrived after the first build and was
  applied the same day: its token names and values replace the placeholder
  set; Inter and JetBrains Mono are bundled; tool output became the sunken
  surface with a left rule (no dashed outlines), human input the raised
  surface with a hairline or `human` border; the step indicator is a fixed
  sidebar from 1024 px and a sticky footer below; the obstacle node carries
  a `fail` left rule; numbers in tables are mono with tabular figures;
  the video frame is the only 10 px radius.
- An Apple-style pass (2026-10-08) followed, because the first look read as
  zoomed in and dated: the type scale dropped to desktop-app sizes (14 px
  body, 32 px page title instead of 56), the stone-and-rust palette became
  cool greys with one raspberry `human` accent (#C8175D; `fail` moved to a
  warmer red so the two never read alike), cards lost their borders for a
  hairline plus soft shadow, tags lost their outlines, the top bar became
  frosted glass with the steps as a segmented control, verdicts became a
  row of tiles, and Poppins (bundled, weights 400 to 700) replaced Inter. The meaning rules are
  unchanged: tool output keeps its left rule, a pre-filled verdict still
  looks unlike a confirmed one, and every colour is still paired with a
  word. No logic changed; the 57 tests pass as before.
- The fix became editable (2026-10-08). A chosen catalogue mitigation can
  be reworded (marked "edited by you", with a reset), and "write your own
  fix" takes any layer and an action, including for a candidate obstacle
  the catalogue has no fix for. `decisions.json` already carried
  `{layer, action}` with free text, and refine.py already builds the change
  from the action where its tables have no entry, so the Python side did
  not change; the interface now mirrors `change_for` (`mitigationChange` in
  `ui/src/domain/changes.ts`) instead of only selecting the report's
  recorded change. A table entry (an [S] swap, an [R] item, a mapped
  [D] item) still wins over the wording, which is recorded and said so on
  screen. A contract test with reworded and reviewer-written fixes is
  byte-identical to Python's output. The "Choose a fix" dropdown also stays
  open while a fix is chosen or typed (it used to close on the first pick).
- Patterns across all encounters (2026-10-08), in step 3. A new command,
  `scripts/analysis/cluster_map.py`, reuses cluster.py's event encoding and
  edit distance unchanged but places ALL valid encounters (passes included,
  one point per simulation) so pass-outcome obstacles such as the stalls
  of StandoffUnnecessaryStop show their structure too. Positions: classical
  MDS, two axes, with their fidelity written out (variance carried, rank
  correlation with the true distance). Clusters: average/complete linkage
  swept over thresholds; for each cluster count 2..12 the highest
  silhouette cut is kept, the default is the best overall (it tends to the
  coarsest, so the reviewer can move finer), and every cut states its
  silhouette with the usual reading (below 0.25: no substantial structure,
  neighbourhoods not types). The interface joins points to its own rows,
  so outcome, set-aside and obstacle membership come from the analysis
  report as everywhere else. Colour follows the dataviz method: three
  categorical slots validated all-pairs for colour-blind readers in both
  modes (`series-1..3` tokens), a fourth cluster folds to "other"; outcome
  is the shape (triangle failed, circle stalled, square drove on, hollow
  set aside), so identity never rests on colour. Typical runs fold repeated
  steps ("detection reaches 0.85 x33"). On 2b (156 encounters) the map keeps
  84% of the distance ranking; the best cut has 2 clusters (silhouette 0.33,
  weak); at 4 clusters one cluster holds 8 of the 9 brake-released failures
  with 15 stalls that unfolded alike, mostly crossing left to right.
- Support order, unsupported folded (2026-10-08): obstacles are listed by
  the tool's verdict, then by strength of evidence (share, or effect for a
  setting obstacle), then id (`ui/src/domain/support.ts`, one order for
  every screen). Step 4 shows the supported cards; the rest are one line,
  "N obstacles below the support bar (...) · k still need a verdict", that
  expands to the full cards. In the step-3 goal model each node's
  unsupported obstacles fold into one closed "below the support bar" row
  (opened by click or keyboard, and automatically when one of them is
  selected from elsewhere), and a "Supported this round" line above the
  tree names the supported ones - needed because an obstacle can attach
  where the tree puts it last (2b's StandoffUnnecessaryStop obstructs a soft
  goal the requirement does not name, so it sits under "not attached").
  Nothing is dropped.
- Requirement authoring form (2026-10-08), from the authoring spec: menus
  where the valid set is finite, free text with a real example where it is
  open, the parser as the gate. The interface has no server, so the gate is
  a small local helper, `scripts/redsl/serve.py` (stdlib HTTP, localhost
  only): `GET /authoring/catalog` returns every list read from the code
  (util.py is read as source with `ast`, because importing it loads Scenic,
  VerifAI and MLflow), `POST /authoring/check` runs grammar.py's parser and
  returns the goal tree, line and column on failure, every assumption and
  soft goal classified by the analysis, the scenario words that steer
  generation, and whether each module is one the executor runs. The UI never
  parses DSL: text -> form uses the helper's tree and classifications, form
  -> text is plain rendering in R_baseline.dsl's layout, then checked again.
  Reading the code added three silent failures to the spec's three: unknown
  braking names are fuzzy-matched (`proportional_braking_with_resume` runs as
  `proportional_braking`); the modules are found by task name ("Detect
  Pedestrian", "Apply Brakes"), so a renamed task silently falls back to the
  default - the form fixes the role's task; and the scenario vocabulary is
  wider than the spec's list (adult, child, kid, light, bright, dark, left,
  right, close, near, short, far, long, fog, foggy, clear), with "fog"
  fixing fog_density at 50. `few_shot` is a fourth detector. Not in the form
  (raw-text mode says so): several goals, "parallely", "triggering", nested
  refinement, "&" between objectives, "|" in conditions. Refining on screen 5
  stays raw text (authoring first, as the spec allows). Code text no longer
  uses font ligatures, so "<=" is never shown as one symbol.
- The authoring page lists the runs that already used the requirement being
  written (2026-10-08): each loaded run's requirement goes through the
  helper's check and is a match when its goal tree equals the form's, so the
  parser, not a text comparison, decides; results link into steps 1-3. On
  the R_baseline requirement it finds run 2b and the first GE run. Revised
  the same day: the open workspace was only ever the bundled example in a
  browser without the folder picker (Safari, the editor's browser), so the
  helper now does the search over artifacts/runs itself (`POST
  /authoring/match`) and serves that folder read-only as a workspace
  (`/authoring/runs/index.json` and files, byte ranges for Safari's video).
  "Show these runs in the Workspace" opens it and lands on `#/?runs=...`,
  where the matching runs come first as the Rounds screen's full cards. On
  R_baseline: 6 of 9 runs (2b, the GE run, four smoke runs).
- KAOS diagram view, phase 1 (2026-10-08), from the diagram spec, approved
  after a fixed-position mockup. Screens 1 and 3 have one switch, Text /
  Tree / Diagram, over the same parse tree and the same selection; the
  choice is remembered per screen (`src/state/requirementView.ts`; Text is
  screen 1's default, Tree screen 3's). Notation follows the paper's Fig. 2
  legend where the spec differed: agents are hexagons (the small circle is
  the responsibility link), obstacles left-slanted salmon parallelograms
  joined by a crossbar-and-arrow obstacle link; goals parallelograms, soft
  goals dashed, domain properties the house shape. `src/domain/kaosLayout.ts`
  is a hand-rolled top-down layout for the DSL's shallow trees: domain
  properties stacked left of the top refinement, sub-goal columns with their
  operation and module, soft goals right (sharing the last obstacle column
  when they fit above it, else their own column), each obstacle beside the
  node the goal model attaches it to (blocks_goal / domain_property by name,
  never inferred), the rest in "Nothing in the requirement to attach these
  to" with the reason. It checks every pair of boxes and returns a reason,
  never an overlapping diagram; the view then shows the tree with that
  reason. Obstacles are coloured by verdict (supported, insufficient data,
  not supported) with counts, and the round-to-round status when a previous
  round is loaded; "masked" is not in the analysis output, so it is not
  drawn. Selecting an obstacle dims all but its chain (obstacle, obstructed
  node, responsible module) - the only motion, inside prefers-reduced-motion.
  In Diagram mode the goal-model card spans the page; below the laptop
  breakpoint the diagram scrolls inside its card and points to Tree. Tested:
  every fixture report lays out with no overlap, every obstacle drawn, no
  domain property or soft goal that is not in the tree; the three views keep
  one selection; the choice persists. Phase 2 (R0 -> R1 change in place, with
  [S]/[R]/[D] labels) is not built.
- Step 2 renamed "Test Execution Result" and rewritten as a test report
  (2026-10-08): test cases (scenarios), runs (simulations; the video
  recording pass is not a run), passed, failed and not counted, each leading
  to its simulations; "What failed in the requirement" lists the safety goal,
  every soft goal and every assumption with its result this round, failed
  first (from the report's failure model, soft-goal and assumption
  summaries); every test case in a table that expands to its runs, with
  "only failing", expand / collapse all, and downloads (test cases CSV, all
  runs CSV, the raw simulations.csv); the full count table beside the
  previous round in a dropdown. The video panel (steps 2 and 3) has a ✱
  beside best_scenario.mp4 that opens what "best" means: best for the
  search, worst for the car - the hardest test case found, and the only run
  recorded on video. Renamed in the Streamlit page too.
- Progress tracker (2026-10-08), above every review step and sticky under
  the top bar (a floating frosted card); it replaces the step list that was
  in the top bar, which now names the run under review. Five nodes on one
  track, each with its name and one line of live status from the round's
  data (`src/domain/reviewProgress.ts`): 1 assumptions and soft goals
  stated (or "did not parse"), 2 cases, runs and failures, 3 supported and
  below-the-bar obstacles, 4 verdicts decided out of all (a ring around the
  node fills as they are made; pre-filled verdicts count only once
  confirmed), 5 signed or what is left to settle. Steps 1-3 are done once
  visited (kept for the session, `src/state/visitedSteps.ts`), 4 when every
  verdict is the reviewer's own, 5 when signed; an amber dot marks what
  needs attention (a requirement that did not parse, failed runs, proposed
  verdicts to confirm). The track fills to the current step; that fill and
  the ring are the only motion, under prefers-reduced-motion. Every node is
  a link. Below md it collapses to "Step n of 5 · name", five segments and
  the current status.
- Requirement authoring rebuilt like Overleaf (2026-10-09, Paul: "the form
  is too complicated"): the form cards are gone; the left pane is the DSL as
  text with gaps (`src/components/requirement/TemplateEditor.tsx`), free gaps
  with datalist suggestions gathered by the helper from every
  docs/examples/*.dsl (`catalog.suggestions`, per role) plus what is already
  written, bounded gaps as menus from the code; the right pane is the KAOS
  diagram of the latest text that parsed (the same `layoutKaos` /
  `KaosDiagram` as review screen 3, fed by the helper's tree through
  `modelSourceFromCheck`), Fit or 100 %, kept dimmed as "last version that
  parsed" while the text does not parse. Each numbered line is one line of
  `toDsl`'s output, so the parser's line number marks the editor line. The
  form state and `toDsl` / `fromCheck` are unchanged, so the round trip
  through the parser still holds; plain text stays as the escape hatch. The
  page gets a wider limit (112 rem) than the review screens.
  Restyled the same day as an IDE ("too bright, reduce the texts"): gaps read
  as plain text (no boxes; an empty gap is a grey one-word placeholder on a
  dashed underline; only the focused gap looks like a field), muted syntax
  colours (keywords slate, modules teal, quotes faint), the add buttons and
  sub-goal controls appear only on the hovered or focused line, and the role
  tags, legends, subtitle and captions are gone.
- Run test (2026-10-09): Workspace -> Write a requirement -> Run test ->
  Test Execution Result (top bar reordered to match). A requirement whose
  exact goal tree already has an analysed grid run opens the latest one (a
  GE search is only a fallback: it is not a test execution of the
  requirement). Otherwise, after an explicit confirmation naming the cost (32
  x 5 simulations, about 2 h plus queue, the reviewer's allocation), the
  helper (`scripts/redsl/cluster_jobs.py`) saves `requirements/<name>.dsl`
  (never overwriting other content), copies it to the cluster's project
  copy, submits the existing job script with REAL_REQUIREMENT_FILE, and is
  polled every 30 s (state, `[grid] scenario n/32` from the job log, the run
  id from the log or from the run folder whose run_meta names the
  requirement); on completion it rsyncs the run, writes its report under the
  default (path-aware) rule and its cluster map, and the page opens review
  screen 2. All remote commands use the reviewer's ssh ControlMaster
  session (BatchMode, nothing stored); without one, nothing is submitted
  and the page says how to open one. The job id is kept in the browser so a
  reload resumes following it. Tested against a fake cluster; no job was
  submitted while building it.
- Run test guards (2026-10-09): before saving, copying or submitting, the
  helper checks over ssh that the cluster's source overlay exists (it no
  longer `mkdir -p`s it: an almost empty overlay would be mounted over the
  image's code) and that the md5 of `scripts/redsl/grammar.py`, `api_app.py`
  and the job script match this project's (`cluster_jobs.MUST_MATCH`). A
  mismatch names the files and says to sync; nothing is sent.
- Editor contrast (2026-10-09): the grey was too faint. Keywords use a
  dark blue code colour (`--color-code-keyword`, light and dark), empty gaps
  show their placeholder in italic muted text over a raspberry dashed line,
  and quotes no longer use the faintest grey. A disabled primary button keeps
  its raspberry tint instead of turning grey, and Run test says why it cannot
  run yet ("Fill 10 gaps to run").
- Live cluster connection (2026-10-13/14, study-plan task 1a.6): Run test
  runs the hand workflow by clicks. Before anything is sent: options checked
  (one per job script variable, `--time` at most 05:00:00 because the job's
  request gives up at 17,400 s); a laptop check in its own process
  (`scripts/redsl/preflight.py`: modules resolved as the API does, Scenic
  scenes built with the stand-ins of `tests/test_scene_compile.py`); the
  cluster copy checked against `CODE_MANIFEST.txt` (written at sync time:
  hashing the ~600 files on scratch took 16 min, the manifest plus a 6-file
  spot check 1.3 s) with the differing files and blocking jobs named. A list
  file identical in the cluster copy is passed by its own path, so a list run
  records what a hand run records. While running: status from squeue/sacct
  and the job log (node, ports, n/N from the run, tracebacks with MLflow's
  "Error handling request" reports counted apart - real logs have many that
  are not failures - and the last 15 lines); the run id only from a run
  folder created after the job started, never guessed between two; every
  5 min a pull of the light files and a report into
  `partial/after_<n>_of_<N>/` (kept; `latest.json` points at the newest),
  served as the run's report until the final one exists, its PARTIAL banner
  shown on every review step. At the end, any end state: whole run + log,
  final report (INCOMPLETE banner if it ended early), or the log alone in
  `artifacts/job_logs/`. The tool never syncs or cancels (it shows
  `scancel`). Job ids and cluster paths stay in git-ignored files.
- Guided Run test panel (2026-10-14, after the reviewer found the run box
  hard to follow): one modal panel in three steps (Choose / Check / Run)
  replaces the box at the top of the right column. Plain choices first
  (_Quick check_, _Full test_; the job script's options under _More options_,
  a change shown as _Custom_), an existing result offered beside them; the
  checks split into two helper calls (`/authoring/run/check-laptop`, reused by
  Submit for 10 minutes, and `/authoring/run/check-cluster`) so they tick off
  one by one; one sentence and one button per failure; a timeline while it
  runs; closing never stops a job (the toolbar button follows it). Also: an
  empty answer from the cluster's code check is a failed check ("did not
  answer properly", raw answer kept), not "every file missing" - seen once.
