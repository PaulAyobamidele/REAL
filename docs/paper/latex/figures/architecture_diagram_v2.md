# Fig. 1, design v2: components and artefacts, engineering-drawing rules

Supersedes `architecture_diagram.md` (v1) and the figure drawn from it
(`fig1_architecture.pdf` of 2026-10-19). Written 2026-10-20 after the
owner's review: the v1 boxes mixed component names, explanations and
outputs; inputs looked like processes; the cluster lane mixed tool names
with process names; the legend did not say what a shape or a colour meant.

Model figure: the "AV scenarios generation / execution / verification"
overview (Fig. 1 of *Verifying Collision Risk Estimation using Formally
Derived Scenarios*): numbered stage frames; one shape per kind of element;
one colour per provenance; no prose in boxes; the caption explains.

---

## 1. Rules (the answers to the five review points)

**R1 — Every box is one of two things, never an explanation.**
A *component* (a piece of the tool that exists in the code and can be
pointed to: a module or a third-party tool) or an *artefact* (a file or a
set of files that one component produces and the next reads). Prose about
what a step does belongs in the caption and in Sec. III, not in the figure.
Consequence: the v1 "support boxes" disappear; a stage *is* its components
and the artefacts between them.

**R2 — Shapes follow the flowchart convention.**
Rounded rectangle = component (process). Parallelogram = artefact (data,
input or output). A stack of parallelograms = a set of many artefacts
(e.g. 288 scenarios, 864 traces). A labelled frame = a stage. A plain person
glyph = the engineer (an actor, not a component).

**R3 — Colour means provenance, and ★ says it again for grayscale readers.**
| Fill | Meaning |
|---|---|
| violet `#C9B8F0` + ★ | **new in this paper** |
| orange `#F8D5B8` | **reused from the REAL framework paper's package** (arXiv:2606.31589) |
| grey `#D9D9D9` | **existing third-party tool** (CARLA, Scenic, VerifAI, GRAPE, YOLOv5, Slurm/Apptainer) |
| yellow `#FFF4B8` | artefact (parallelogram) |

**R4 — Tool names are written the same way everywhere.**
A component box names the *role* first, then the tool in parentheses:
"Simulator (CARLA)", "Scene language (Scenic)", "Evolutionary search
(GRAPE)". Never a bare tool name, never a process name alone when a tool
fills it. Infrastructure (GPU cluster, Slurm job, Apptainer image) is not a
component: it is *where* stage 2 runs, so it is written in stage 2's frame
title only.

**R5 — Two loops, not three, and no [T] in the figure.**
After stage 4 the revised requirement R₁ goes one of two ways:
*[S] changed* → next round from stage 1 (the check, then new simulation);
*only [D] or [R] changed* → stage 3 re-diagnoses the stored traces (no new
simulation). The v1 figure sent [S] straight to stage 2, skipping the check:
wrong. [T] (a defect in the test itself) is a real label in
`decisions.json` and stays in the text (one sentence in Sec. III-D), but it
is not part of D, S ⊨ R and would need a fourth loop into the scenario
grammar: left out of the figure.

**R6 — The legend states every encoding used: shape, colour, line, actor.**

---

## 2. Elements

Provenance was checked against the repository history: the fork's initial
tree (the framework paper's package) had the DSL parser, GE scenario
generation, the Scenic scene template, the CARLA/VerifAI integration, the
YOLO models and the braking behaviours. Everything under `scripts/analysis`,
`scripts/redsl`, `ui/`, the telemetry and the monitor rule is this paper's.

### Stage 1 — Specify

| Id | Element | Kind | Provenance | Code |
|---|---|---|---|---|
| A0 | Engineer | actor | — | — |
| F1a | R₀: requirement (REAL-DSL: `performed by`, `assuming`, `ensuring`) | artefact | — | `docs/examples/*.dsl` |
| C1 | Requirement editor | component | new ★ | `ui/src/pages/AuthorPage.tsx`, `TemplateEditor.tsx` |
| C2 | DSL parser | component | framework paper | `scripts/redsl/grammar.py` |
| C3 | Requirement check (modules exist; no assumption about the system) | component | new ★ | `scripts/redsl/serve.py` `check`, `scripts/analysis/admissibility.py` |
| F1b | Goal model (KAOS) | artefact | — | `ui/.../KaosDiagram.tsx` |

### Stage 2 — Generate and execute tests (frame title adds: *runs as a job on a GPU cluster: Slurm, Apptainer image*)

| Id | Element | Kind | Provenance | Code |
|---|---|---|---|---|
| C4 | Scenario grammar (BNF) | component | framework paper | `scripts/templates/*.bnf` |
| C5 | Scenario search: evolutionary (GRAPE) or exhaustive grid | component | GRAPE: third-party; grid: new ★ | `scripts/evolve/ge.py`, `grid.py` |
| F2a | Scenarios (set) | artefact | — | `scenarios.csv` |
| C6 | Scene language (Scenic) | component | third-party | `scripts/scenarios/scratch.temp` |
| C7 | Simulator (CARLA) | component | third-party | — |
| C8 | System under test: detector (YOLOv5) + braking controller | component | YOLOv5: third-party; controller: framework paper | `scripts/simulations/util.py` |
| C9 | Safety monitor and telemetry | component | new ★ | `util.py` `MyMonitor`, `scripts/analysis/telemetry.py` |
| F2b | Run folder: traces (set), results, metadata | artefact | — | `artifacts/runs/<id>/` |

Draw C6→C7 as a solid arrow and C7⇄C8 as a double-headed solid arrow
(the simulator feeds images to the system, the system drives the car).

### Stage 3 — Diagnose

| Id | Element | Kind | Provenance | Code |
|---|---|---|---|---|
| C10 | Validity check (assumptions held / broken → valid vs spurious) | component | new ★ (concept Φ_valid: framework paper) | `scripts/analysis/admissibility.py` |
| C11 | Failure classifier (failure types from traces) | component | new ★ | `scripts/analysis/failure_model.py` |
| C12 | Obstacle analyser (obstacles with evidence; assumption verdicts) | component | new ★ (obstacle catalogue: framework paper) | `scripts/analysis/obstacles.py` |
| C13 | Behaviour map (clustering) | component | new ★ | `scripts/analysis/cluster_map.py` — **not drawn** (text only): stage 3 shows the three components the diagnosis depends on |
| F3 | Diagnosis: valid failures, obstacles + evidence, verdicts | artefact | — | `analysis_report.json`, `cluster_map.json` |

### Stage 4 — Decide and refine

| Id | Element | Kind | Provenance | Code |
|---|---|---|---|---|
| C14 | Review interface (five steps; mitigation menu by layer) | component | new ★ (layers: framework paper) | `ui/src/pages/review/` |
| A0 | Engineer (decides, signs) | actor | — | — |
| C15 | Requirement writer (R₁ with labelled changes) | component | new ★ | `scripts/analysis/refine.py`, `decisions.py` |
| F4 | `decisions.json` + R₁ (changes labelled [S] [D] [R]) | artefact | — | run folder |

Mixed provenance (C5, C8, C10, C12): fill by the box's *main* part and name
the reused part in parentheses; the caption says the obstacle catalogue, the
four layers and Φ_valid come from the framework paper.

---

## 3. Layout: four bands, boustrophedon

7.0 in wide, 2.86 in high (drawn 2026-10-20 by `make_fig1_v2.py` → `fig1_architecture_v2.pdf`). Four stage frames stacked, each a band;
the flow alternates direction so the end of one band sits above the start
of the next and the connecting arrows are short verticals.

```
 1. Specify ───────────────────────────────────────────────────────────▶
   [engineer] ┈▶ ⟨R₀⟩ → (Requirement editor★) → (DSL parser) → (Requirement check★) → ⟨goal model⟩
                                                                                           │
 2. Generate and execute tests  ·  GPU cluster (Slurm job, Apptainer image)  ◀─────────────┘
   ⟨run folder: traces⟩ ← (Safety monitor + telemetry★) ← (SUT: YOLOv5 + braking) ⇄ (Simulator CARLA) ← (Scenic) ← ⟨scenarios⟩ ← (search: GRAPE / grid★) ← (grammar)
   │
 3. Diagnose ──────────────────────────────────────────────────────────▶
   ⟨run folder⟩ → (Validity check★) → (Failure classifier★) → (Obstacle analyser★) → (Behaviour map★) → ⟨diagnosis⟩
   ▲                                                                                        │
 4. Decide and refine  ◀────────────────────────────────────────────────────────────────────┘
   ⟨decisions.json, R₁ [S][D][R]⟩ ← (Requirement writer★) ← (Review interface★) ◀┈ [engineer]
   │
   └── [D] [R] only: re-diagnosed on the stored traces ──▶ stage 3 (up the left edge, short)
   └── [S]: next round, R₁ is the new R₀ ─────────────────▶ stage 1 (up the left edge, long)
```

- Frame titles: bold, numbered, top-left of each band, as in the model
  figure. Stage 2's title carries the infrastructure.
- Both loops run up the left margin in the loop colour (`#C0392B`), one
  inside the other, each with its label; nothing crosses a box.
- The engineer glyph appears twice (band 1 and band 4), dotted line to the
  component the person uses.

## 4. Legend (two short lines, bottom)

`shape: ▭ component · ▱ artefact · ▱▱ a set · frame = stage · 👤 engineer`
`colour: violet ★ new in this paper · orange from the REAL framework package · grey existing tool · yellow artefact · —▶ data · ┈▶ engineer · ━▶ loop back`

## 5. Caption

> Fig. 1. \toolname{} in one round. (1) The engineer writes the requirement
> R₀; the tool parses it and refuses assumptions about the system. (2) A
> scenario grammar and a search (GRAPE or an exhaustive grid) derive test
> scenarios, executed in CARLA through Scenic with the detector and the
> braking controller in the loop; a safety monitor records every run.
> (3) Each run is judged valid or spurious against R₀'s assumptions,
> failures are typed from their traces and grouped into obstacles with
> evidence. (4) The engineer decides each obstacle and assumption in the
> review interface; the tool writes R₁ with every change labelled. [D] and
> [R] changes are re-diagnosed on the stored traces; an [S] change starts the
> next round. Violet ★: new in this paper. Orange: reused from the REAL
> framework package~\cite{real2026}. Grey: existing tools
> \cite{carla2017,scenic2023,grape2022}. Yellow: artefacts.

## 6. Checklist (replaces v1 §10)

- [ ] every box is a component or an artefact; no sentence inside a box
- [ ] every component maps to a code pointer in §2
- [ ] shapes: components rounded, artefacts parallelograms, sets stacked
- [ ] colours: exactly the four of R3; ★ on every violet box and nowhere else
- [ ] tool names as "Role (Tool)"; infrastructure only in stage 2's title
- [ ] two loops, both from stage 4's artefact; [S] to stage 1, [D][R] to stage 3
- [ ] no [T], no study machinery, no job-control plumbing
- [ ] legend covers shape, colour, line and actor; caption repeats the colours
- [ ] vector PDF, fonts embedded, no Type 3, text ≥ 6 pt, reads in grayscale
- [x] 7.0 in wide, 2.86 in high (0.06 over the target, for 6-pt legibility)

## 7. Drawn (2026-10-20)

`make_fig1_v2.py` → `fig1_architecture_v2.pdf` (32 KB, TrueType only) + `.png`.
Checked: no text overflow (measured), grayscale legible, fonts embedded.
Loop labels as drawn: *[D] [R]: re-diagnosed, no new simulation*;
*[S]: next round, R₁ is the new input*. The system under test touches the
simulator box (one unit), as in the model figure; the caption says the
detector and controller run in the loop.

## 8. Revision of 2026-10-20 (owner's review: strict flowchart rules, icons, names)

- **Shapes, strictly:** rectangle = process (component); parallelogram =
  input/output (artefact; stacked = a set); **diamond = decision**; frame =
  stage. Rounded boxes dropped (a pill is a terminator in the convention).
- **The branch after stage 4 is drawn as a decision** `[S] changed?`:
  *yes* → next round from stage 1 (R₁ is the new input); *no* ([D] [R] only)
  → stage 3 re-diagnoses the stored traces. Routing (revised the same day
  after the owner found the corner cluttered): the diamond sits directly
  under the Validity check, so the *no* branch goes **straight up** into it
  and the *yes* branch is the only line in the left margin; nothing crosses,
  and both labels sit horizontally inside the frame beside their line.
- **Actors inside the box they index, one icon size (0.14 in):** the robot
  in every component that runs automatically; the engineer in the two
  components a person operates (Requirement editor, Review interface). No
  icons in stage titles or on artefacts.
- **Artefacts named by function:** `run folder` → *execution traces (results,
  metadata)*; `decisions.json` → *signed decisions (+ R₁ with its changes,
  labelled [S] [D] [R])*. File names belong in the text, not the figure.
- Legend: 12 entries over two lines (shapes, decision, stage, two actors;
  three provenances, data flow, loop back).
- Icons: Flaticon (`icons/ATTRIBUTION.md`); attribution to complete before
  submission or swap for a licence-free set.
