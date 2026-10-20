# Micro-tasks to the ICSE 2027 submission (23 Oct 2026, AoE)

Each task is small (at most ~2 h), has one owner and a check that says it is
done. Tick `[x]` when the check passes. Owner: **Me** = code tasks, **You** = the
study owner. Written 2026-10-16.

## A. Study dataset (16 Oct)

- [ ] A1 Me — Write `scripts/study/merge_rounds.py`: merges a car's runs from `space_manifest.csv` into one run folder (288 scenarios, 864 simulations, traces, run_meta listing its source runs). *Check:* tests pass; C1 merged has 864 rows.
- [ ] A2 Me — Merge C1, C2, C3, C4 into `artifacts/study/rounds/C1..C4`. *Check:* each 864 simulations, 288 scenarios, seeds = global numbering.
- [ ] A3 Me — Run the analysis report on each merged round. *Check:* 4 `analysis_report.md`, no shortfall line.
- [ ] A4 Me — Compare C1 with C2, C3, C4 on the same scenarios (`compare.py`). *Check:* 3 comparison files.
- [ ] A5 Me — Check the pilot predictions against the full C1 round; write the outcome. *Check:* a dated section in `experiment_design.md` §11.
- [ ] A6 Me — Dataset README: space, fixed settings, schema, the port incident and its handling. *Check:* `artifacts/study/README.md` reviewed by You.
- [ ] A7 You — Decide: run folders to Zenodo, only manifest + reports in git. *Check:* yes / no recorded here.
- [ ] A8 Me — Make the watchdog quiet at a normal finish (diff for approval). *Check:* test; no "EXITED" line after a clean run.

## B. Study mode (16-17 Oct)

- [ ] B0 You — Decide who builds study mode: Me or the UI chat. *Check:* name recorded here.
- [ ] B1 — Participant ID from the link (`?p=P01`); shown on every screen. *Check:* two IDs give two separate records.
- [ ] B2 — Load the C1 round as a labelled replay ("pre-computed, date, run"). *Check:* the label is visible on every step.
- [ ] B3 — Hide the tool's suggested verdicts; record that they were hidden. *Check:* verdict fields start blank; flag in `decisions.json`.
- [ ] B4 — Append-only interaction log: every verdict, change, reason, evidence opened, screen time. *Check:* a session can be replayed from the log.
- [ ] B5 — Signing gate: the revised requirement must parse and name only implemented modules. *Check:* an unrunnable R1 cannot be signed.
- [ ] B6 — Restrict car-side mitigations to C2-C4; record any other choice as "not run". *Check:* menu shows only the 4 cars' changes.
- [ ] B7 — Save per participant: `study/<P-id>/decisions.json`, `log.jsonl`, R0, R1, diff. *Check:* files appear after a test session.
- [ ] B8 You — Dry run as a participant on your own; list what confused you. *Check:* list written; fixes done.

## C. Participants (start today; sessions 17-20 Oct)

- [ ] C1 You — List ~15 candidates (SE, ML or automotive background). *Check:* list.
- [ ] C2 You — Send invitations with 2-3 time slots each. *Check:* sent.
- [ ] C3 Me — Write the briefing script (fixed text, read the same to everyone). *Check:* `docs/paper/study_briefing.md`.
- [ ] C4 Me — Background questionnaire (5 questions) and closing questions (3). *Check:* in the briefing file.
- [ ] C5 You — Book ~10 sessions; assign IDs P01-P10 (name key kept outside the repo). *Check:* schedule.
- [ ] C6 You — Pilot session with one person; fix anything that breaks. *Check:* notes.
- [ ] C7 You — Run the sessions (~60-75 min each). *Check:* 10 folders under `study/`.

## D. Follow-ups and analysis (19-21 Oct)

- [ ] D1 Me — Classify each participant's changes: [S] -> matching car, [D]/[R] -> re-judge, other -> recorded only. *Check:* one table row per participant.
- [ ] D2 Me — Re-judge [D]/[R] decisions on C1's traces. *Check:* one report per participant.
- [ ] D3 Me — Before/after per participant (C1 vs their result). *Check:* one comparison per participant.
- [ ] D4 You — Cross-participant analysis (agreement, divergence, M1-M4). *Check:* results table for Sec. IV.

## E. Deployment (17-22 Oct)

- [ ] E1 Me — Cloudflare Pages: build settings, page deployed with C1's round. *Check:* public URL loads.
- [ ] E2 Me — Python Worker for `catalog` / `check` / `match` in `deploy/cloudflare/`. *Check:* the study requirement checks OK on the URL.
- [ ] E3 You — Cloudflare account; connect the repo. *Check:* access.
- [ ] E4 Me — Docker `v0.2.0` with C1's round bundled. *Check:* published; amd64 tested.
- [ ] E5 Me — Rebuild the Apptainer image from the tagged release; record its checksum. *Check:* sha256 in the README.
- [ ] E6 You — Zenodo account linked to GitHub. *Check:* access.
- [ ] E7 Me — Zenodo record 1: repository release (DOI). *Check:* DOI.
- [ ] E8 Me — Zenodo record 2: dataset (49 runs, merged rounds, manifest) + Apptainer image. *Check:* DOI.
- [ ] E9 Me — Public repo: export the latest tag again (README, DOIs, run instructions). *Check:* pushed.

## F. Paper (18-23 Oct)

- [x] F1 Me — Regroup Sec. III to the figure's four stages (done 2026-10-20). *Check:* subsections = figure stages.
- [ ] F2 You — Decide on the "no domain assumption" warning: build it or drop it from the figure. *Check:* decision here.
- [ ] F3 You or Me — Draw Fig. 1 from `figures/architecture_diagram.md`. *Check:* the checklist in that file passes.
- [ ] F4 Me — Sec. IV: subject, procedure, measures with real numbers from A3-A4 and D1-D4. *Check:* no `\todo` left in Sec. IV.
- [ ] F5 Me — Abstract and contributions. *Check:* ~150 words; video URL slot.
- [ ] F6 Me — Carbon footprint from all job logs. *Check:* GPU-h, kWh, CO2e in the paper.
- [ ] F7 You — Authors, order, affiliations, ORCIDs. *Check:* in `main.tex`.
- [ ] F8 Me — Compile; 4 pages including references; no Type 3 fonts. *Check:* PDF passes.
- [ ] F9 You — Supervisor read-through. *Check:* comments addressed.

## G. Video (21-22 Oct)

- [ ] G1 Me — Update `docs/voiceover.md` to the current tool and study. *Check:* 3-5 min script.
- [ ] G2 You — Record the screen (Docker image or deployed URL). *Check:* raw video.
- [ ] G3 You — Edit, upload to YouTube (unlisted or public). *Check:* URL in the abstract.

## H. Submit (23 Oct)

- [ ] H1 You — Final PDF on the submission system with the video URL and the tool link. *Check:* confirmation email.
