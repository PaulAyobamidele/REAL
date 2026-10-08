# Master plan — REAL at ICSE 2027 (Tool Demonstrations)

*Written 2026-10-07. Deadline **Fri 23 Oct 2026, AoE** (16 days). Builds on
the dated plan in docs/design/roadmap.md and the call checklist in
docs/paper/icse27_call.md; this file breaks it down into sub-plans and tasks.
Owners: **P** = Paul, **C** = Claude (in the repo, with approval for code),
**S** = supervisor, **N** = a Narval job (queue time is the main risk).*

**What "best paper" needs, and what we can control.** No plan guarantees an
award. What reviewers score (the call): relevance, technical soundness,
novelty, **the video**, usefulness, related work. What tends to set a demo
paper apart: (1) a sharp claim of what is new beyond the research paper,
(2) a tool anyone can run in minutes, (3) real results, honestly reported,
with at least one surprising finding, (4) evidence that someone other than
the authors finds it useful, (5) a video that tells a story, not a feature
list. Every sub-plan below serves one of these.

---

## Sub-plan A — A trustworthy test scene (blocks B)

| # | Task | Owner | Date | Done when |
|---|---|---|---|---|
| A1 | Smoke run 4 (job 4885691): 4 scenarios, check `crossed` for each + video frames | N, C | Oct 7 | all 4 cross, car on road; result in its `smoke_check.md` |
| A2 | If they walk the wrong way: flip the direction (one line), laptop check, re-run A1 | C | Oct 7-8 | as A1 |
| A3 | Full smoke run (32 x 1): crossed in all, car on road, no silent gaps, braking values plausible | N, C | Oct 8 | `smoke_check.md` says pass |
| A4 ✅ (Oct 8: rejected roads, 3-attempt budget at 1 trial; Notes §8.36) | Investigate the 2 scenarios CARLA could not create (Child/Dark/RL): retry or report as a known limit | C | Oct 8-9 | fixed, or stated in the report and the paper |
| A5 | Tag `scene-v2-valid` | P | Oct 8 | tag pushed |

## Sub-plan B — The evidence (Table 1 of the paper)

| # | Task | Owner | Date | Done when |
|---|---|---|---|---|
| B1 ✅ (Oct 8, Notes §8.37) | Pre-register predictions for run 2b and the GE run in Notes | C | Oct 8 | entries dated before the job ids |
| B2 | **Run 2b** — round-2 car, fixed scene, grid 32 x 5, `R_baseline.dsl` | N | submit Oct 8 | pulled, reported, compared with round 2 |
| B3 | **First GE run** — scene_v2.bnf, ~12 x 4 x 1, `R_baseline.dsl` | N | submit Oct 8-9 | pulled, reported (with the GE caveat) |
| B4 | GE grid check — 4 worst + 4 safe x 3 | N | Oct 10 | `grid_check_comparison.md` |
| B5 | **Review of 2b with the supervisor** on the review page → decisions with at least one D, one R and one S change | P, S | **Oct 10 or 11 (1 h)** | `decisions.json` signed by people |
| B6 | **Round 3** — R1 from B5, parent = 2b | N | submit Oct 11 | pulled; compare 2b → 3; each obstacle resolved / masked / shifted |
| B7 | D and R changes evaluated by re-analysing 2b (no new run) | C | Oct 11 | labelled subfolder in 2b |
| B8 | Optional, only if B2-B6 are in by Oct 13: YOLO26s run (model layer) | C, N | Oct 13-15 | one extra Table 1 row |
| B9 ✅ (Oct 8, to date: 8.4 GPU-h, ≤ 5.6 kWh; recompute at the end) | Carbon footprint: GPU-hours of every job x A100 power → kWh, CO2e (Québec grid) | C | Oct 14 | one sentence + numbers in Notes |
| B10 | Freeze the evidence: every number in the paper traced to a file | C | Oct 15 | a "numbers → source" table in docs/paper/ |

## Sub-plan C — The tool as reviewers will meet it

| # | Task | Owner | Date | Done when |
|---|---|---|---|---|
| C1 | Demo bundle: add 2b and round 3 so the demo shows a full D/S/R round | C | Oct 13-14 | `real-demo` ends with a [D][R][S] diff |
| C2 | Review page polish for the video: plain labels, the S/R/D/T legend visible, no developer text | C | Oct 13 | screenshots look publication-ready |
| C3 | **Publish the Docker image** (GitHub Container Registry), pull-and-run in one line | P (login), C | Oct 15 | `docker run ghcr.io/…/real-demo` works on a clean machine |
| C4 | README top: what REAL is, who it is for, 1-line demo, full-pipeline pointer, citation | C | Oct 15 | a stranger can start in 5 minutes |
| C5 | CI (GitHub Actions): tests + laptop scene check on every push; badge in README | C | Oct 14 | green badge |
| C6 | Licences of vendored code (Scenic, VerifAI, scenario_runner, grape) and our licence | C, P | Oct 16 | LICENSE/NOTICE correct |
| C7 | Clean-machine test: someone else runs the Docker demo from the README only | P + a colleague | Oct 16 | works first try, or fixed |
| C8 | Release tag + **Zenodo DOI** (code + demo runs + image digest) | P | Oct 19 | DOI in README and paper |
| C9 | Artifact docs for the later AE track (STATUS, INSTALL) | C | after Oct 23 | — |

## Sub-plan D — The 4-page paper (incl. references)

| # | Task | Owner | Date | Done when |
|---|---|---|---|---|
| D1 | Authors, order, affiliations, ORCIDs | P, S | **Oct 9** | list fixed |
| D2 ✅ (Oct 8; compile on Overleaf) | LaTeX skeleton: IEEEtran `10pt,conference`, sections from outline.md, page budget per section | C | Oct 9 | compiles to ≤ 4 pages with placeholders |
| D3 | **One-sentence claim** + 3 contributions beyond the research paper (from the 2026-10-07 paragraph) | P, C | Oct 9 | agreed with S |
| D4 ✅ (Oct 8; figures/make_fig1.py) | Fig. 1 architecture / workflow (requirement → search → simulator → validity → obstacles → review → R1 → next round) | C | Oct 10 | vector figure |
| D5 | §1 users + challenge, §2 background, §6 related work (~15 refs) | C draft, P edit | Oct 10-12 | drafted |
| D6 | §3 tool and workflow, with Fig. 2 review-page screenshot | C draft, P edit | Oct 12 | drafted |
| D7 | §4 case study + Table 1 (rounds 1, 2, 2b, GE, 3); the failure-shift and scene-defect stories | C draft, P edit | Oct 13-14 | drafted with real numbers |
| D8 | §5 limitations, planned study (and pilot, E8), carbon footprint; §7 availability (DOI, image, video URL) | C draft, P edit | Oct 14 | drafted |
| D9 | **v1 to supervisor** | P | **Oct 15** | sent |
| D10 | v2 after comments | P, C | Oct 18 | — |
| D11 | Final: page limit, IEEE format, no font/spacing tweaks, references complete, abstract ends with the video URL, names + ORCIDs | P, C | Oct 21 | final PDF |

## Sub-plan E — The 3-5 minute video (scored by reviewers)

| # | Task | Owner | Date | Done when |
|---|---|---|---|---|
| E1 | Trim the voice-over to ~4:30, one story: problem → requirement → search → whose fault → obstacles → decide → the loop tells the truth → run it yourself | C, P | Oct 13 | script final |
| E2 | Shot list: Docker one-liner, review page walk-through, a CARLA clip (crossing + braking), report excerpts, Narval job running, R1 diff | C | Oct 13 | list with sources |
| E3 | Clips from runs: turn saved frames into short mp4s (crossing, standoff, failure) | C | Oct 14 | clips in docs/video/ |
| E4 | Screen recordings (demo, review page, terminal) | P | Oct 15-16 | raw recordings |
| E5 | Record the voice-over (quiet room, one take per scene) | P | Oct 16 | audio |
| E6 | Edit: titles, captions, highlights, ≤ 5:00 | P (C advises) | Oct 17 | cut v1 |
| E7 | Feedback from S and one colleague; fix | P, S | Oct 18-19 | cut v2 |
| E8 | **Pilot** (strengthens "usefulness"): 2-3 colleagues run the Docker demo, make the review decisions, answer 3 questions (useful? clear? would use?) | P | Oct 17-19 | short summary in Notes; one sentence in §5 |
| E9 | Upload to YouTube (unlisted), check it plays logged out | P | Oct 20 | URL |

## Sub-plan F — Submission

| # | Task | Owner | Date |
|---|---|---|---|
| F1 | HotCRP account (icse27demos.hotcrp.com), abstract registered early if the site allows | P | Oct 12 |
| F2 | Final checks: PDF ≤ 4 pages incl. refs; video 3-5 min, URL at end of abstract; public tool link + usage instructions; DOI | P, C | Oct 22 |
| F3 | **Submit one day early** | P | **Oct 22** |
| F4 | After submission: freeze the tag; prepare the AE package for after acceptance | P, C | Oct 23+ |

---

## Experimental timeline (status 2026-10-08)

Timing from the saved runs: a scenario costs ~2 min to start (Scenic compile,
YOLO load) plus ~0.3-0.6 min per simulation (scene v2 runs last up to 25 s).
Rounds 1-2 (5 trials per scenario, 10 s cap): 0.55 min per simulation, 1.5 h
per run. Smoke runs (1 trial per scenario): ~2.5 min per simulation. Narval
queue waits so far: 1-6 h per job. Job limit 3.5 h.

| # | Run | Size | Est. run time | Status | Purpose |
|---|---|---|---|---|---|
| 1 | Round 1 (job 3830258) | 32 x 5 = 160 | 1.5 h | **done** | baseline, scene v1 |
| 2 | Round 2 (job 3843349) | 160 | 1.5 h | **done** | [S] proportional braking, scene v1 |
| 3 | Smoke 1 (4354082) | 32 | 1.4 h | done — car left the road | scene v2 check |
| 4 | Smoke 2 (4385790) | — | 4 min | done — Scenic error | scene v2.1 check |
| 5 | Smoke 3 (4779526) | 32 | 1.4 h | done — pedestrian walked away | scene v2.1 check |
| 6 | Smoke 4 (4885691) | 4 | 15 min | done — crosses, but too early | scene v2.2 check |
| 7 | **Smoke 5 (4966321)** | 4 | 15 min | **queued** | scene v2.3: do they meet? |
| 8 | Full smoke | 32 x 1 | ~1.4 h | next | scene valid → tag `scene-v2-valid` |
| 9 | **Run 2b** | 32 x 5 = 160 | ~2.5-3 h (job limit raised to 5 h, Notes §8.34) | planned | round-2 car on the fixed scene |
| 10 | **GE run** | ~12 x 4 x 1 ≈ 60 new scenarios | ~2.5 h | planned | search beyond the assumptions |
| 11 | GE grid check | 8 x 3 = 24 | ~30-40 min | planned | confirm GE's leads |
| 12 | **Round 3** | 160 | ~2.5-3 h | planned (after the review) | [D][R][S] together |
| 13 | YOLO26 run (optional) | 160 | ~3 h | optional | model layer |

Where we are: the loop has run for real twice (rounds 1-2, scene v1). The
scene validation is in its last step (runs 3-7; 8 to go). **None of the
paper's fixed-scene runs (9-12) has started yet.** Critical path:
7 → 8 → (9 ‖ 10) → 11 + review → 12; with typical queue waits that is
Oct 8-9 (7-8), Oct 9-10 (9, 10), Oct 10-11 (11, review), Oct 11-13 (12).

## Day by day

| Date | Main focus | Narval |
|---|---|---|
| Tue Oct 7 | A1 (+A2); D2 skeleton | smoke 4 |
| Wed Oct 8 | A3, A5, B1; submit B2 + B3 | full smoke, then 2b + GE |
| Thu Oct 9 | D1, D3, D4; A4 | 2b / GE running |
| Fri Oct 10 | pull 2b + GE, reports; B4; **B5 review with S** | grid check |
| Sat Oct 11 | B6 submit round 3; B7; D5 | round 3 |
| Sun Oct 12 | D5, D6; F1 | — |
| Mon Oct 13 | pull round 3; D7; C1, C2; E1, E2 | (B8 optional) |
| Tue Oct 14 | D7, D8; B9; C5; E3 | — |
| Wed Oct 15 | **D9 v1 to S**; B10; C3, C4; E4 | — |
| Thu Oct 16 | C6, C7; E4, E5 | — |
| Fri Oct 17 | E6; E8 pilot starts | — |
| Sat Oct 18 | D10 v2; E7 | — |
| Sun Oct 19 | C8 DOI; E7, E8 done | — |
| Mon Oct 20 | E9 YouTube; paper polish | — |
| Tue Oct 21 | D11 final | — |
| Wed Oct 22 | F2, **F3 submit** | — |
| Thu Oct 23 | buffer (deadline AoE) | — |

## Cut list (in this order, only if needed)

1. B8 YOLO26 run → mention as available, not evaluated.
2. B4 grid check → GE results stated as leads only.
3. E8 pilot → planned-study design only.
4. B6 round 3 → fall back to rounds 1, 2, 2b + "round 3 designed" (weakest; avoid).

**Never cut:** the valid scene (A), the Docker demo (C3), the video (E), an
honest Table 1, and the claim of what is new.

## Risks and what we do about them

| Risk | Response |
|---|---|
| Narval queue delays | submit each run the moment it is ready; 2b and GE back to back; laptop work never waits |
| Scene still wrong after smoke 4 | the `crossed` numbers say how; fix in hours with the laptop check; budget: until Oct 9 |
| Round 3 shows no improvement | that is a result: report masked/shifted honestly — the tool's value is the trail, not a win |
| Supervisor unavailable for B5 | Paul reviews alone, supervisor confirms by message; the decision file records who decided |
| Page limit | figures carry the story; references ≤ 15; cut background first |
| Video quality | script first, short scenes, captions; feedback round E7 |
