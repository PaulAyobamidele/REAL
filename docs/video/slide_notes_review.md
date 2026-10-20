# Review of `slide_notes.md` against the parent paper and the data (2026-10-20)

Checked against:

- **the parent paper**: Bennaceur et al., *From Failure to Alignment: A
  Requirements Engineering Framework for Machine Learning Systems*,
  arXiv:2606.31589 (Sections I-V, read in full);
- **the study data**: `artifacts/study/rounds/C1..C4/judged_v2/` and
  `artifacts/study/presented/study_C1/`;
- **the tool's code**: `scripts/analysis/admissibility.py`, `obstacles.py`.

Verdict: the framing mostly extends the paper correctly. **Slide 7 and two
numbers are wrong**, and three slides contradict or narrow the paper. Fix
these before recording.

## 1. Wrong: must change

| Where | Says | Evidence | Correct |
|---|---|---|---|
| Slide 7, numbers table | R1 adds **"pedestrian is at least 1.2 m tall"**: "small pedestrians were beyond the world we assumed" | **Contradicts the parent paper.** Sec. IV-B: *"A child pedestrian may be physically present and within the intended operational domain, yet have a small apparent size"*; E1: child failures *"correspond to valid requirement violations rather than out-of-scope scenarios"*. Excluding children is the scoping-away of failures that slide 2 warns against. **The tool cannot check it either**: it parses as free text (recorded, never checked), so no failure would be judged against it. | Drop it. If a world assumption is shown, use one the paper treats as scoping (fog, night) and one the tool checks, e.g. `"fog_density <= 50"` |
| Slide 7 | "**One round of REAL changed the requirement twice**" | No such round exists: no `decisions.json`, R1 or run records it | Label it as an illustration, or show a real participant's decision once the study has run |
| Slide 7 | "**Measured in the next round**: 22 -> 6" | 22 (C1) and 6 (C3) are real (valid failures out of 376), but C3 was **pre-computed on the same 288 scenarios and seeds**, not a round triggered by a decision | "The larger detector, run on the same 288 scenarios: failures 22 -> 6" |
| Numbers table | "the worst case came within **3.6 m**" | Closest approach among C1's valid failures: **1.35 m** (centre to centre). 3.6 m is one run of scenario 6 | "the closest came within 1.4 m" (or drop the line) |

## 2. Narrows or contradicts the paper: rephrase

| Where | Says | Paper | Rephrase |
|---|---|---|---|
| Slide 3, slide 5 box 4, slide 6 | Every failure has **two** answers: **"world or car?"** | Sec. IV: a failure is evidence that (i) **domain assumptions** are incomplete, (ii) **requirements** are underspecified or unrealistic, or (iii) the **specification** is inadequate; mitigation yields **S'**, **R'** or **D''**, across four layers. The binary drops R' (refine the promise) | "Every failure points to one of three: **the world** we assumed, **the promise** we made, or **the car** we built." Box 4: "Decide: world, promise or car?" |
| Slide 4 | "Testing tools find failures; requirements tools write requirements. **Nothing connects the two.**" | The paper cites work that partly connects them: DYNASTO (validity-aware labelling and failure clustering), Anunnaki (goal models and obstacles for ML adaptation), R4ML, Ahmad et al. | "They are **rarely connected**: REAL closes the loop, and records every decision." |
| Slide 4 | "an assumption may describe the world, never the car. **So failures can't be defined away.**" | The rule is grounded (Sec. III, Zave and Jackson: domain properties *"hold independently of the machine"*), and the tool refuses assumptions about the car. But in our study the pedestrian-speed assumption **was** broken by the car's own behaviour and the tool did not flag it (`artifacts/study/speed_assumption_2026-10-16.md`) | "...never the car. **That makes failures much harder to define away.**" |
| Slide 5, loop arrow | "the refined requirement is **tested again**" | In the tool (Fig. 1), [D]/[R] changes are **re-judged on the stored runs without new simulation**; only [S] changes need a new run | "↺ changes to the car are tested again; changes to the world or promise are re-checked on the same runs" |
| Slide 1, slide 3 | "stop **at least 5 m before** a pedestrian" | The paper's goal is *Achieve[CarStopped before PedestrianCrossing]* / avoid collisions; the tool's rule keeps a 5 m margin **while the pedestrian is in the car's path** | "The car must keep at least 5 m from a pedestrian in its path." |
| Slide 1 | "thousands of virtual drives: **rain**, fog and low sun" | The tool can vary rain, but the study's 3,456 drives had **no rain** (fog, sun altitude, wet road, a parked car) | "fog, night, wet roads, hidden pedestrians" |
| Slide 0 | Sub-headline: "**Refining Autonomous Systems Requirements through Compliance Failure Analysis**" | The paper defines REAL as *Requirements Engineering for mAchines that Learn - and Fail*, for **machine-learning systems**; "compliance failure" appears nowhere | Keep the paper's expansion; e.g. "REAL: a tool for failure-driven requirements engineering of machine-learning systems" (the tool paper's working title) |

## 3. To decide before recording

| Where | Point |
|---|---|
| Slide 0, end card: logos and names | The track is **single-anonymous**: names are allowed (`docs/paper/icse27_call.md`), so the double-blind warning is settled. But the **author list is not decided** (micro-task F7). Logos must match it: Polytechnique Montréal and Mila are not affiliations in the parent paper; the Open University logo implies an Open University author on the tool paper |
| Slide 0 | The "LEGOS-SLEEC video" remark cannot be checked here; remove it from the notes |
| Slide 7 / A3 chart | 22 / 349 / 6 / 335 are correct (C1, C2, C3, C4 valid failures, v2 requirement), but say what they are out of (376 or 375 valid encounters each) and that path-aware braking **trades safety for driving on** (C1: 332 of 354 passes froze; C2: 2 of 26) |
| Slide 7 | The parent paper's M1 found the larger detector *worse* at short distance (latency); our study finds it better (22 -> 6). Not a contradiction (different set-up: proportional braking already in place), but do not imply the paper predicted it |

## 4. Correct as written (keep)

- The four layers **data / model / system / requirement** (slide 2): the
  paper's Sec. IV-C.
- "A promise holds only in the world we assume" and **D, S |= R** (slide 3):
  Sec. III.
- Valid vs spurious failures as "did the world hold?" (slide 5, box 3):
  Sec. IV-A (Φ_valid).
- "Today: grouped by hand" (slide 2): the paper's own limitation, Sec. V-D:
  *"failure grouping and obstacle identification were performed primarily
  through manual inspection"*. That is precisely what the tool automates.
- "for requirements engineers and ML engineers" (slide 4).
- 288 scenarios x 3 runs; 3,456 drives; 22 / 6 / 349 / 335.
- CARLA with the real detector in the loop; the simulator and detector as
  existing tools (no star) (slide 5).
