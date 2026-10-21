# The opening slides

The ICSE demonstration video opens with short slides, then the tool's demonstration
([icse_video.md](icse_video.md)). The slides are shown **inside the video**: each point
fades in at the moment the narration says it.

The look follows a reference ICSE tool demo (keeping what works there): points that
appear one at a time, a rule under each title and the slide number, a diagram of the
approach that builds step by step with a ★ on what REAL adds, a before/after of the
requirement, and a closing card with a QR code and a one-line result.

Each slide is a scene page (`ui/scripts/video/scenes/P0.html`…`P7.html`, styled by
`slide.css`), recorded to a clip `P0.mp4`…`P7.mp4` by `ui/scripts/video/record.mjs`.
P6 (before and after) is shown after the demonstration, in the results.
To change a slide's words or timing, edit its scene page (each point's
`animation-delay` is its cue) and record it again: `node scripts/video/record.mjs P3`.

How to read the tables:
- **Cue** is when the point appears, in seconds from the start of the clip.
- **On screen** is what appears: a few words only. The voice carries the rest.
- **Say** is the narration. Record each line as its own take.

If a line runs longer than its cue allows, freeze the clip's last frame in the editor
rather than re-recording.

---

## P0 · Title (6 s)

| Cue | On screen | Say |
|---|---|---|
| 0.2 | REAL | |
| 0.9 | A Tool for Refining Autonomous Systems Requirements through Compliance Failure Analysis | This is REAL: a tool that helps engineers decide what to do when a self-driving car fails a test. |

## P1 · The big picture (15 s)

| Cue | On screen | Say |
|---|---|---|
| 0.3 | Self-driving cars learn to see | Self-driving cars learn to see. |
| 2.5 | Learned, not written | A detector learns to spot pedestrians from images. We can't read it like ordinary code. |
| 5.5 | Tested in simulation | So it is tested in simulation, over thousands of virtual drives, in rain, fog and low sun. |
| 8.5 | Against a requirement | Each drive passes or fails a requirement… |
| 11.0 | "The car must stop at least 5 m before a pedestrian." | …for example: the car must stop at least five metres before a pedestrian. |

## P2 · The problem (17 s)

| Cue | On screen | Say |
|---|---|---|
| 0.3 | A failure doesn't say what to change | Simulation finds failures by the hundred. |
| 2.2 | Hundreds of failures. Fix what? | But a failure doesn't say what to change. |
| 4.5–6.9 | Data · Model · System · Requirement | Retrain the detector? Use a larger one? Brake differently? Or say more precisely when the requirement must hold? |
| 10.0 | Today: decided by hand, and the reasons are lost. | Today, engineers decide by hand, and the reasons are lost. |
| 13.0 | Or the requirement is loosened until the failures disappear. | Worse, a requirement can be quietly loosened until the failures disappear. |

## P3 · The context (20 s)

| Cue | On screen | Say |
|---|---|---|
| 0.3 | A promise holds only in the world we assume | In requirements engineering, a promise only holds in the world we assume. |
| 3.0 | The world | There is the world we assume: for example, the fog is not too thick. |
| 4.8 | The car | There is the car, and what it actually does. |
| 6.6 | The promise | And there is the promise we made. |
| 9.5 | So every failure has two honest answers: | So every failure has two honest answers. |
| 11.5 | The world explains it | Either the test went beyond the world we assumed, and the requirement should say so… |
| 15.5 | The car is at fault | …or the world was as assumed, and the car must be fixed. |

## P4 · The gap we fill (14 s)

| Cue | On screen | Say |
|---|---|---|
| 0.3 | Failures and requirements live apart | Today, failures and requirements live apart. |
| 0.6 / 1.4 | Testing tools: find failures · Requirements tools: write requirements | Testing tools find failures; requirements tools write requirements. Nothing connects the two. |
| 3.0 | ★ REAL (between them) | REAL connects them. |
| 6.0 | An assumption may describe the world, never the car. | With one firm rule: an assumption may describe the world, never the car. So failures can't be defined away. |
| 10.0 | For requirements engineers and machine-learning engineers. | REAL is for requirements engineers and machine-learning engineers. |

## P5 · How REAL works (21 s)

A diagram that builds one step at a time. A ★ marks each part REAL adds; the
simulator and the detector are existing tools.

| Cue | On screen | Say |
|---|---|---|
| 0.3 | From a failed test to a better requirement | Here is how REAL works. |
| 2.0 | ★ 1 Write the requirement | The engineer writes the requirement, with the world it assumes. |
| 4.5 | 2 Test in simulation | It is tested in CARLA, with the real detector in the loop. |
| 7.0 | ★ 3 Check and group the failures | REAL checks whether the world held, and groups similar failures. |
| 10.0 | ★ 4 Decide: world or car? | The engineer decides, one group at a time: world or car? |
| 13.0 | ★ 5 Refine and record | REAL writes the refined requirement and records every change with its reason. |
| 16.0 | ↺ the next round | And the refined requirement is tested again. |

## P7 · Let's see it (7 s)

| Cue | On screen | Say |
|---|---|---|
| 0.2 | Let's see it | Let's see it, in five steps: |
| 1.2–4.0 | 1 Write · 2 Test · 3 Understand · 4 Decide · 5 Refine | write, test, understand, decide, and refine. |

Then the demonstration starts: shot S3 in [icse_video.md](icse_video.md).

## P6 · Before and after (16 s), in the results after the demonstration

| Cue | On screen | Say |
|---|---|---|
| 0.3 | One round, two labelled changes | One round of REAL changed the requirement twice, each with its reason. |
| 1.8 / 4.0 | Before · R0 / After · R1 | |
| 5.5 | + "pedestrian is at least 1.2 m tall", and why | Small pedestrians were beyond the world we assumed, so that assumption was added. |
| 9.5 | "yolov5s" → "yolov5m", and why | And for the car's own failures, a larger detector. |
| 13.5 | Measured in the next round: failures 22 → 6 with the larger detector. | Measured in the next round, the larger detector cut the failures from twenty-two to six. |

## E1 · End card (7 s)

REAL, the sub-headline, the one-line result ("Shown on 288 CARLA scenarios × 3 runs:
each fix measured, each round linked to its decision"), a QR code to the repository,
and the repository and paper links (each shown only when given at recording time).
