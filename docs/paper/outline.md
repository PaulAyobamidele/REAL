# Tool paper outline — REAL as a tool (ICSE)

*Started 2026-10-06 (roadmap M6.0). Each section lists the claim it makes and
the evidence it needs, with a status: **have** (a saved file), **pending**
(needs a planned run), **build** (needs code not yet written).*

**Target: ICSE 2027 Tool Demonstration track, deadline Fri 23 Oct 2026 AoE**
(docs/paper/icse27_call.md). **4 pages INCLUDING references**, IEEEtran
`10pt,conference`, author names included (single-anonymous), **video URL at
the end of the abstract**, link to the public tool + usage instructions. The
call requires the paper to state: **envisioned users, the SE challenge, the
workflow required of users, and validation results (or the design of planned
studies)**; reviewers also score the video. Budget below: ~3.4 pages of text
and figures + ~0.6 page of references (≈15 references).

Working title: **REAL: A Tool for Failure-Driven Requirements Engineering of
Machine-Learning Systems**

---

## Abstract (≈150 words)

Problem: ML-system testing finds failures, but not what to change in the
requirements. Tool: REAL turns a goal-oriented requirement (D, S, R kept
separate) into a scenario search, checks every failure against the stated
domain assumptions (valid vs spurious), groups valid failures into obstacles
with evidence, records a human decision, and writes the next requirement with
labelled changes. Evidence: an automated-braking case study on CARLA over
N rounds. Availability: DOI, demo mode without a simulator, video.

## 1. Introduction (½ page) — must name the users and the challenge

- **Envisioned users**: requirements engineers and ML / autonomous-driving
  engineers who test a learned component and must decide what to change —
  the data, the model, the system around it, the requirement, or the stated
  assumptions; and safety/assurance reviewers who need the trail.
- **SE challenge**: testing MLS yields piles of failures but no link back to
  requirements; validity (valid vs spurious) and obstacle analysis are done
  by hand, and decisions are not recorded.

- The gap: the REAL paper (arXiv:2606.31589) defines the loop and does
  failure grouping and validity by hand; no tool exists. **have**
  (tool_paper_alignment.md §1)
- Contributions (each must map to a section and evidence):
  1. A requirement language that keeps D, S and R apart, with refusal of
     assumptions about the system under test. **have** (grammar, admissibility.py, tests)
  2. Automated validity: per-simulation held / broken / not measured, and a
     per-assumption verdict (load-bearing / untested / …). **have** (code);
     **pending** real evidence (GE run with broken assumptions)
  3. Automated obstacle analysis with evidence and a cross-layer mitigation
     menu. **have**
  4. Recorded human decisions and labelled requirement revision
     ([S]/[R]/[D]/[T]) with run provenance. **have**
  5. Honest analysis: masked vs resolved, failure-mode shift, scene defects as
     a first-class [T] outcome, GE sampling caveat + grid check. **have** (code,
     rounds 1-2); **pending** (GE + grid check)

## 2. Background in one column (¼ page)

D, S ⊨ R; valid vs spurious failures (Φ_valid); obstacles; the
Identify–Analyse–Mitigate loop. Cite the REAL paper; no new theory.

## 3. The tool and the workflow required of users (1 page + one architecture figure)

Figure 1: requirement → GE/grid search → Scenic/CARLA on Narval (Apptainer +
Slurm) → telemetry → validity → obstacles → review page → decisions.json →
R1.dsl → next round (provenance arrow).

- 3.1 Requirement language: `performed by` (S), `assuming` (D), `ensuring`
  (R soft goals); example from `docs/examples/R_baseline.dsl`. **have**
- 3.2 Scenario search: grammar → GE (scene_v2.bnf, 21,120 scenarios,
  deliberately beyond the assumptions) or exhaustive grid. **have** (code);
  **pending** (first GE run)
- 3.3 Execution and telemetry: per-step traces, soft-goal measures
  (resume, jerk, TTC), on-road check. **have** (code); **pending** (valid scene)
- 3.4 Validity and assumption verdicts. **have**
- 3.5 Obstacles and mitigation menu. **have**
- 3.6 Review and revision: the 5-screen page, decisions.json, labelled diff.
  Figure 2: screenshot of screen 4 or 5. **have** (page); screenshot **build**
- 3.7 Reproducibility: run_meta provenance, one-change-at-a-time comparison,
  pre-registered predictions, laptop scene check, demo mode. **have** except
  demo mode **build**

## 4. Case study: automated braking (1¼ pages + one table)

Table 1: rounds, what changed (S/R/D/T), failure rate, stalls, obstacles.

| Row | Status | Source |
|---|---|---|
| Round 1 — emergency braking: 91/120 failed (76 %), DetectionTooLate 70 | **have** | runs/35acc09e…/analysis_report.md |
| Round 2 — proportional braking [S]: 4/128 failed (3 %), stalls 12 → 113 | **have** | runs/882fb2fe…/comparison.md |
| Rounds 1-2 re-judged under baseline D0: every failure stays valid | **have** | runs/*/baseline_D0/ |
| Scene defects found ([T]): 8 m trigger, RL not crossing, dead distance, off-road car | **have** | Notes §8.19, §8.25, §8.27 |
| Run 2b — round-2 car on the fixed scene | **pending** | M3 |
| First GE run + grid check (assumptions broken on purpose → verdicts) | **pending** | M2c / M4b |
| Round 3 — a D, an R and an S change, decided by a person | **pending** | M4 |
| Model / data layers: yolov5m, fine_tune, YOLO26s | **pending** | M2b, M4b |

Narrative points (keep, they are the paper's strongest material):
- Mitigation shifted the failure mode (round 2) — matches the paper's own
  prediction, now measured.
- The tool led us to defects in our own test scene; REAL's [T] label is where
  that belongs. Round 1's direction effect is partly an artefact.
- Results differ from the research paper (no child effect; detection too
  late dominates) — report openly (tool_paper_alignment.md §4).

## 5. Limitations, planned study, carbon footprint (¼ page)

- **Planned study** (the call accepts a design for early prototypes): a
  practitioner study in which engineers review a REAL round on the review
  page and decide; measures: agreement with / changes to the tool's
  proposals, time per decision, perceived usefulness. Design only.
- **Carbon footprint** (encouraged by the call): total Narval GPU-hours of
  all runs (from the job logs) × A100 power draw → kWh and CO2e for
  Québec's grid; plus "the demo needs no GPU".

Simulator fidelity; one learned component; support bars are a judgement
call, not significance; small trial counts per round; GE sampling bias
(mitigated by the grid check); human review by the authors/supervisor, not
independent stakeholders.

## 6. Related tools (¼ page)

Scenic/VerifAI (falsification), DYNASTO (validity-aware testing), Responsible
AI Toolbox (error analysis), Anunnaki (goal-based adaptation). REAL's
difference: closes the loop to the requirement, with validity and decisions
recorded.

## 7. Availability (the call: tool must run without building it)

Repository + Zenodo DOI (**build**); **Docker image running the demo mode and
the review page, no CARLA/GPU** (**build**); full pipeline: Apptainer image +
Narval/Slurm instructions (**have**, infra/hpc/README.md); YouTube video
(script docs/voiceover.md **have**, recording **build**).

---

## What blocks a full draft

1. A valid test scene (smoke run 3, job 4779526).
2. Run 2b, one GE run + grid check, round 3 — the pending rows of Table 1.
3. Demo mode and DOI for the availability section.
4. Author list and ORCIDs.
