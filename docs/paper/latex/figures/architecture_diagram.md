> **Superseded 2026-10-20 by `architecture_diagram_v2.md`** (components and artefacts, engineering-drawing shapes, provenance colours, two loops). Kept for the record.

# Architecture diagram: specification (Fig. 1, `fig:arch`)

Everything needed to draw Figure 1 of the ICSE 2027 tool demonstration
paper: what it shows, the layout, the exact wording, the visual rules, the
caption, and a checklist. Draw it in any tool (TikZ, draw.io, Inkscape,
Figma, matplotlib); the result must pass the checklist at the end.

The figure shows **the tool's main workflow**, the one any engineer follows
with any requirement. It does not show how our own study was run (fixed
scenario lists, chunks, pre-computed cars, participants): that is the
evaluation, described in Sec. IV, not the architecture.

It replaces the current `fig1_workflow.pdf` and is cited in Sec. III.

---

## 1. What the figure must say

A reviewer looking at it for ten seconds should take away:

1. **The pipeline.** A requirement goes in; four steps follow; a refined
   requirement comes out and goes back in:
   **Input: Requirements → Step 1: Requirement check → Step 2: Test
   generation and execution → Step 3: Diagnosis → Step 4: Requirement and
   domain-assumption refinement → (back to Input).**
2. **What supports each step.** Under each step, one box names the
   machinery behind it (IDE, parser, grammar-based search, simulator,
   obstacle analysis, ...).
3. **Where the human is.** The engineer writes the requirement (Input) and
   decides the refinement (Step 4), both in the IDE. Steps 1-3 are automatic.
4. **What is new.** Components this paper contributes are marked ★; reused
   ones (Scenic, CARLA, YOLO, GRAPE) are plain and cited in the caption.

One detail carries the paper's argument and must be visible: **two ways
back.** After refinement, changes to assumptions or the requirement ([D],
[R]) are re-diagnosed on the stored results without new simulation; changes
to the system ([S]) need a new round of Step 2.

---

## 2. Hard constraints (IEEE / ICSE 2027 demo track)

| Rule | Value |
|---|---|
| Placement | `figure*` at the top of a page (`[t]`), full text width |
| Size | **7.0 in wide × 2.0-2.4 in high** (4 pages including references: height is expensive) |
| File | **vector PDF**, fonts embedded, no Type 3 fonts |
| Font | serif, matching the paper (Times / TeX Gyre Termes); step titles 8 pt bold, support text 7 pt, edge labels 6.5 pt italic; **nothing below 6 pt printed** |
| Lines | 0.6 pt boxes, 0.8 pt arrows, 1.1 pt for the loop arrows |
| Colour | at most three fills plus black; must read in **grayscale** and for colour-blind readers |
| Anonymity | no names, logos, institution, cluster name, host names or file paths ("GPU cluster", not its name) |
| Text | sentence case; the tool name exactly as the `\toolname` macro |

---

## 3. Layout

Two rows. **Top row:** the input and the four steps, left to right, joined
by arrows. **Bottom row:** under each, one support box saying how it is
done. The loop arrows return along the bottom edge.

```
 ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
 │   INPUT     │    │ ① Require-  │    │ ② Test       │    │ ③ Diagnosis │    │ ④ Requirement│
 │ Requirements│ ─▶ │  ment check │ ─▶ │  generation  │ ─▶ │             │ ─▶ │  and domain- │
 │ R₀          │    │             │    │  and exec.   │    │             │    │  assumption  │
 │             │    │             │    │              │    │             │    │  refinement  │
 └──────┬──────┘    └──────┬──────┘    └──────┬───────┘    └──────┬──────┘    └──────┬───────┘
        ┆                  ┆                  ┆                   ┆                  ┆
 ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴───────┐    ┌──────┴──────┐    ┌──────┴───────┐
 │ IDE support │    │ parser +    │    │ grammar →    │    │ validity +  │    │ IDE: triage, │
 │ ★           │    │ checks ★    │    │ GE / grid →  │    │ obstacle    │    │ mitigation,  │
 │             │    │             │    │ Scenic→CARLA │    │ analysis ★  │    │ R₁ signed ★  │
 └─────────────┘    └─────────────┘    └──────────────┘    └──────┬──────┘    └──────┬───────┘
        ▲                                     ▲                   ▲   [D] [R]        │
        │                                     │                   └─ re-diagnosed ───┤
        │                                     └──── [S] new round ───────────────────┤
        └───────────────────────── R₁ becomes the next input ────────────────────────┘
```

- Five columns of equal width (≈ 1.3 in) with ≈ 0.12 in gutters.
- Top boxes ≈ 0.55 in high, support boxes ≈ 0.75 in high, joined by a short
  dotted line (the support box belongs to the step above it).
- Step numbers as small filled circles (① ... ④) at the top-left of each step
  box. The input box has no number.
- The engineer: a small person glyph (or the word *Engineer* in italics)
  above the Input box and above Step 4, with a dotted arrow down. No other
  human marks.

---

## 4. Elements (exact wording)

Support text: at most 4 short lines, ~26 characters each. ★ = new in this
paper (black star after the title).

| Col | Top box (title) | Support box | ★ | Paper |
|---|---|---|---|---|
| 0 | **Input: Requirements** · R₀: goal, tasks `performed by` modules (S), `assuming` (D), `ensuring` (R) | **IDE support** · DSL editor with gaps to fill · choices read from the code · live goal model (KAOS) | ★ (DSL reused, extended) | III-A |
| 1 | **① Requirement check** | **Parser and checks** · syntax errors with line · modules must exist · no assumption about the system · *warning: no domain assumption* (see note) | ★ | III-A |
| 2 | **② Test generation and execution** | **Grammar → search** (GE / grid) · **Scenic → CARLA** · system under test: YOLO + braking · safety monitor · *on a GPU cluster* | GE (GRAPE), Scenic, CARLA, YOLO reused; the requirement-driven grammar and monitor ★ | III-B |
| 3 | **③ Diagnosis** | **Validity**: assumptions held / broken, valid vs spurious · failure types from traces · **obstacle analysis** with evidence · assumption verdicts | ★ | III-C, III-D |
| 4 | **④ Requirement and domain-assumption refinement** | **IDE**: accept / reject obstacles · mitigation by layer · keep / tighten / drop assumptions · R₁ labelled [S] [D] [R] [T], signed | ★ | III-E, III-F |

**Note on Step 1's last line.** Today the check parses the requirement,
flags modules that are not implemented, refuses assumptions about the system
under test, and classifies every assumption and soft goal. **It does not yet
warn when the requirement states no domain assumption.** Either add that
warning (a few lines in the requirement check and the editor) before
submission, or drop the line from the figure. The figure must not claim it
otherwise.

---

## 5. Edges

| Style | Meaning |
|---|---|
| **solid**, filled head | the pipeline: what each step hands to the next |
| **dotted**, no head | a step and its support box; the engineer acting on a step |
| **thick solid, accent colour** | the loops back |

| From | To | Style | Label (6.5 pt italic) |
|---|---|---|---|
| Input | ① | solid | *R₀* |
| ① | ② | solid | *checked R₀* |
| ② | ③ | solid | *traces and results* |
| ③ | ④ | solid | *candidate obstacles + evidence* |
| ④ | ③ | thick, accent | ***[D] [R]: re-diagnosed, no new simulation*** (short loop) |
| ④ | ② | thick, accent | ***[S]: new round*** |
| ④ | Input | thick, accent | ***R₁ becomes the next input*** (long loop, bottom edge) |

If three loop arrows crowd the figure, merge the last two: one arrow from ④
to Input labelled ***R₁: next round ([S] runs Step 2 again)***, and keep the
short [D][R] loop separate. The distinction between "re-diagnosed" and "run
again" must stay visible.

---

## 6. Visual grammar

| Thing | Shape | Fill (hex) | Grayscale |
|---|---|---|---|
| Input and step boxes (top row) | rounded rectangle, 0.06 in radius | `#DCEBF7` (light blue) | light |
| Support boxes (bottom row) | square-cornered | `#FFFFFF` with 0.6 pt border | white |
| Human steps (Input, ④) | as above, plus a light orange band at the top of the box | `#FBEBD0` | lightest |
| Loop arrows | thick | `#C0392B` (or Okabe-Ito vermilion `#D55E00`) | dark |
| Step numbers | filled circle, white digit | `#1D1D1F` | black |

- No gradients, shadows, 3D, clip-art or logos.
- All text black, except the loop labels in the loop colour.
- **Legend** (one line, bottom-right, 6.5 pt): `★ new in this paper ·
  —— pipeline · ━━ loop back · ┈┈ support / engineer`.

---

## 7. Wording rules

- Use the paper's terms: *requirement, domain assumption, soft goal,
  obstacle, mitigation, valid / spurious, trace*. "Safety monitor", not
  "oracle".
- [S] [D] [R] [T] exactly, in brackets; R₀ and R₁ with subscripts.
- "YOLO", not "YOLOv5s"; no version numbers, paths, hosts or ports.
- Nothing about the study: no chunks, scenario lists, pre-computed cars,
  participants, repeats.

---

## 8. Caption and LaTeX (ready to paste)

```latex
\begin{figure*}[t]
  \centering
  \includegraphics[width=\textwidth]{figures/fig1_architecture.pdf}
  \caption{\toolname{}'s workflow. The engineer writes a requirement with
  explicit domain assumptions in the IDE (input). \toolname{} checks it (1),
  generates and executes test scenarios from it in
  simulation~\cite{grape2022,scenic2023,carla2017} (2), and diagnoses the
  results: which failures are valid under the assumptions, and which
  obstacles they reveal (3). The engineer then refines the requirement and
  its domain assumptions in the IDE (4). Refinements of assumptions or the
  requirement ([D], [R]) are re-diagnosed on the stored results; system
  changes ([S]) start a new round. \(\bigstar\)~new in this paper.}
  \label{fig:arch}
\end{figure*}
```

`\bigstar` needs `\usepackage{amssymb}`. Name the file
`fig1_architecture.pdf` in this folder; if a script draws it, keep the script
here too.

**Sec. III and the figure.** Sec. III's subsections should follow the same
four steps so the figure and the text match one to one: A Writing a
requirement (input) and its check (step 1); B Test generation and execution;
C Diagnosis (results and failure analysis); D Refinement (triage and
revision); E Implementation. The current draft (`sections_II_V.tex`) has six
subsections; regroup them when the figure is drawn.

---

## 9. What the figure must not show

- No claim the tool does not implement (see the note in section 4).
- The study's machinery: fixed scenario lists, chunks, offsets, the four
  pre-computed cars, repeats, participants. That is Sec. IV.
- Cluster plumbing: job submission, code checks, ports, partial pulls. At most
  the words *on a GPU cluster* in Step 2's support box.
- Internal analysis details (thresholds, clustering algorithm): Sec. III text.
- Screenshots: the IDE has its own figure if there is room.

---

## 10. Acceptance checklist

- [ ] 7.0 in wide, ≤ 2.4 in high, vector PDF, fonts embedded, no Type 3
      (`pdffonts fig1_architecture.pdf`).
- [ ] Smallest text ≥ 6 pt printed.
- [ ] Reads in grayscale: step boxes, support boxes and loop arrows are told apart.
- [ ] Input + four numbered steps, left to right, with the names of section 4.
- [ ] Every step has its support box underneath.
- [ ] The engineer appears only at Input and Step 4.
- [ ] ★ only on new parts; none on Scenic, CARLA, YOLO, GRAPE.
- [ ] The loops are visible and labelled: [D][R] re-diagnosed without
      simulation; [S] / R₁ start the next round.
- [ ] Nothing from the study (section 9).
- [ ] Step 1's "no domain assumption" warning is implemented, or removed.
- [ ] Caption, `fig:arch` and Sec. III agree.
- [ ] Someone who has not read the paper can say, from the figure alone, what
      goes in, what the tool does with it, and what comes out.

---

## 11. Where each element lives in the code (for the authors, not the figure)

| Element | Code |
|---|---|
| Input, IDE support | `ui/src/pages/AuthorPage.tsx`, `ui/src/components/requirement/TemplateEditor.tsx`, `KaosDiagram.tsx` |
| ① Requirement check | `scripts/redsl/grammar.py`, `scripts/redsl/serve.py` (`check`), `scripts/analysis/admissibility.py` (assumptions; refuses quantities of the system), `scripts/simulations/util.py` (exact module names) |
| ② Test generation and execution | `scripts/evolve/ge.py` and `grid.py` (search over the grammar), `scripts/templates/` (grammars), `scripts/scenarios/scratch.temp` (Scenic scene), `scripts/simulations/util.py` (CARLA, YOLO, braking, `MyMonitor`), `infra/hpc/` (cluster job) |
| ③ Diagnosis | `scripts/analysis/admissibility.py` (validity), `trace_measures.py` (safety rule), `failure_model.py` (failure types), `obstacles.py` (obstacles, evidence), `cluster_map.py`, `report.py` |
| ④ Refinement | `ui/src/pages/review/` (triage, revision, signing), `scripts/analysis/decisions.py`, `refine.py` (R₁, labels); re-diagnosis: `report.py --requirement ... --out ...` |
