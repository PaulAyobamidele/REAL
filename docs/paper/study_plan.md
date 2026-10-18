# Study plan: the tool, study mode and the pre-computed space

Two dimensions. Dimension 1 is the tool; dimension 2 is the experiment we
pre-run on the cluster. Order: 1a parameters and scene → validate →
pre-run dimension 2 → 1b on top of its results → sessions → follow-up runs.
The live cluster connection (1a) is built alongside.

## Dimension 1a — the tool, live

| # | Task | Done when |
|---|---|---|
| 1a.1 | Parameter inventory: everything the simulator can vary for this scene (weather incl. fog, sun altitude, wetness, precipitation; pedestrian type, clothing, speed, direction, timing; occlusion; where the car starts) | list with source, range, and whether it is world (D-assumable) or system (S) |
| 1a.2 ✅ | Each exposed parameter gets all three: template placeholder + grammar entry, telemetry column, assumption quantity (and a scenario keyword) | laptop scene check passes for every parameter; tests |
| 1a.3 ✅ (laptop; cluster smoke pending) | Verdicts in analysis only: the monitor records; pass/fail and GE fitness use the path-aware rule computed from the per-step series | GE cannot optimise a rule the analysis does not use |
| 1a.4 ✅ (laptop; cluster smoke pending) | Executor truth: braking and detector names matched exactly, unknown names refused; implement every car option the tool offers (e.g. braking only for a pedestrian in the lane, then resuming; a second detector) | a requirement runs as written or is refused |
| 1a.5 ✅ (laptop; cluster smoke pending) | Several jobs at once: per-job ports | two jobs on one node run |
| 1a.6 | Live cluster connection: submit from the tool, run id, progress as rows land, incremental pull, analysis updating as results arrive | a run started from the UI is followed to the end in the UI — **done 2026-10-14**: a quick check started from the panel was checked, submitted, followed (two partial reports), pulled, analysed and opened; same files, settings and seeds as the hand run of the same inputs (Notes 8.50) |
| 1a.7 | Profile where the time per scenario goes | breakdown measured |

## Dimension 1b — the tool, study mode

| # | Task | Done when |
|---|---|---|
| 1b.1 ✅ | Load the pre-computed results for the presented requirement; **labelled as a replay** (dataset, date, run id) — everything after loading runs live | the screen says it is pre-computed — **done 2026-10-18, as revised by the owner:** the round is bundled and replayed in the normal flow; not labelled on screen (runs look live; the briefing says all runs are pre-computed); `decisions.json` and the log record the round (`study_C1`) and that every run was a replay |
| 1b.2 ✅ | Tool's suggested verdicts hidden in study mode, and the file records that | blank verdicts — **done 2026-10-18:** 17 places hidden, checked on the built site; `study.verdicts_hidden: true` |
| 1b.3 ✅ | Per-participant folder (participant ID, not name); `decisions.json` + an append-only, time-stamped log of every interaction (verdicts and later changes, reasons, mitigations, assumption edits, requirement edits, screens and evidence opened, time spent) | a session can be reconstructed from the files — **done 2026-10-18:** one `study_<ID>.zip` per participant (random anonymous ID + profession), `decisions.json` + `log.jsonl` (append-only, time-stamped: screens, evidence opened, every verdict and change with old and new value, signing) |
| 1b.4 ✅ | At signing: the revised requirement must parse and be executable as written (modules exist, parameters in range) | an unrunnable requirement cannot be signed — **done 2026-10-18:** R1 written by the tool only (parses); its car must be one of the four saved cars; refusals logged |
| 1b.5 | Follow-up per person: car changes → a cluster run with provenance (shared run, participant); assumption / promise changes → re-judged on the laptop; before/after comparison per person | one before/after per participant — **after the sessions, by the researchers (owner, 2026-10-18):** the study session ends at signing; R1 from each zip is run on the cluster (car changes; Run test) - the in-page re-judging (`ui/src/study/rejudge.ts`, exact against `report.analyse`) is available for assumption-only changes |

## Dimension 2 — the pre-computed space

| # | Task | Done when |
|---|---|---|
| 2.1 ✅ | The presented requirement (`assuming` with one fog level deliberately past its limit; soft goals) | parses, every item checkable — `infra/hpc/study/R_study_C1.dsl`; night also assumed out (2026-10-15) |
| 2.2 ✅ | Grammar enumerating the space (~288 scenarios) | count verified — 288, `scripts/templates/study/study_space.bnf`; 6 chunks with global seeds |
| 2.3 (laptop ✅) | The four car configurations (2 braking x 2 detectors) | each runs as named — modules checked on the laptop; on the cluster with the pilot and C2-C4 |
| 2.4 | Scene validation on a subset (list mode), traces checked | crossing, on-road, no silent gaps — the pilot (C1, chunk 1), predictions in experiment_design.md §11 |
| 2.5 | Pre-run: jobs split by configuration and chunk, run in parallel; integrity check (every scenario x repeat x configuration present) | complete matrix |
| 2.6 | Dataset: schema, README, verdicts re-computable, archived with a DOI | loads in study mode |
