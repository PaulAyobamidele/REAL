# Tool paper vs the REAL paper: what the tool shows, what it does not yet

Written 2026-10-01. Compares the tool (this repo, branch `fse-tool`) with the
paper it implements: Bennaceur, Rajbahadur, Mercy, Nuseibeh, Alrimawi,
*From Failure to Alignment: A Requirements Engineering Framework for Machine
Learning Systems*, arXiv:2606.31589 (30 Jun 2026). Section and figure
numbers refer to that paper. The roadmap ([roadmap.md](roadmap.md)) carries
the resulting tasks.

## 1. The paper's claims, mapped to the tool

| Paper | Where | Tool today | Status |
|---|---|---|---|
| D, S ⊨ R as the satisfaction relation | §III, §IV | DSL has `performed by` (S), `assuming` (D), `ensuring` (soft goals in R) | slots exist; D and R never exercised on a run |
| Grammar-guided scenario exploration (GE) | §IV-A | `scripts/evolve/` (GE via GRAPE) and `/run_grid` (all 32 scenarios) | built; rounds 1-2 used the grid only |
| Valid vs spurious failures, Φ_valid(D(θ)) | §IV-A | `admissibility.py` + rules file + `assuming` | built, but R0 states no assumptions, so every failure is valid by construction; per-assumption checking designed in `domain_assumptions.md` |
| Obstacle analysis, O ⇒ ¬R | §IV-B, Fig. 4 | `failure_model.py`, `obstacles.py`: failure types, supported/unsupported obstacles, evidence | built and **automated** — the paper did this by hand and names automation as future work (§V-D) |
| Mitigation across four layers: data, model, system, requirement | §IV-C, §V-C | mitigation catalogue per layer (+ `scenario`); `performed by` selects `yolov5s`, `yolov5m`, `fine_tune`, `few_shot`, `emergency_braking`, `proportional_braking` | only **system** exercised (round 2 = paper's M4) |
| Three repairs: S′, R′, D″ | §IV | `refine.py` labels `[S]`, `[R]`, `[D]`, `[T]` | only `[S]` has driven a run |
| Human-driven refinement | §IV-C | review page `pages/4_review.py`, `review.py` CLI, `decisions.json` | built; supervisor reviewed live 2026-09-24. The paper had no stakeholder involvement (§V-D) |
| Iteration, traceability | §IV-C, Fig. 3 | `run_meta.json`: `parent_run_id`, round, requirement source, system under test | built |
| Soft goal *SmoothBraking*, obstacle *EmergencyBraking* | §III, Fig. 2 | soft goal used so far: "vehicle resumes"; first-brake distance measured | not aligned — no smoothness measure |
| Repeated runs, fixed budgets, common safety metrics | §V-D threats | 32 × 5 trials, one-variable `compare.py`, pre-registered predictions | built; time-to-collision and braking jerk (named in the threats) not measured |
| MLSv1 → v2 → v3 progression | §IV-C example, Fig. 5 | rounds 1 → 2 | one step so far |

## 2. What the tool adds over the paper's replication package

These are the tool paper's contribution, not a re-run of the research paper:

1. Automated failure grouping and obstacle evidence, with stated support bars.
2. Assumptions checked per simulation (held / broken / not measured) — Φ_valid
   computed from the requirement's own text, not by hand.
3. A recorded human decision per round (`decisions.json`) and a generated,
   labelled requirement revision (`R1.dsl`, `requirement_diff.md`).
4. Provenance linking every run to the decision that caused it.
5. Repeated, comparable runs on an HPC cluster (Narval, Apptainer + Slurm)
   instead of one laptop.

## 3. Gaps, and the task that closes each

| # | Gap | Closed by (roadmap) |
|---|---|---|
| G1 | D and R never adjusted; Φ_valid never ran with real assumptions | M1 (analysis), M3 (2b under the baseline), M4 (round 3 with all three levers) |
| G2 | Only the system layer used | M4b: model layer (`yolov5m`, newer YOLO via M2b), data layer (`fine_tune`) — weights already in `model/` |
| G3 | Soft goal not the paper's *SmoothBraking*; no jerk / time-to-collision | M2.5 |
| G4 | No GE run in the case study | M4b.4 |
| G5 | Findings differ from the paper's (see §4) | reported openly in M6 |
| G6 | No paper draft | M6.0 outline now, filled as evidence arrives |

## 4. Where our results differ from the paper's — to report, not hide

- The paper's dominant failure is children (E1, PedestrianSizeTooSmall). In
  rounds 1-2 the pedestrian type was not a significant factor; the
  dominant failure was **detection too late** (detected at ~7 m while
  ~8 m is needed to stop), with crossing direction (left-to-right +24
  points) and dark clothing (+15 points) supported (Notes.md §8.6-§8.9).
- The paper's M4 (proportional braking) reports child collisions 100 % → 8 %.
  Our round 2 (same mitigation) cut failures 76 % → 3 %, but stalled passes
  rose 12 → 113: the failure mode **shifted** to standoff — consistent with
  the paper's own remark that adaptation can shift failure modes (§IV-C),
  and matching its "unnecessary braking" failure.
- Obstacles in rounds 1-2 are **masked, not resolved**: the slower approach
  avoided the geometry that caused them.
- Known test artefacts limit both rounds: fixed 8 m crossing trigger,
  ~25 % no-encounter runs, the `distance` setting has no effect (fixed in M2).

A tool paper shows the tool working; it does not need to replicate the
research paper's numbers. The differences are themselves evidence that the
loop surfaces things a hand analysis did not.

## 5. Open

- The ICSE call (track, page limit, whether a demo video is required) must
  be checked from the call itself before M6 is planned in detail.
