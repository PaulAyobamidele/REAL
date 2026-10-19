# Fig. 1 draft: problems found and instructions to fix (review of 2026-10-19)

Reviewed: the raster draft titled "The Pipeline" (engineer lane, tool lane,
GPU-cluster lane). Reference: `architecture_diagram.md` (the spec) and what the
tool actually does. Problems are ordered by how much they could hurt the paper.

## A. Arrows and directions (the figure says something false)

| # | Problem | Why a reviewer objects | Fix |
|---|---|---|---|
| A1 | **No pipeline arrows** between Input -> 1 -> 2 -> 3 -> 4 in the tool lane | The workflow is the figure's main claim; without arrows the order is only implied by numbers | Solid black arrows: Input -> 1 -> 2 -> 3 -> 4, labelled *R0*, *checked R0*, *traces and results*, *candidate obstacles + evidence* |
| A2 | The red loop labelled **"loops back from 4" starts under step 2**, not at step 4 | The label and the line contradict each other | Start the loop at the bottom of box 4, run it along the bottom edge (below all lanes) to the bottom of Input |
| A3 | **Red arrows from the cluster up into Diagnosis (3) and into Refinement (4)** | Red is the legend's *feedback path*; these are results flowing forward. And refinement never reads raw cluster output: it reads the diagnosis | Delete both. One **solid black** arrow from **Run folder** up to **Diagnosis (3)**, labelled *traces and results*. Nothing from the cluster into 4 |
| A4 | The upward arrow leaves the **Monitor**, while the **Run folder** is a dead end | The analysis reads the stored traces (run folder), not the monitor | Monitor -> Run folder (inside the job, as now); Run folder -> Diagnosis (A3) |
| A5 | **Nothing enters the cluster job** | The job appears to start by itself; the tool's submission is missing | One **dashed** arrow from Step 2 down to the Job frame, labelled *submit (after checks)* |
| A6 | **The [D][R] loop is missing** (refinement -> diagnosis, no new simulation) | It is the paper's key claim: assumption and requirement changes are re-judged on stored traces | Short red arrow from 4 back to 3, labelled ***[D] [R]: re-diagnosed, no new simulation*** |
| A7 | **The [S] loop is missing** (a system change needs a new run) | Without it, the figure cannot say which changes cost simulation | Red arrow from 4 to 2 (or merged with A2, see the spec section 5), labelled ***[S]: new round*** |
| A8 | The engineer's **"(2) Test" arrow lands on Requirement check (1)** | The human starts the test, not the check | Remove it (the spec has the engineer only at Input and Step 4), or point it at Step 2, labelled *starts the test* |

## B. Contradictions with the tool and the paper

| # | Problem | Fix |
|---|---|---|
| B1 | The middle lane says **"engineer's machine"**, but Step 2 (simulation) runs **on the GPU cluster** | Step 2's support box says *runs as a job on a GPU cluster* and points (A5) to the job; or retitle the lane *TOOL* without a location |
| B2 | **Test generation drawn twice**: inside Step 2 *and* again as the whole cluster lane | Keep **one**: either Step 2's support box lists grammar -> search -> Scenic -> CARLA, or the cluster lane does, and Step 2 says *see job below* |
| B3 | **"list"** in Scenario Search | A list of scenarios is how *our study* ran, not the tool's workflow (the spec, section 9). Use *grammar: GE or grid* |
| B4 | **Two numbering systems**: (1)-(6) for the engineer and the circled 1-4 for steps, misaligned (the engineer's (2) sits over step 1, its (3) over step 2) | One numbering only: the circled 1-4 on the steps. Drop (1)-(6). Engineer actions as italic text with no numbers |
| B5 | **"(3) No Engineer Action"** and **"(4) No Engineer Action"** labels | Empty space says it better: no human mark over steps 1-3 |
| B6 | **★ is defined as "support machinery / engineer"**, and placed only on the Monitor and in the Refinement box | ★ means *new in this paper* (spec) and goes on every new component: the IDE support, the requirement check, the diagnosis, the refinement, the monitor's shared rule. None on Scenic, CARLA, YOLO, GRAPE, Slurm |

## C. Things that look careless or machine-made

| # | Problem | Fix |
|---|---|---|
| C1 | **Truncated text**: "assumptions held/broken/not mea", "failure types from" | Shorter lines (≤ 26 characters) or a wider box; no cut-off words |
| C2 | **Stray backticks/quotes**: "`assuming (D), `ensuring (R)" | Typeset the keywords consistently: `performed by` (S), `assuming` (D), `ensuring` (R) in monospace, no stray marks |
| C3 | **Clip-art**: warning diamond, warning triangle with a car, person icons | Remove the warning icons and the car. At most one plain person glyph (or the word *Engineer*) over Input and over Step 4 |
| C4 | **Garbled legend**: "control SPECIFY", a floating "labeled", "labeled" vs "labelled" | Legend on one line: `★ new in this paper · —— pipeline · - - - control (submit) · ━━ loop back · ┈┈ engineer`; one spelling (British: labelled, as in the paper) |
| C5 | **Title "The Pipeline" inside the image** | No title in the figure; the caption carries it (IEEE style) |
| C6 | **A vertical "IDE:" label** squeezed into the Refinement box | A normal title line: *IDE: triage and revision* |
| C7 | **Raster image with soft, uneven text** (the look of a generated image) | Redraw as **vector PDF** (TikZ, draw.io, Inkscape), fonts embedded, no Type 3 fonts, nothing below 6 pt printed. A generated-looking figure invites doubt about the whole paper |
| C8 | Too much text in the engineer lane and duplicated content make it ~2.6 in high | Target 7.0 x 2.2 in: removing B2, B5 and C3 frees the space |

## D. The fixed figure, in one paragraph (for whoever redraws it)

Three lanes. **Top (engineer, light orange):** *writes R0* over Input and
*decides and signs R1* over Step 4, each with a dotted arrow down; nothing
else. **Middle (tool, light blue):** Input -> ① Requirement check -> ② Test
generation and execution -> ③ Diagnosis -> ④ Requirement and
domain-assumption refinement, solid arrows with labels (A1), each with its
support box underneath (spec section 4), ★ on the new parts. **Bottom (GPU
cluster, grey):** one Job frame: Scenario search (grammar: GE or grid) ->
Scenic -> CARLA -> System under test (YOLO + braking) -> Monitor ★ (*same
rule as ③*) -> Run folder. **Arrows between lanes:** ② -> Job dashed
*submit (after checks)*; Run folder -> ③ solid *traces and results*.
**Loops (red, thick):** ④ -> ③ *[D] [R]: re-diagnosed, no new simulation*;
④ -> ② *[S]: new round*; ④ -> Input *R₁ becomes the next input* (or the last
two merged). Legend on one line (C4). Vector PDF, 7.0 x 2.2 in. Then run the
checklist in `architecture_diagram.md` section 10.

---

## Second draft (reviewed 2026-10-19): what is fixed, what is still wrong

**Fixed:** pipeline arrows between the steps (A1); submit arrow into the job
(A5); one numbering only (B4); "No engineer action" labels gone (B5);
clip-art and the in-image title gone (C3, C5); "list" gone (B3); engineer
only at Input and Step 4 (A8), apart from R6 below.

**Still wrong or new (fix all):**

| # | Problem | Fix |
|---|---|---|
| R1 | **Fix-list ids printed in the figure**: "A3, A4", "A5" | Delete them. They are this file's references, not figure labels |
| R2 | **Markdown leaked into the labels**: leading `*` and `**` ("*checked R0", "**[S]: new round") and literal backticks around `performed by`, `assuming`, `ensuring` | Plain text for labels (italic by font, not by asterisks); keywords in a monospace font with no backticks |
| R3 | **Edge labels sit one arrow too early**: "checked R0" is over Input -> 1, "traces and results" over 1 -> 2, "candidate obstacles + evidence" over 2 -> 3 | Input -> 1: *R0*; 1 -> 2: *checked R0*; 2 -> 3: *traces and results*; 3 -> 4: *candidate obstacles + evidence* |
| R4 | **"traces and results" goes from the Run folder up into Refinement (4)**; the Monitor also has an arrow up into the tool lane | One arrow only: **Run folder -> Diagnosis (3)**. Nothing from the Monitor upward; nothing from the cluster into 4 |
| R5 | **"loops back from 4" still starts under Step 2** and ends at Input | Start it at the bottom of box 4, run it under all three lanes, end it at the bottom of Input; label *R1 becomes the next input* |
| R6 | **A third person icon over Diagnosis (3)** with a dotted line down | Remove it: Steps 1-3 are automatic |
| R7 | **[S] and [D][R] drawn as one red line**: it runs from Step 1's top to Diagnosis, and neither end is at Step 4 | Two separate red arrows, both **leaving Step 4**: 4 -> 3 *[D] [R]: re-diagnosed, no new simulation* (short, above the boxes); 4 -> 2 *[S]: new round* (longer, above the boxes, ending on Step 2, not Step 1) |
| R8 | **Test generation still drawn twice** (Step 2's box lists grammar, Scenic, CARLA, YOLO, monitor; the cluster lane draws them again) | Step 2's support box: *requirement -> scenario grammar; runs as a job on a GPU cluster (below)*. The cluster lane shows the detail |
| R9 | **★ on "grammar -> GE/grid"**: GE (GRAPE) is reused; and no ★ on the Input's IDE support (new) | ★ on: IDE support, requirement check, the requirement-driven grammar (not GE), monitor's shared rule, diagnosis, refinement. Never on GE, Scenic, CARLA, YOLO |
| R10 | **Refinement box has both a vertical "IDE:" and the title "IDE: triage and revision"** | Keep the title only |
| R11 | **Legend lists "engineer" twice** (a dashed grey line and a grey box) and the control and engineer line styles look alike | One entry per style: `★ new in this paper · —— pipeline · - - - submit · ━━ loop back (red) · ┈┈ engineer`. Make dashed (submit) and dotted (engineer) clearly different |
| R12 | **Still a raster image** | Vector PDF, fonts embedded, no Type 3 fonts; text ≥ 6 pt printed |

After these, run the checklist in `architecture_diagram.md` section 10 once
more before it goes into the paper.

---

## Third draft (reviewed 2026-10-19)

**Fixed:** the three loops now leave Step 4 and go to the right places
(4 -> 3 *[D] [R]*, 4 -> 2 *[S]: new round*, 4 -> Input *R1 becomes the next
input*) (R5, R7); "A3, A4", "A5" gone (R1); Step 2 no longer repeats the
cluster's detail (R8); one "IDE" title (R10); legend one entry per style
(R11).

**Still wrong, or wrong again:**

| # | Problem | Fix |
|---|---|---|
| T1 | **Results go from the Run folder up the right edge into the engineer's "sign"**, and nothing reaches Diagnosis (3) | One solid arrow **Run folder -> Diagnosis (3)**, labelled *traces and results*. Delete the right-edge arrow |
| T2 | **"No Engineer Action" with a worker icon over Step 2**, plus a dotted arrow down (back again; B5) | Remove both. Nothing over Steps 1-3 |
| T3 | **A dotted "control specify" line from the engineer lane down to Diagnosis (3)** | Remove it (and the words "control specify": not a term in the paper) |
| T4 | **Three engineer actions at the end** ("Refines R1", "Decides" with a ⊗ icon, "sign" with a pen icon); ⊗ reads as "stop / rejected" | One label over Step 4: *decides and signs R1*, one dotted arrow; no ⊗, no pen |
| T5 | **"same R4"** on the line between Diagnosis and the Monitor (garbled), drawn in the **Submit** line style | Delete that line; the Monitor box already says *same rule as 3*. If a link is kept, give it its own style and the label *same safety rule* |
| T6 | **Submit lands on "System under test"**, not on the job | Dashed *submit* arrow from Step 2 to the **Job frame** (or to Scenario search, the job's first box) |
| T7 | **"list" is back** in Scenario search (B3) | *GE / grid* |
| T8 | **Legend text inside the Input box**: "(★ new in this paper)" | Title *Input: Requirements*; the star after *IDE support* already says it |
| T9 | **Backticks still printed** around `performed by`, `assuming`, `ensuring` (R2) | Monospace font, no backticks |
| T10 | **Edge labels on the pipeline are gone** | Add: Input -> 1 *R0*; 1 -> 2 *checked R0*; 2 -> 3 *traces and results* (or put that label on T1's arrow instead); 3 -> 4 *candidate obstacles + evidence* |
| T11 | **The tool lane says "engineer's machine"**, but Step 2 runs on the cluster (B1) | Lane title *TOOL* only, or *TOOL (engineer's machine; simulation on the cluster)* |
| T12 | **Step numbers drawn as "⊙1"** | Filled black circles with white digits, as in the spec |
| T13 | **The R1 loop carries two labels** ("R1 becomes the next input", "loops back from 4") | Keep one: *R1 becomes the next input* |
| T14 | **Still raster** (R12) | Vector PDF |
