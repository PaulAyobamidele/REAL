# Edit plan: every frame and clip, in order, with its voice line

The full video, piece by piece, for the ElevenLabs project:

- **frames** `f01`–`f22` are the pages of the deck. Duplicated pages give the progressive unveiling.
- **clips** `00`–`09` are the tool recordings.

Each row is one piece on screen and the voice line said over it. Each row is also one audio file to generate in ElevenLabs, named as in the "Audio" column.

Files are in `artifacts/video/2026-10-20/elevenlabs/`:

- `frames/f01.png`…`f22.png`;
- the clips `00_…mp4`…`09_…mp4`.

Rules:

- A frame stays on screen exactly as long as its voice line, plus a short pause (about 0.4 s).
- A clip plays at its own speed:
  - if the voice is longer, freeze its last frame;
  - if the voice is shorter, trim the clip's end.

| # | On screen | Audio | Say |
|---|---|---|---|
| 1 | clip `00_cold_open.mp4` | `a00.mp3` | A self-driving car meets a pedestrian. Here it came within three point six metres; the requirement asks for five. So who failed: the world, the promise, or the car? |
| 2 | `f01` title | `f01.mp3` | This is Real: a tool that helps engineers decide what to change when a self-driving car fails a test. |
| 3 | `f02` card: Learned, not written | `f02.mp3` | Self-driving cars learn to see. A detector learns to spot pedestrians, and we can't read it like ordinary code. |
| 4 | `f03` + card: Tested in simulation | `f03.mp3` | So it is tested in simulation, over thousands of drives in rain, fog and low sun, |
| 5 | `f04` + card: Against a requirement | `f04.mp3` | each one passing or failing a requirement. |
| 6 | `f05` + the requirement quote | `f05.mp3` | For example: stop at least five metres before a pedestrian. |
| 7 | `f06` "Hundreds of failures. Fix what?" | `f06.mp3` | Simulation finds failures by the hundred. But a failure doesn't say what to change. |
| 8 | `f07` + the four cards | `f07.mp3` | Retrain the detector? Use a larger one? Brake differently? Or narrow the requirement? |
| 9 | `f08` + Today / Or | `f08.mp3` | Today this is decided by hand, and the rationale is lost. Worse, a requirement can be loosened until the failures disappear. |
| 10 | `f09` D, S ⊨ R | `f09.mp3` | In requirements engineering, a promise holds only in the world we assume. |
| 11 | `f10` + World, Car, Promise | `f10.mp3` | There is the world we assume, the car, and the promise we made. |
| 12 | `f11` + "Points to one of three" | `f11.mp3` | So every failure points to one of three. |
| 13 | `f12` + the three answers | `f12.mp3` | The world: the test went beyond what we assumed. The car: it must be fixed. Or the promise: it asked for the wrong thing, and must be refined. |
| 14 | `f13` Testing tools | `f13.mp3` | Testing tools find failures; |
| 15 | `f14` + Requirements tools | `f14.mp3` | requirements tools specify promises. The two are rarely connected. |
| 16 | `f15` + ★ REAL | `f15.mp3` | Real closes the loop. |
| 17 | `f16` + the rule, and who it is for | `f16.mp3` | With one firm rule: an assumption may describe the world, never the car, so failures are much harder to define away. Real is for requirements engineers and machine-learning engineers. |
| 18 | `f17` box 1, Write | `f17.mp3` | Here is how Real works. The engineer writes the requirement. |
| 19 | `f18` + box 2, Test | `f18.mp3` | It is tested in Carla, with the real detector in the loop. |
| 20 | `f19` + boxes 3–5 and the loop | `f19.mp3` | Real checks whether the world held, and groups the failures. The engineer decides: world, promise, or car. And Real writes the refined requirement, every change with its reason, ready for the next round. |
| 21 | `f20` Let's see it | `f20.mp3` | Let's see it. |
| 22 | clip `01_write_requirement.mp4` | `a01.mp3` | The engineer writes the requirement in Real-DSL. The editor completes it, offering only modules the simulator runs. Point at the text, and the goal model shows where it sits. One button checks it, and runs it in Carla. |
| 23 | clip `02_worked_example.mp4` | `a02.mp3` | First, one example. On the left, the car's camera; on the right, a replay drawn from the recorded trace. Here the car brakes, here it sees the pedestrian, and here it enters the safety margin. |
| 24 | clip `03_test_execution_report.mp4` | `a03.mp3` | The report judges each part of the requirement, and shows where it sits. Runs where a world assumption broke are set aside, not blamed on the car. |
| 25 | clip `04_failure_analysis.mp4` | `a04.mp3` | Real groups the failures into obstacles, each attached to the goal it blocks, with its evidence. Runs that unfolded alike sit together on the map. |
| 26 | clip `05_obstacle_triage.mp4` | `a05.mp3` | Then the engineer decides, obstacle by obstacle. Small pedestrians are part of the world the car must handle, so here the car is at fault. And a world assumption that would describe the car is refused. |
| 27 | clip `06_requirement_revision.mp4` | `a06.mp3` | Each remaining failure gets one of three outcomes. This one is the car's: a larger detector. Here the promise asked the wrong thing, since the car stopped and never moved on, so the engineer refines it. The rest carry over to the next round. Signing records every decision, with its reason. |
| 28 | `f21` One change, with its reason | `f21.mp3` | Every change carries its reason, and is tested, so its effect is measured, not assumed. |
| 29 | clip `07_results_chart.mp4` | `a07.mp3` | On the same scenarios, a larger detector cut the failures from twenty-two to six. But braking only for a person in the car's lane, a plausible fix, made it far worse: three hundred and forty-nine. |
| 30 | clip `08_welcome.mp4` | `a08.mp3` | Each review records the reviewer's expertise. Next, about ten practitioners will review the same round. |
| 31 | clip `09_try_it.mp4` | `a09.mp3` | Real runs in one Docker command, with a manual and example rounds to explore. |
| 32 | `f22` end card | `f22.mp3` | Real. The link is on screen. |

The voice lines write "Real" and "Carla" so the voice says them as words, not as letters.

About 600 words of narration, about 4 minutes of speech. When a clip runs longer than its line, it is sped up (at most 1.6x) or its end trimmed, so the whole video stays under 5:00.

## Before generating the voice

The voice lines now match the slides as they are. They are generic: rain and the
"stop 5 m before" example stay, because the tool covers more than one case study.

- **f21:** the stray `& "pedestrian is at least 1.2 m tall"` text is painted out of the frame
  image (it sat half under the top band, so it is hard to see in Google Slides). If you
  export the deck again, it will come back: in Google Slides, open that slide, press
  Cmd+A to select every object, and look for a selection box at the very top-left edge;
  then delete it. Otherwise, tell me and I paint it out again.
- **f22:** done.

Optional:

- f19 jumps from two boxes to five. Add two more copies (boxes 3, then 4) for a smoother
  unveiling, and split its voice line to match.
