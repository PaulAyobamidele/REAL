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
- Study mode (2026-10-18, in progress; brief `docs/design/study_mode_brief.md`,
  decisions in Notes 8.54): a separate study-only build (`VITE_STUDY=1`) for a
  GitHub page - the normal tool's pages and flow for one participant, runs
  replayed from the pre-computed rounds, the tool's verdicts hidden, every
  action logged, one zip per participant. Step 1: `ui/src/study/` - a start
  screen (profession, random anonymous ID `S-XXXX` shown in the header), the
  session kept in the browser (a reload resumes it), and an append-only log of
  screens and steps entered and left. Step 2: the rounds bundled by
  `scripts/make-study-site.mjs` (C1 to review, C2-C4 as follow-ups with their
  v2 reports; neutral run ids - sha256 of the study id - so nothing on screen
  says "study"; the real id kept as `study_round`); the study Workspace has one
  fixed source; `decisions.json` in a round is refused; report banners hidden.
  Step 3: the replayed Run test. The Run test hook takes its cluster calls from
  one object - the live helper, or in the study build `src/study/replay.ts`,
  which answers the same calls with the same shapes from the saved rounds
  (checks ~4 s, queue ~6 s, 288 scenarios over ~50 s, a 7-digit job number, a
  node, ports; no partial reports, since none exist to show). A round is
  revealed only when its replay is fetched (`src/study/studySource.ts`, per
  participant), as a run comes back in the real tool. Write a requirement
  works without the helper from files made at build time
  (`study-authoring/`: catalog + R0's check; not `authoring/`, which the dev
  and preview servers forward to the helper).
  Step 4: the tool's judgement hidden, behind the one `STUDY` switch - the
  13 inventoried places plus four found while testing (the "Supported this
  round" row, the "What the tool says" headings, the round-to-round status
  chip whose wording follows the verdict, and the catalogue's fixes on step
  3); obstacles A to Z everywhere; the study menu (six choices, `choice`
  recorded beside a valid layer; "Change a domain assumption" -> layer
  `requirement`, owner 2026-10-18); every accepted obstacle needs a fix
  (`isComplete` / `completionGaps(doc, everyAccepted)`). A test walks the five
  steps of a fixture round for verdict words; the built site was scanned the
  same way on the real study round (no words, no verdict colours).
  Step 5: signing. R1 from the tool only; the study's car changes become
  module swaps adding up to C1-C4 (`study/car.ts`); own-words changes stay in
  decisions.json. Checks before signing: R1's car is one of C1-C4 and bundled
  with the site; no double quote in an assumption text. A `study` block in
  decisions.json; one zip per participant with the four signed files and
  `log.jsonl`. The log now has every decision (old and new value; typing
  grouped per field, flushed before signing) and every click on something
  interactive (evidence opened). The log falls back to memory only if the
  browser's storage fails.
  Step 6: re-judging on the same simulations. What Python computes before the
  assumptions (outcomes, run quantities, trace measures, the safety rule,
  test-scope rules, failure types) is exported per simulation at build time
  (`ui/scripts/study_quantities.py`, the analysis's own functions); the page
  ports the rest of `analyse()` for what the Test Execution Result shows:
  parse/check assumptions, their summary and verdict, soft goals over counted
  encounters, the failure model's counts, the per-simulation records and the
  spurious summary. Not recomputed: obstacles, failure rates by parameter and
  scenario, timing, map (`rejudged.partial`). Contract-tested against
  `analyse(run, requirement=R1)` for six revised requirements - exact on run
  2b (160 simulations) and on the study round C1 (864).
  Decision (owner, 2026-10-18): the session ends at signing - the study needs
  the participant's first refinement; R1 is run on the cluster afterwards.
  So no Run test on R1 in the page (planned step 7 dropped); the re-judging of
  step 6 stays in the code, unused by participants. After signing, a
  thank-you screen with the zip (`study/ended.ts`, `EndScreen.tsx`); the log
  ends with `session_end`.
  Step 8: `npm run publish:study` (build, then - after a y/N prompt - a
  single-commit force push of the built site to `gh-pages`, `.nojekyll`
  included; the round data never enters the main history); the build is
  stamped with `git describe --always --dirty`. The brief's ten acceptance
  checks passed on a GitHub-Pages-like static server with the site in a
  sub-folder (`artifacts/cluster_checks/2026-10-18_study_mode_acceptance.md`).
- Palette (owner, 2026-10-19): five colours, one job each, defined once as
  tokens (`src/styles/tokens.css`): `#EAEAAA` page background; `#9EB200` the
  instructions box ONLY (`components/ui/Instructions.tsx`: the start screen,
  the line under each step title, the run panel's guidance, step 5's signing
  note) so the eye learns to read it first; `#8A1538` (wine, was `#610000`) the header, the same on
  every page including the study's start and thank-you screens; `#667D01`
  the primary button fill, and a 12% darker shade `#5A6E01` for green text,
  links, selection, focus and "passed" (4.6:1 even on the page background,
  where the palette green gives only 3.7:1); `#AD1F07` failed and errors.
  Text `#172033`, cards white. Meaning is never colour alone (a word or ✓/✕
  beside it). Light only (dark mode removed; `dark:` styles need a class the
  app never sets). KAOS notation, change kinds and map series keep their
  colours. `tests/styles/contrast.test.ts` checks every text/background pair
  in the tokens against WCAG 2.2 AA and that the bright green has no other use.
- Start screen and name (owner, 2026-10-19): the study's first page shows the
  tool's name, REAL, large and centred, with "A Tool for Refining Autonomous
  Systems Requirements through Compliance Failure Analysis" beneath; the
  participant's background is now their expertise, typed in their own words
  (`study.expertise` in decisions.json, `session_start` in the log), not six
  buttons. The header and the page title read REAL in both builds.
- Greens swapped (owner, 2026-10-19): the instructions box is `#667D01` with
  white text (4.7:1) and is that colour's only use; the primary button is
  `#9EB200` with dark text (6.8:1). Neither green is a text colour any more:
  links, "passed", selected items and the focus ring are the dark text
  colour, marked by an underline (links always underlined; text-like buttons
  too), a tick or a border. The contrast test checks the new pairs and that
  `#667D01` has no use but the instructions box.
- Overview page (owner, 2026-10-19): a first page before the Workspace, first
  in the top bar (`#/overview`, `pages/OverviewPage.tsx`). The normal tool
  opens on it ("How REAL works": what REAL is for, one round step by step,
  where things are); the study goes to it right after Start ("Overview":
  what it is about, the system under test, what the participant will
  do, what is recorded) - neutral wording, no hint of which failures matter or
  that runs are pre-computed (a test checks). Both lead on to the Workspace.
  Both also show the tool's architecture (the paper's Fig. 1, copied to
  `ui/src/assets/real_architecture.png`, wider than the text, opens full size)
  and a help-video card: its link comes from `VITE_HELP_VIDEO_URL`
  (`src/config/help.ts`). The play button opens the video in a pop-up on the
  page (YouTube links play in the embedded player, other links as a video
  file); with no link set the button does nothing and no note is shown.
- Study flow (owner, 2026-10-19): the study build has no Workspace. Its nav is
  Overview, Requirement under Test, Rounds; Overview leads on to the
  requirement page, and `#/` redirects there. The requirement page is called
  "Requirement under Test" in the study (the participant reads and runs R0,
  does not write it; the term matches "system under test" and review step 1);
  the normal tool keeps "Write a requirement" (`src/study/labels.ts`). The
  round still opens straight from the run, and from Rounds afterwards.
- Requirement page (owner, 2026-10-19): titled "Requirements Compliance to
  Validate" in both builds (replaces "Write a requirement" / "Requirement
  under Test"). Under the title, an instructions box of short numbered steps,
  like every page with steps (start, overview, review steps 1-5): normal tool
  "load your requirement written in REAL-DSL (See manual), or write it";
  study "a test has already been run on this requirement; its REAL-DSL is
  shown, read only". The page does one thing: "Results for this requirement"
  (MatchingRuns) is gone. Run test is centred under the page, as is every
  page's way on (`components/ui/PageActions.tsx`): Continue on the overview,
  Back / Next on the review steps (the floating round buttons are gone), Sign
  on step 5 - all `size="lg"`, the action colour for the main one.
- REAL-DSL editor (`components/requirement/DslEditor.tsx`,
  `dsl/language.ts`; CodeMirror 6): keywords, MAINTAIN/ACHIEVE, operators,
  numbers and comments coloured; each quoted string takes the colour of its
  shape in the goal model (module / assumption / soft goal); a quantity is
  bold only where it is compared; a word the grammar does not know is
  underlined as an error. Completion offers only what the grammar allows next
  (keywords with their empty string, then modules the simulator implements,
  assumption and soft-goal quantities with unit and meaning, comparison
  operators, the example wording), plus a whole-requirement skeleton
  (Ctrl+Space on an empty editor). Hover notes on keywords, quantities and
  modules; the parser's error and unimplemented modules marked on their line;
  line numbers, status bar (parses / line / column), light and dark (kept per
  browser), wrapped lines indented under their text. The study shows the
  same editor read only. Colours pass AA in both themes
  (`tests/styles/editorContrast.test.ts`). "Fill the gaps" stays as the
  guided alternative; the editor is the default.
- Manual: `docs/manual/real-dsl.md` (a CADP-style man page: NAME, SYNOPSIS,
  ... SEE ALSO; every example checked against the parser), shown in the tool
  in a pop-up with its sections listed ("See manual"). The Docker image copies
  `docs/manual/` for the build.
- Goal model legend: always shown, under the diagram, every shape named with
  what it stands for and the REAL-DSL words that write it.
- Same day (owner): the run button reads "Start Running Compliance Test" (its
  panel is the "Compliance test" dialog); review step 2 is the "Test Execution
  Report"; the manual is its own page, `#/manual` ("Manual" in the top bar,
  both builds; "See manual" links to it): every section in order, the section
  list beside it marking where you are, and a way on to the requirement page.
  Still to come from the owner: a "best case" example on the Test Execution
  Report (the scenario that optimizes for the failure), and one part of the
  study build to remove (screenshot to follow).
- Same day (owner): the manual keeps only how the language works; its
  LIMITATIONS and FILES sections are gone, and the limitations are now the
  work list `docs/design/real_dsl_robustness.md` (16 items, P1-P3, each with
  a fix and a test). Study build: Start Running Compliance Test opens the
  Test Execution Report at once - no run panel, no replayed job (logged as
  `run_opened`, `direct: true`); this changes the brief's "runs look live".
  Requirement page: the goal model is as tall as the editor (diagram centred,
  legend at the bottom, a slightly wider column), and pointing at any part of
  the REAL-DSL marks its box in the goal model and dims the rest (a string:
  its own box; `assuming` / `ensuring`: all of them; `dsl/language.ts`
  targetAt, tested on every clause).
- Instructions (owner): fewer, fuller steps - two per box, each a complete
  sentence or two rather than one clipped action per line - and one width for
  every page's box (`Instructions page`: max-w-4xl, centred), on the overview,
  the requirement page and review steps 1-5.
- Layout rules (owner, 2026-10-19), for every page:
  - An instruction box above each container, giving context, then an
    explanation in the project's terms, then the call to action
    (`Instructions` with `cta`).
  - Optional actions (download, print, expand) are icons with a tooltip
    (`IconButton`).
  - The way on is a full button centred under the page: "See <next step> →"
    in the review.
  - Two containers sit side by side only when they show the same thing or
    explain each other.
- Review header: the whole workflow (Overview → Requirements Compliance to
  Validate → steps 1-5; `components/review/WorkflowBar.tsx`, fed by each step
  through `state/workflow.tsx`). Rounds, Manual and the participant ID are on
  the right. The progress card and the "Run <id>" line are gone.
- Test Execution Report, rebuilt to these rules:
  - Summary counts, with an explanation box above them.
  - "What failed in the requirement" beside "Where it failed": the REAL-DSL or
    the goal model, each part marked failed (red) or broken (amber). Pointing
    at a row outlines that part in both views.
  - Test cases full width, with every column explained in the box above,
    filter and expand/collapse icons, and download icons (CSV / RUNS / RAW).
  - The recorded test case below the test cases.
  - "See Failure Analysis" centred.
- Requirement page: the pointer cursor over any part of the REAL-DSL that
  has a box in the goal model.
- Not yet applied to steps 1, 3, 4 and 5.
- Simplified (owner, same day):
  - Instruction boxes are white, with a green border and green text
    (#667D01 on white, 4.7:1, checked by the contrast test).
  - The header holds only the logo, Manual and the participant's ID. The
    normal tool also keeps Workspace, where saved rounds are opened.
  - The workflow is one quiet line under the header on every page:
    Overview › Requirements Compliance to Validate › steps 1-5.
    - The page you are on is underlined; the stops before it are ticked.
    - The review steps lead to the review last opened.
  - This replaces the workflow-in-header from earlier the same day.
- Same day (owner): the workflow line takes the earlier progress-tracker
  look: nodes on a track, each step's name and live status, done steps
  ticked. It sits under the header on every page and scrolls with the page.
- Test Execution Report, the worked example (`ScenarioReplay`,
  `domain/bestScenario.ts`):
  - It shows the round's best scenario, chosen by the test search's own rule
    (`grid.py`: the test case with the lowest pass rate; the run's recorded
    `worst_phenotype` wins when present), so "best" means best at exposing a
    failure, the worst case for the car.
  - It replays one run of that test case from its trace, top down. The car
    sits at exactly the recorded distance from the pedestrian, with the 5 m
    margin (red once breached), the detector cone (in-path detections) and
    brake lights (any brake command), as the run summary counts them.
  - Play, scrub, or jump to a moment: first brake, first detection, closest
    approach.
  - Runs can be switched to compare a failed run with one that passed.
  - It replaces the "Recorded test case" box. The video sits beside the
    replay when the round has one.
- Why there was no video: study round C1 has no `best_scenario.mp4` and no
  frames. It was assembled from several cluster jobs (`merged_from`) and the
  recording run was never made. The page itself loads; the recording would
  need one cluster run.
- Palette study (an artifact): the five colours measured, a colour-blind
  check, and three directions on a miniature of the report. Recommended
  direction B: wheat for the workflow band only, a paler page, a green rule
  and label on instructions with ink text, red for failure only. Waiting on
  the owner.
- Palette: direction B, "Calm canvas", chosen by the owner and applied:
  - Wheat (#EAEAAA) only on the workflow band; the page is a paler mix of it
    (#F5F5DC).
  - Instruction boxes are white, with an olive 4px rule, an olive "What to
    do" label and olive step numbers; the text is ink. Olive appears nowhere
    else.
  - Red (#AD1F07) means failure only; lime (#9EB200) is the one forward
    button; wine (#8A1538, was maroon #610000) is the header only.
  - New contrast checks cover the band and the box: the olive label on white
    and the muted text on wheat.
- Start Running Compliance Test (both builds) now opens the review at step 1,
  The requirement under test, rather than at step 2, so the requirement is
  read before its report (owner).
- The worked example is its own page between steps 1 and 2
  (`#/review/<id>/example`, `pages/review/StepExample.tsx`).
  - The order is now step 1 → Example → step 2, and it is a stop (★) on the
    workflow track.
  - The page shows the round's best scenario with CARLA's camera recording
    beside the trace replay.
  - The replay is captioned as a schematic drawn from the recorded CARLA
    trace, not camera footage.
- CARLA video for merged study rounds:
  - Each cluster job behind a round recorded its own worst scenario on
    camera (`best_scenario.mp4`, MPEG-4 part 2, which no browser plays).
  - `python -m scripts.evolve.video <run>` writes a playable H.264 copy
    beside it.
  - `make-study-site.mjs` (`copyRecordings`) copies a job's H.264 copy into
    the site as `videos/<scenario id>.mp4`, matched by the job's
    `worst_phenotype`. The study data folder is not changed.
  - For C1 this is job 8ee4732c, which recorded exactly test case 6, the
    round's best scenario. Its H.264 copy was made on 2026-10-19.
- Open question (owner): the simulator comment says LR means "starts at the
  left kerb, driver's view". In C1 test case 6 (LR), the CARLA camera and
  the trace (lateral -3.3 m) both put the pedestrian on the car's right. The
  report's column note repeats the comment and may be wrong.
- Failure Analysis (owner, 2026-10-19):
  - It opens on the Diagram (a new remembered-view key, so an older "tree"
    does not win).
  - The study build has no Tree view anywhere: Text and Diagram only.
  - One layout for every view: the goal model full width, then the evidence
    and the fixes side by side (both about the selected obstacle), then the
    patterns. Each has an instruction box with context, explanation and a
    call to action.
  - The evidence shows CARLA's recording of the round's best scenario
    (`hooks/useBestScenario.ts`, `components/evidence/CarlaVideo.tsx`, shared
    with the example page), with a link to the worked example.
  - Fixed: in the study build the diagram's obstacle boxes printed the
    tool's verdict ("insufficient data"). The Tree default had hidden this
    until now. The study build now shows no verdict in the boxes, and a test
    covers it.
  - What happens to each fix choice: waiting on the owner.
- Fixes moved (owner): the Failure Analysis no longer has a Fixes container
  (it only listed options; nothing could be done there), and its evidence
  takes the full width. What a fix is now explained where the fix is chosen:
  - Obstacle triage has an instruction box above each of its sections:
    obstacles and fixes (the verdicts, then what a fix is: the six choices in
    the study build, the five layers in the normal tool), scope, and domain
    assumptions.
  - The choice itself is unchanged: "Choose a fix" inside each accepted
    obstacle.
- Study triage and refinement (owner, 2026-10-19; `study/triage.ts`,
  `study/StudyTriage.tsx`, `study/StudyRefinement.tsx`). An improvement of
  steps 4-5, not a replacement of the loop: steps 1-3, R1's labelled
  changes, re-judging and next rounds are unchanged.
  - Step 4 asks one question per obstacle, world or car, as two plain
    sentences.
    - "The world explains these failures": the obstacle's own requirement
      change (its `assuming` line, or its `ensuring` line where the analysis
      proposes a soft goal) is added to R1 automatically.
    - That option is unavailable, with the reason shown, when the suggestion
      is about the car (`ego_speed <= 5`). Narrowing the car would define
      its failures away.
    - When R0 already says it, nothing is added.
    - "The car is at fault": it remains a failure for step 5.
    - No fix menu in step 4.
  - Step 5 opens with the refined requirement, the added lines outlined, and
    the failures counted against the car re-judged on the same runs
    (`rejudge.ts`). When nothing changes it says why: free-text or
    already-assumed lines are not measured.
  - Beside it are the failures that remain, each with three choices:
    - refine the requirement (in the participant's words);
    - a real system failure, with a car fix (path-aware braking, larger
      detector, both, or another change);
    - not enough evidence, left for the next round.
  - Stored with values `decisions.py validate()` accepts, with two extra
    fields saying which path was taken (`explained_by`, `resolution`):

    | Choice | Stored as |
    |---|---|
    | world | accept + requirement-layer mitigation |
    | refine | accept + requirement mitigation (the participant's words) |
    | system | accept + car fix |
    | later | defer |

    A test runs the Python validator on the result.
  - The normal tool keeps the previous flow for now (study first, for the
    deadline).
- "What this means" (in the normal tool, "What the tool says") on the
  obstacle and scope cards is no longer a dropdown. It is an always-visible
  box in the same place on every card (`components/ui/MeaningBox.tsx`): a
  pale wheat panel, a muted left rule, a quiet uppercase label, ink text.
  It is neutral on purpose, because the olive rule belongs to the
  instructions box: "what this means" and "what to do" stay visually
  distinct.
- Guided tour per page, in both tools (`tour/tours.ts`, `tour/useTour.ts`,
  driver.js 1.9.0 pinned).
  - Every page has its own short tour: the overview, the requirement page,
    steps 1-5, the example, the manual, the workspace and rounds.
  - Each stop is a part of the page found by its accessible name, so a stop
    cannot drift from what it points at. Stops not on screen are skipped. A
    test checks that every stop exists on its page.
  - It starts once on a page's first visit (remembered per browser, per
    build). The header's ? replays it.
  - It is styled in Calm canvas: white, an olive rule, ink, lime Next. The
    styles sit outside `@layer`, because the library's own stylesheet is
    unlayered.
  - In the study build, tour_started and tour_closed (stops seen) are
    logged.
  - It never starts on its own under test.
  - Every stop but the last has "Skip tour": it ends the tour, counts as seen,
    and is logged as skipped in the study build.
- Workflow band (owner): no status line under the stops; each stop is
  labelled with its page's title, in bold (the current one bolder), and
  nothing more.
- Triage in the normal tool too (owner, decision A, 2026-10-19). The study's
  "world or car?" flow is now the only flow; the shared code moved to
  `domain/triage.ts`, `components/review/TriageChoice.tsx` and
  `pages/review/Refinement.tsx`.
  - Step 4 has no rename, defer or fix menu.
  - In the normal tool, a real system failure takes a fix from the
    analysis's catalogue (data, model, system or test layer, each showing
    its REAL-DSL edit) or the reviewer's own words.
  - "Refine the requirement" records the reviewer's words and writes
    nothing into R1 by itself; the edit is made in "Edit R1 before signing".
    `scripts/analysis/refine.py` skips it the same way (test_refine.py).
  - Existing decisions.json files and tool proposals are read into the new
    flow (`triageOfSaved`):
    - accept with the obstacle's own requirement change → world;
    - accept with another fix → car (system, or refine);
    - defer → car, next round;
    - reject (the old "noise") → undecided.
  - A pre-filled choice is confirmed by selecting it.
  - The review test no longer compares against the Python tool's static
    proposal files. It runs `refine.plan_changes` and `apply_changes` on the
    decisions the flow writes, and requires the identical R1 and an empty
    `validate()`.
- DetectionTooLate (decision A + C):
  - In step 4 the world option stays unavailable, with "Only the car can be
    at fault here: the analysis's one world-side idea, ego_speed <= 5,
    limits the car itself. You can still ask for it in Requirement
    revision."
  - In step 5, "Refine the requirement" offers it as a one-click
    suggestion: "The car must travel at most 5 m/s where a pedestrian may
    cross." (`carRequest`).
- The REAL logo leads to each tool's first page (owner): the study build's
  welcome page (`#/welcome`), the normal tool's Overview. During a study
  session the welcome page reopens with the participant's ID and expertise,
  and Continue, never a new session (that would lose the work). A changed
  expertise is saved and logged (`expertise_changed`). Tested in
  `tests/study/welcome.test.tsx`.
- The normal tool has a welcome page too (owner, 2026-10-19;
  `pages/WelcomePage.tsx`, `#/welcome`, its first page). It shows REAL,
  large and centred, with the sub-headline; four statements of what REAL
  does (write, test, understand the failures, refine); the expertise field;
  and Get started → Overview.
  - The expertise is kept in the browser (prefilled next time) and written
    into decisions.json as `reviewer_expertise` when signing.
  - Both tools now open on their welcome page, and the REAL logo leads
    there in both.

### 2026-10-20 - study dry run: two fixes
- An out-of-scope scope item without a rule to invert asks for **the limit to state in
  the requirement** in its own field (`limit`); that text, never the reason, becomes the
  R1 assumption; signing waits for it; a limit about the car is refused.
- In the study, playing the CARLA recording is logged (`video_played`, `video_paused`,
  `video_ended`, with the time).
- `ui/scripts/study/dry_run.mjs` walks the study build as one participant, start to
  signing; run it before each batch of sessions.

### 2026-10-20 - Run Compliance Test on R1 (normal tool)
- After signing, Requirement revision offers **Run Compliance Test on R1 ▸** (R2, R3…
  for later runs). The run records this round as its parent and the next round number.
- When it finishes it opens on its **Test Execution Report**, with a banner: "Second run
  of this requirement · This report tests R1, the requirement refined after the first
  run", and a link to the first run's report; the count table already sets the two
  side by side.

### 2026-10-21 - test-defect candidates only when they apply
- The three scenario-artefact candidates (the 8 m trigger, runs where the two never met,
  the dead `distance` parameter) are defects of the v1 test scene. The study round ran
  scene v2, where they were fixed, yet every report listed them and participants judged
  and "fixed" them. Now a candidate is put to the reviewer only when it applies to the
  run's own scene (`run_meta.scene`: a proximity trigger, scene version 1) and has
  evidence in the run (a run where the two never met). One rule, `artefact_applies`, in
  Python (`obstacles.py`, used by `decisions.from_analysis`) and in the tool
  (`domain/decisions.ts`, used by `buildDecisions`); the stored reports are untouched.
  On round C1 the triage lists the six obstacles and the four assumptions.

### 2026-10-21 - the review image bundles round C1 beside the demo rounds
- `examples/round_C1/<neutral id>/` is round C1 as presented to the study (never
  re-analysed; `scripts/demo.py` still processes rounds 1 and 2 only), with the per-run
  quantities the page re-judges with and the camera recording of its best scenario.
  `Dockerfile.review` copies it next to the demo rounds.
- The workspace index can carry a **note per round** (`make-workspace-index.mjs --note
  <folder>=<text>`), shown on the Rounds page, the Workspace list and the requirement
  page, so a bundled round says what it is. The index's label names the whole set.
- Rounds of different test scenes are not compared by date: `previousOf` looks for the
  nearest earlier round of the same scene version, and the link between two rounds of
  different scenes says "Another test scene: not compared" instead of carrying the
  earlier round's changes. A recorded parent always wins.
- `workspaceFiles.mjs` now lists `videos/*.mp4` and `study_quantities.json`, so a static
  workspace carries them (the study site added them separately; it dedupes now).
- Found on the way: an image built on a machine whose copies are mode 640 served 403 for
  every such file (`COPY` keeps modes; nginx's worker is not the owner), while the CI build
  from a checkout never had it (git resets modes). `Dockerfile.review` now `chmod -R a+rX`
  the runs in the build stage, so a local build equals the CI build. The check that caught
  it: every indexed file HEAD-fetched, then Workspace, Rounds and all six pages of every
  round walked with no `role=alert`, no warning notice and no "Not in the chain" line.
- The "Bundled example" card no longer counts the rounds (the dev build serves two, the
  image three); the index label under it names the set.

