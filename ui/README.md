# real-av Review

The human review interface for real-av. A testing round leaves a folder of
evidence: the requirement it ran with, one row per simulation, traces, a
video, and an automated analysis that groups failures into named obstacles.
This interface shows that evidence to a reviewer, records what the reviewer
decides, and writes the decision as the files the next round is launched
from. It is a static web application: no server, no database, no network.

It is one of two ways to produce `decisions.json`. The other is the
command-line review (`python -m scripts.analysis.review`); the Streamlit page
(`pages/4_review.py`) is the earlier interface and keeps working. All three
write the same files.

## What a reviewer does

1. **Workspace** — load a folder of rounds. Every file the interface reads is
   named on this screen; configuration lives here and nowhere in the review.
2. **Rounds** — the rounds in order, each with its requirement version, the
   system under test, the search, its headline counts and its state
   (not analysed, awaiting signature, tool proposal on file, signed). Between
   rounds, the recorded change with its kind ([S] car, [R] promise, [D]
   assumptions, [T] test) and who signed it.
3. **Review**, five steps, one per screen:
   1. _The requirement under test_ — the requirement with `performed by`, `assuming` and
      `ensuring` marked; "none stated" for an absent clause.
   2. _Test Execution Result_ — test cases, runs, passed and failed, which part of the requirement failed, every test case with its runs (downloadable as CSV), the recorded run with an explanation of "best scenario"; the full counts beside the previous round's in a dropdown. No
      obstacle names.
   3. _Failure Analysis_ — the requirement shown as **Text, Tree or Diagram**
      (one switch, remembered per screen; Tree is the default here, Text on
      screen 1): the diagram draws the goal model in the KAOS notation of the
      REAL paper (Figs. 2 and 4) with every obstacle beside the node the
      analysis says it obstructs, and the obstacles with nothing in the
      requirement to attach to in their own region; clicking one dims all but
      its chain and filters the evidence. Then the goal model with each obstacle attached to the goal
      it obstructs (or listed as unattached, with the reason), the simulations
      behind it, each with its trace, and the candidate mitigations by layer.
      Below, _Patterns across all encounters_: every valid encounter as a dot
      on a map of how alike the runs unfolded (their event sequences), shaped
      by outcome, coloured by cluster, with the runs behind the selected
      obstacle ringed; a slider moves between coarser and finer cuts, each
      with its silhouette and what it means; one card per cluster gives its
      outcomes, over-represented settings and typical run step by step.
      Clicking a dot opens its trace. Computed in Python
      (`python -m scripts.analysis.cluster_map <run folder>` writes
      `cluster_map.json`); without that file the section says how to make it.
   4. _Obstacle triage_ — obstacles in support order, those below the
      support bar folded into one line that expands; accept / rename /
      reject / defer per obstacle, a
      mitigation per accepted one (a catalogue fix, reworded if wanted, or
      the reviewer's own: a layer and an action, also where the catalogue
      has none), verdicts on scope items and domain assumptions, a reason
      in the reviewer's own words. The change each fix implies is shown as
      it is typed and follows `refine.change_for`: where refine.py's tables
      map the obstacle and layer, the table's change stands and the wording
      is only recorded; otherwise the change is built from the text.
   5. _Requirement revision_ — R0 and R1 side by side, every change
      labelled, R1 editable, and the one action that writes the files.

A progress tracker sits above every step: the five steps on one track, each
with a line of live status (what was stated, cases and runs, obstacles, how
many verdicts are decided, whether it is signed), done steps ticked and the
triage step's ring filling as verdicts are made; every step is a link.

Two rules hold everywhere: tool output and human judgement never look alike
(a pre-filled verdict from a `decisions.json` on disk stays marked as
unconfirmed until the reviewer confirms or changes it), and every number on
screen links to the simulations behind it, with the set-aside ones shown as
their own group and never counted as passes.

## Writing a requirement

_Requirements Compliance to Validate_ (top bar) works like Overleaf: the
requirement on the left, its KAOS goal model on the right (with its legend),
redrawn as you type and as tall as the editor, and _Start Running Compliance
Test_ centred below. Pointing at any part of the REAL-DSL marks its box in the
goal model. (In the study build the button opens the Test Execution Report at
once: no run panel.) The left side opens on the
**REAL-DSL editor**: colours, completion that follows the grammar
(Ctrl+Space; on an empty editor it offers a whole requirement to fill), hover
help, the parser's errors marked on their line, light or dark. The language
is described in `docs/manual/real-dsl.md`, also the tool's Manual page
(`#/manual`; "See manual" links to it); its known limitations are the work list
`docs/design/real_dsl_robustness.md`. The guided alternative, _Fill the gaps_, is the DSL itself with gaps
to fill - the fixed words (`MAINTAIN`, `by`, `using`, `operationalized as`, ...)
are text, free gaps (names, inputs, outputs, the scenario sentence,
free-text assumptions and soft goals) take suggestions from every
`docs/examples/*.dsl` and from what is already written (the perception
outputs as the braking input), and bounded gaps are menus read from the
code: the temporal operator (the grammar), the module per operation
(perception: the weights in `model/`; braking: `BRAKING_BEHAVIOURS`), the
measurable quantities (`admissibility.QUANTITIES`, never `ego*`;
`soft_goals.QUANTITIES`) and the operators. The tasks "Detect Pedestrian"
and "Apply Brakes" are fixed, because the executor finds its modules by
them. Lines are numbered as in the DSL, so a line the parser rejects is
marked; the goal model then stays on the last version that parsed, dimmed,
until the text parses again. A free-text item is marked ◌ (not checked
automatically) as soon as it is added. Save writes nothing unless the
project's parser accepts the text; _Load a .dsl_ reads a file into the gaps,
or into _Plain text_ when the gaps cannot hold it (the constructs they lack
are listed there). _Results for this requirement_ lists the runs in
`artifacts/runs` that ran exactly it, and _Show these runs in the
Workspace_ opens them. Screen 5 still edits R1 as text.

**Run test** opens one panel in three steps - _1. Choose_, _2. Check_,
_3. Run_ - for the same workflow as by hand (infra/hpc/README.md, section 5),
with clicks instead of typing. _Choose_: a requirement that already has
results offers _Open the latest result_; otherwise (or to run it again)
_Quick check_ (the first scenario list, 1 run, 45 min) or _Full test_ (the
grid, 32 × 5, up to 5 h), with every job script option under _More options_
(search, runs per scenario, time limit, GE population, generations and
grammar, scenario list, parent run and round; an empty option is the job
script's default) and the file name it is saved as. _Check_ ticks off, in
this order, and nothing reaches the cluster until each passes and you press
_Submit_; a failure stops the later checks and says what to do in one
sentence with one button (_Check again_, _Edit the requirement_, or _Back to
the options_), the lists behind it under a fold (the files that differ, the
jobs that block a sync, the sync commands to copy, Scenic's messages):

1. **On this machine** (`scripts/redsl/preflight.py`): the modules are ones
   the executor implements (resolved as the API resolves them), and Scenic
   builds the scenes the job will run against the Town01 map in the repo -
   every listed scenario, all 32 of the grid (~40 s), or for GE every value
   of every parameter at least once.
2. **Over your own ssh session**: the cluster's project copy exists and its
   code matches this project's (the `CODE_MANIFEST.txt` written at sync time
   plus five real files hashed; the refusal lists the files and any job that
   makes a sync unsafe). Run `ssh narval` once in a terminal first.
3. The requirement is saved as `requirements/<name>.dsl` (never overwriting
   other content), copied there, and submitted with exactly the variables the
   options name; `artifacts/jobs.json` keeps the options, the variables, the
   full `sbatch` command and the laptop check.

_Run_ is a timeline (submitted, waiting in the queue or started on a node,
running scenario n of N with the elapsed time against the limit, bringing
the results back, opening the result); the panel can be closed - the job
keeps running and the toolbar button reads _Test running · n of N_. Under
_Details_: the queue state, node, start and elapsed
time against the limit, the ports, scenario n of N, the tracebacks in the log
(MLflow server error reports counted apart), scenarios the simulator could
not create, and the last log lines; every 5 minutes the helper pulls the
results so far (no frames or video) and analyses them into
`<run>/partial/after_<n>_of_<N>/`, which _Open them_ shows with a **PARTIAL**
banner on every review step. When the job ends - in any state - the whole run
and its log (`job_log.out`) come back and are analysed with the project's
defaults: a complete run opens at screen 2; one that ended early is labelled
**INCOMPLETE** and can be opened; a job that made no run keeps its log in
`artifacts/job_logs/`. The tool never syncs code and never cancels a job: the
panel shows `scancel <job>` for you to run. `jobs.json`, `job_logs/` and
`job_log.out` hold job ids and cluster paths and are git-ignored.

This screen needs the **authoring helper**, run from the repository root:

```bash
sim_env/bin/python -m scripts.redsl.serve   # http://127.0.0.1:8765, proxied by npm run dev
```

Reviewing does not need it. The form round-trips: every `docs/examples/*.dsl`
goes text -> parser -> form -> text -> parser with the text unchanged apart
from whitespace and comments and the two goal trees equal
(`tests/contract/authoring.test.ts`).

## Welcome

Both builds open on a welcome page (`#/welcome`, the REAL logo leads back
there). It shows REAL, what it does, and the user's expertise. The normal tool
keeps the expertise in the browser and records it as `reviewer_expertise` in
`decisions.json` on signing. The study build's welcome page starts, or
continues, the participant's session.

## Overview

The first page (`#/overview`), first in the top bar: the normal tool opens on
"How REAL works"; the study build shows "Overview" right after the start
screen. Both texts are in `src/pages/OverviewPage.tsx`. Both show the
architecture figure (`src/assets/real_architecture.png`, a copy of the paper's
Fig. 1) and a help-video card: set `VITE_HELP_VIDEO_URL` at build time (or the
default in `src/config/help.ts`). The video plays in a pop-up on the page.

In the study build there is no Workspace: the nav is Overview, Requirement
under Test, Rounds, and `#/` leads to the requirement page.

## Study mode

To publish: `npm run publish:study` (or `-- <remote>`) builds the site and,
after asking, force-pushes only the built site to the remote's `gh-pages`
branch (one commit, so the round data never piles up in history); then
GitHub -> Settings -> Pages -> Deploy from branch -> gh-pages. The build
records its code version (`git describe --dirty`) in every participant's
`decisions.json`. To try a session again in the same browser, use a private
window (a finished session shows only its thank-you screen).
Acceptance: `artifacts/cluster_checks/2026-10-18_study_mode_acceptance.md`.

A separate build for the user study: `npm run build:study` (output in
`dist-study/`; `npm run dev:study` while developing, after `npm run
study:data`). `study:data` copies the study rounds from `../artifacts/study`
(read only) into `study-public/`: the round participants review in
`workspace/`, the pre-computed follow-ups (other cars, with their reports
re-judged against the study requirement) in `followups/`; only the files the
interface reads, each round under a fixed neutral run id (the copy's
`run_meta.json` keeps `study_round` for the record), and a round carrying
`decisions.json` is refused. Both folders are git-ignored. It opens on
a start screen (REAL and its sub-headline, the participant's expertise in
their own words, and a random anonymous ID, shown in the header from then on) and then gives the normal tool's pages; the
study's runs will be replayed from pre-computed rounds, the tool's verdicts
hidden, every action logged (`log.jsonl`) and everything returned as one zip
per participant. In the study build the Workspace shows only the test
rounds (no opening, dropping or example), a round with `decisions.json` is
refused, and a report's banner (a researcher's note) is not shown.
Rounds appear as in the real tool: none until the participant has run the
requirement. _Write a requirement_ shows the requirement under test read only
(its menus and check come from `study-public/study-authoring/`, made at build
time by the project's own Python - there is no helper on the page; the
researchers' `#` comment lines are dropped from the copy). _Run test_ is the
normal panel, replayed: only the saved full test (288 scenarios × 3 runs),
the checks tick, a job number, queue, node and scenario n of 288 over about a
minute, then the saved round is revealed and opened at its Test Execution
Result (`src/study/replay.ts`; every replay is logged as one; no elapsed time
is shown). The review hides the tool's judgement everywhere - verdict chips
and colours, "supported / below the bar", the support order, assumption
verdicts, round-to-round status - and lists the obstacles A to Z with all
their evidence; each accepted obstacle needs one choice from the study menu
(`src/study/menu.ts`: three car changes, the requirement, a domain
assumption, something else), which also replaces the catalogue's fixes on
the Failure Analysis step. Signing (step 5): the participant's anonymous ID
signs; R1 is written by the tool only (no hand edits) - the car changes chosen
add up to one of the four saved cars (`src/study/car.ts`), changes in the
participant's own words are recorded in `decisions.json`, not in R1; signing
is refused, with the reason logged, if R1's car has no saved run on the site
or an assumption text has a double quote. `decisions.json` gets a `study`
block (participant, profession, times, build, round, car, verdicts hidden,
menu offered); everything - with `log.jsonl` (every decision with old and new
value, every click that opens evidence, every screen) - downloads as one
`study_<ID>.zip` (`src/study/zip.ts`, no dependency). **The session ends at
signing**: the participant's first refinement is what the study needs, and
R1 is run on the cluster afterwards by the researchers; from then on the page
shows only a thank-you screen with the zip to download again (also after a
reload). A revised requirement
can be re-judged on the same simulations in the page (`src/study/rejudge.ts`):
the build exports each round's per-simulation quantities with the project's
own Python (`scripts/study_quantities.py` -> `study_quantities.json`, about
1 MB per round), and the page ports the rest of `report.py`'s judging (the
assumptions, the soft goals, the counts the Test Execution Result shows). A
contract test (`tests/study/rejudge.contract.test.ts`) compares it with
`analyse(run, requirement=R1)`; `REJUDGE_RUN=<run>` runs it on another run.
Code:
`src/study/`, `scripts/make-study-site.mjs`. Design and decisions:
`docs/design/study_mode_brief.md`, `docs/design/review_ui.md`, Notes 8.54.
The normal build is unaffected.

## Files

| Read                                                                                                                                                                                                                                 | Written on signing                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `run_meta.json`, `analysis_report.json`, `simulations.csv`, `traces/*.json`, `R0.dsl` (or the requirement in `run_meta.json`), `decisions.json` if present, `cluster_map.json` if present, `best_scenario_h264.mp4` / `best_scenario.mp4`, `frames/front_rgb/*.png` | `decisions.json`, `R0.dsl`, `R1.dsl`, `requirement_diff.md` |

`analysis_report.json` must be schema version 2 (written by
`python -m scripts.analysis.report` from 2026-10-08 on) for the full review:
it carries the goal tree, the per-simulation outcomes and the change each
mitigation implies. Older reports load in a reduced mode and the interface
says so. Nothing else in a run folder is modified.

The video a run writes is MPEG-4 part 2, which browsers do not decode;
`python -m scripts.evolve.video <run folder>` writes a browser-playable
`best_scenario_h264.mp4` next to it. Without it, the saved frames are shown.

## How a workspace reaches the interface

- **A folder on this computer** (Chrome, Edge): _Open a folder…_ uses the
  File System Access API, so signing writes into the round folder.
- **Dropped files** or the folder input (any browser): read-only; signing
  offers the four files as downloads to copy into the round folder.
- **A folder served next to the build** at `workspace/`, listed by its
  `index.json` (a static server cannot list directories). This is how a
  container demo bundles example data; it is labelled as example data on
  screen. Build the index with:

  ```bash
  node scripts/make-workspace-index.mjs <folder of run folders> --out public/workspace --example
  ```

  `python -m scripts.demo --out <dir>` produces such a folder (`<dir>/runs`).

A draft decision is kept in the browser's session storage while a review is
in progress, so a reload does not lose it. It is never the signed file.

## Development

```bash
cd ui
npm install
npm run dev          # http://localhost:5173 (and, for Write a requirement: python -m scripts.redsl.serve)
npm run test         # Vitest + React Testing Library
npm run lint
npm run typecheck
npm run build        # dist/
npm run preview      # serve dist/ locally
```

Node 20 or newer. The contract tests (`tests/contract/`) compare the files
this interface writes with what the Python tools write for the same inputs,
byte for byte; they run when a Python interpreter with the project's
packages is found (`../sim_env/bin/python`, `python3`, or `REAL_PYTHON`) and
are skipped otherwise. The fixtures in `tests/fixtures/workspace/` are two
real rounds, byte for byte as Python wrote them; `.prettierignore` keeps
the formatter away from them.

## Structure

```
src/
├── domain/        pure functions: the decision document (= decisions.from_analysis),
│                  change planning and requirement assembly (= refine.py), the goal
│                  model, evidence selection, lineage, Python-compatible JSON and
│                  number formatting
├── services/      file sources (static, folder, dropped files), loaders with
│                  validated schemas (zod), the CSV reader, signing
├── state/         workspace context, draft decisions (reducer + session storage), routing
├── components/    ui, feedback, requirement (DSL block, goal tree, diff), evidence
│                  (table, trace, video), review (step shell, verdict controls), lineage
├── pages/         Workspace, Rounds, Review (five steps)
└── styles/        tokens.css (design tokens) and app.css (base styles, shared treatments)
```

Design tokens are the only place colours, type and spacing are defined.
`src/styles/tokens.css` carries the set. Colour is a five-colour palette
with one job per colour (2026-10-19): #EAEAAA page background, white cards,
#172033 text; #667D01 with white text only for the instructions box
(`Instructions`), so it is always what to read first; #8A1538 (wine) the header,
the same on every page; #9EB200 the primary button, with dark text; links,
selection, focus and "passed" in the dark text colour, marked by an
underline, a tick or a border; #AD1F07 "failed" and errors. `set-aside`, `caution` and the four change kinds keep their own
colours; every meaning also has a word. Light only.
`tests/styles/contrast.test.ts` checks every text/background pair against
WCAG 2.2 AA. A desktop-app
type scale (12 / 13 / 14 px body, 16 px card titles, 26 to 32 px page
titles); 6 / 10 / 16 px radii; translucent `fill` greys for quiet controls;
150 / 200 / 280 ms motion. The look is calm and
compact: one top bar (screens, and the five steps inside a review
as a segmented control), cards lifted by a hairline and a soft shadow
instead of borders, borderless tinted tags, capsule buttons, verdicts as a
row of tiles (the chosen one in the `human` colour), explanations folded
into dropdowns, and two small floating buttons for Back and Next. Step 3 is
the sketch's sandbox: one card with the goal model on the left and two
panels on the right, failures with video evidence above the candidate
fixes. Four treatments in `src/styles/app.css` carry the rules:
`.tool-output` (sunken surface, 2px left rule), `.refusal` (caution tint
and rule), `.human-input` (raised surface, hairline border) and `.dsl` (the
requirement with its three parts marked). Fonts are Poppins (400 to 700) for text and the system monospace (SF Mono on Apple devices, JetBrains Mono elsewhere) for code and numbers, bundled from `@fontsource` packages: nothing is loaded from a CDN.

## Dependencies

React 18, TypeScript, Vite, Tailwind CSS 4, and four runtime libraries each
doing one job: `zod` (schemas that validate the loaded files and give the
types), `papaparse` (CSV), `diff` (line diffs for the side-by-side view and
`requirement_diff.md`), `@radix-ui/react-radio-group` (accessible radio
groups for verdicts). The goal tree follows the WAI-ARIA tree pattern and is
implemented here, since Radix has no tree primitive. The REAL-DSL editor is
CodeMirror 6 (`@codemirror/*`, `@lezer/highlight`); the manual is rendered
with `marked`.
