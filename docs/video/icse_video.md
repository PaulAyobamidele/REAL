# REAL: the ICSE 2027 tool demonstration video

Script and shot list, 4:55 (the call allows 3 to 5 minutes): opening slides, then the demonstration. The video must
show who the tool is for, the software engineering challenge it addresses,
the workflow it asks of its users, and the results of its validation (or
the design of planned studies). Each is a chapter below.

How to read this file:
- **Narration** is what is said, one line per breath; record each line as a
  separate take.
- **Screen** says what is shown; each shot has an id (`S1`…). The recording
  scripts drive the tool for that shot (`ui/scripts/video/`).
- **On screen** is a caption burned into the video, at most five words.

Every number comes from the study rounds C1-C4 (288 scenarios, 3 runs each,
judged against the study requirement). The narration says nothing the tool
does not do.

Total narration: about 620 words (slides about 290, demonstration and results about 330), spoken
at a relaxed pace; the rest of the 4:55 is the animations and pauses on key moments.

---

## 0:00-1:50 · The slides (1 min 50 s)

Short slides, shown inside the video, each point appearing as it is said. Their
words, cues and narration are in [slides.md](slides.md); they cover the big picture,
the problem, the context (D, S ⊨ R in plain words), the gap REAL fills and who it is
for, and how REAL works.

| Screen | Clip |
|---|---|
| Title | **P0** (6 s) |
| 1 · The big picture | **P1** (15 s) |
| 2 · The problem | **P2** (17 s) |
| 3 · The context | **P3** (20 s) |
| 4 · The gap we fill | **P4** (14 s) |
| 5 · How REAL works (a diagram that builds; ★ on what REAL adds) | **P5** (21 s) |
| Let's see it: the five steps | **P7** (7 s) |

The earlier opening (the CARLA hook S1, the animations A1 and A2, the welcome page S2)
is replaced by the slides. Those clips stay recorded, unused; the CARLA footage is
still shown in the demonstration (S5).

## 1:50-4:00 · The demonstration (2 min 10 s)

### Write the requirement (1:50-2:15)

| Screen | Narration | On screen |
|---|---|---|
| **S3** the requirement page: the REAL-DSL editor and the goal model side by side | Engineers write the requirement in REAL-DSL. | REAL-DSL |
| S3: typing; completion opens with the modules the simulator runs | The editor completes it as you type, following the grammar, and offers only modules the simulator really runs. | |
| S3: pointer moves over an assumption; its box lights up in the goal model | Point at any part of the text, and the goal model shows where it sits. | |
| S3: Start Running Compliance Test; the run panel checks, then submits | One button checks the requirement and runs it on a GPU cluster, in CARLA, with the real detector in the loop. | Runs on CARLA |

### Read the report (2:15-2:45)

| Screen | Narration | On screen |
|---|---|---|
| **S4** the Test Execution Report: the counts | Two hundred and eighty-eight scenarios, three runs each. Twenty-two failures count against the car. | 22 failures |
| S4: pointer over "fog_density <= 50" (broken); the line lights up amber in the requirement beside it | Each part of the requirement is judged on its own, and shown where it sits. A broken assumption sets its runs aside instead of blaming the car. | |
| **S5** the worked example: CARLA's recording beside the top-down replay; the replay plays to the closest moment | The worst test case, replayed from its recorded trace. Here the car braked, here it saw the pedestrian, and here it came too close. | Replayed from the trace |

### Find the obstacles (2:45-3:10)

| Screen | Narration | On screen |
|---|---|---|
| **S6** the Failure Analysis: the goal model with its obstacles; DetectionTooLate is selected | REAL groups the failures into obstacles, each attached to the goal it blocks, with its evidence. | Obstacles |
| S6: scroll to the pattern map; the selected obstacle's runs are ringed | Runs that unfolded alike sit together, so recurring failures stand out. | |

### Decide: world or car? (3:10-3:40)

| Screen | Narration | On screen |
|---|---|---|
| **S7** Obstacle triage: one card; "The world explains these failures" is chosen; its added line is shown | Then the engineer decides, one obstacle at a time: does the world explain these failures, or is the car at fault? | World or car? |
| S7: the DetectionTooLate card; the world option is greyed out with its reason | REAL holds one line firmly. An assumption may describe the world, never the car. Otherwise failures could simply be defined away. | Never assume the car |

### Refine the requirement (3:40-4:00)

| Screen | Narration | On screen |
|---|---|---|
| **S8** Requirement revision: the refined requirement, the added line outlined in green | Accepted assumptions are written into the refined requirement automatically. | |
| S8: the remaining failures; DetectionTooLate → real system failure → larger detector; then Sign | Each remaining failure is refined, confirmed as a system failure with a fix, or left for the next round. Signing records every decision, with a reason. | Every change labelled |

## 4:00-4:30 · Results (30 s)

| Screen | Narration | On screen |
|---|---|---|
| **P6** slide: before and after, R0 → R1 with the two labelled changes | One round of REAL changed the requirement twice, each with its reason: an assumption about the world, and a larger detector for the car. | |
| **A3** animation: four bars, one per car; C1 22, C3 6, C2 349, C4 335 failures | We measured the three car fixes REAL offers on the same 288 scenarios. A larger detector cut the failures from twenty-two to six. | 22 → 6 |
| A3: the C2 bar shoots to 349 | But braking only for a person in the car's lane, a plausible fix, made it far worse. That is why every fix is measured. | 22 → 349 |
| **S9** the study's welcome page | Next, about ten practitioners will review the same round independently, so we can compare their decisions. | Study: ~10 practitioners |

## 4:30-4:55 · Try it (25 s)

| Screen | Narration | On screen |
|---|---|---|
| **S10** a terminal: the docker run command; then the browser opens on the welcome page | REAL runs in one Docker command, no build needed. | `docker run … real-tool` |
| S10: the Manual page, scrolled | It comes with a manual for REAL-DSL and example rounds to explore. | |
| **E1** end card: REAL, the sub-headline, the GitHub link, the paper's arXiv id | REAL: refining autonomous systems requirements through compliance failure analysis. | REAL |

---

## Shots to record

| Id | What | From |
|---|---|---|
| P0-P7 | Slides (see slides.md); P6 in the results | scene pages `P0.html`…`P7.html` |
| S1 | CARLA camera, test case 6 (12 s; not used since the slides) | `videos/6.mp4` in the study site; H.264 copy of job 8ee… |
| S2 | Welcome page, expertise typed | normal tool |
| S3 | Requirement page: typing with completion, hover, Start, run panel | normal tool with the helper |
| S4 | Test Execution Report: counts, "Where it failed" hover | normal tool, round C1 opened as a workspace |
| S5 | Example: video + replay to the closest moment | same |
| S6 | Failure Analysis: select DetectionTooLate, pattern map | same |
| S7 | Triage: a world choice, the greyed DetectionTooLate | same |
| S8 | Revision: added line, a car fix, sign | same |
| S9 | Study welcome page | study build |
| S10 | Terminal + Manual | terminal recording, normal tool |
| A1-A3 | Animations (the challenge, D, S ⊨ R, the results) | Motion artifacts, Calm canvas palette |
| E1 | End card | Motion artifact |

## Before recording

- Record the normal tool, on round C1 opened as a workspace, so the video
  shows what reviewers get in the Docker image.
- Tours off (their "seen" flags set), a clean browser profile, 1920×1080.
- Participants must not see this video before their session: it shows the
  results of the fixes they choose between. Keep it unlisted, and do not
  link it from the study.
