# Study mode: acceptance checks (docs/design/study_mode_brief.md, section 5)

2026-10-18, laptop only. Built with `npm run build:study`; served the way
GitHub Pages serves it - a plain static file server, the site in a
sub-folder (`/REAL/`), no helper, no proxy. Nothing was deployed.

The owner changed four points of the brief while it was built (Notes 8.54):
the study runs on a GitHub page as a study-only build (no backend; one zip per
participant; the signing check uses the saved results); participants get the
normal tool's pages with every run replayed, looking live, no replay label on
screen; the session ends at signing (R1 is run on the cluster afterwards); and
the Rounds and author pages are part of the study, not locked away. Checks 2
and 10 are read with those decisions.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Normal mode behaves as before; existing UI tests pass | pass | all 144 tests from before study mode pass unchanged (169 now); the normal build is built and run in tests; a test shows a report banner is still shown in the normal build (`tests/study/normalBanner.test.tsx`) |
| 2 | A participant opens Study, locked | pass (as revised) | the study build contains only study mode: start screen first (`tests/study/studyApp.test.tsx`); no folder opening, dropping or example (`studyWorkspace.test.tsx`); after signing only the thank-you screen, also after a reload |
| 3 | Two participants, two separate results, nothing overwritten | pass | every session has its own random ID; the zip and its folder are named by it (`study_S-4AW2.zip`, `study_S-ZF28.zip` from two sessions); the log is kept per ID (`session.test.tsx`) |
| 4 | No tool verdict visible; all evidence still is | pass | a test walks steps 1-5 for verdict words (`hiddenVerdicts.test.tsx`); the built site with the real round C1: steps 1-5 show no "supported", "below the bar", "load-bearing", "insufficient data", "tool:", no verdict-coloured shape; evidence (counts, rates, traces, map) shown; 17 places hidden (Notes 8.54) |
| 5 | A decisions.json in the round is refused | pass | the site build refuses to copy such a round; the page refuses to load it (`studyData.test.ts`, `studyWorkspace.test.tsx`) |
| 6 | The log reconstructs a session | pass | the session below: 53 events from session_start to session_end - every screen entered and left, every click on evidence, every verdict and change with old and new value, reasons and new texts, the replayed run, signing |
| 7 | An R1 that does not parse, or names an unimplemented module, cannot be signed; the refusal is logged | pass | R1 is written by the tool only (no hand edits), so it parses; its car must be one of C1-C4 and bundled with the site, an assumption text may not contain a double quote; refusals throw and are logged (`signing.test.tsx`) |
| 8 | decisions.json passes `decisions.py validate()` and records participant, hidden verdicts, menu offered | pass | `validate()` returns no problems on both sessions' files; `study` block: participant, profession, times, build, round (study_C1 and the id shown), car and modules, `verdicts_hidden: true`, the six-choice menu offered, `r1_written_by_tool: true` |
| 9 | Only the study menu is offered | pass | step 4 offers the six choices (`hiddenVerdicts.test.tsx`); step 3's "Fixes" panel shows the same six, not the catalogue |
| 10 | Works where it will run; tests, typecheck, lint, build pass | pass (as revised) | full session on a GitHub-Pages-like static server in a sub-folder: no failed request; `npm test` 169 pass, typecheck clean, lint 0 errors (8 old warnings), both builds pass; Python 315 pass. The Docker image (`Dockerfile.review`) serves the normal build, which is unchanged |

## The session behind checks 3, 6, 8, 10

Static server, site at `/REAL/`, participant `S-ZF28`, "ML or data engineer":

- 0 s start screen -> Workspace: "No test rounds yet"
- Write a requirement (R0 read only) -> Run test -> checks ticked -> submitted
- 65 s the replayed run ends -> the round's Test Execution Result opens
- step 4: DetectionTooLate accepted with "a larger detector" (reason given),
  the other five rejected; scope items in scope; the sun assumption tightened
  to `sun_altitude_angle >= 10`, the others kept
- 67 s signed -> `study_S-ZF28.zip` downloaded -> thank-you screen; after a
  reload still the thank-you screen
- failed requests: none

The zip: decisions.json, R0.dsl, R1.dsl, requirement_diff.md, log.jsonl.
`validate()`: no problems. Car C3 (proportional_braking + yolov5m); R1 names
yolov5m and `sun_altitude_angle >= 10`. The log records the replayed run as a
replay (`run_submitted`, `run_finished`: `replay: true`), 6 obstacle verdicts,
3 scope verdicts, 4 assumption verdicts, the reason, the fix and the new text.

## Also checked

- Re-judging in the page (kept, not used by participants) matches
  `report.analyse(run, requirement=R1)` exactly for six revised requirements
  on run 2b and on the study round C1
  (`2026-10-18_rejudge_contract_study_C1.txt`).
- `npm run publish:study` builds, shows what it would publish, and stops
  unless told "y"; it was answered "n": nothing was pushed.
