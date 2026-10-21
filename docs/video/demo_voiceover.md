# Demo clips and their voice-over (for the ElevenLabs project)

The clips are in `artifacts/video/2026-10-20/elevenlabs/`, numbered in playing order. Your slides go between them, where marked.

- Each clip has the lines to paste into ElevenLabs, one line per take.
- No numbers are said before the results (07), as agreed. Numbers that are visible on screen are fine.
- Word counts fit the clip lengths at a calm pace (about 2.5 words a second).
- If a voice line runs longer than its clip, freeze the clip's last frame.
- If a clip runs longer than its voice line, trim the clip's end.

All clips are 1920 × 1080 MP4, in the tool's Wine colours. They were recorded on the preloaded round (no cluster needed). No run is ever submitted.

---

## 00 · Cold open (`00_cold_open.mp4`, 11.6 s)

**Screen:** test case 6. On the left, the CARLA camera; on the right, the replay drawn from the run's trace, playing to the closest moment: "Closest: 3.6 m, inside the 5 m margin: failed".

**Say:**
1. A self-driving car meets a pedestrian.
2. Here it came within three point six metres. The requirement asks for five.
3. So who failed: the world it was tested in, the promise we wrote, or the car?

*(Then your slides 0 to 6.)*

---

## 01 · Write the requirement (`01_write_requirement.mp4`, 21.7 s)

**Screen:**
1. The requirement page: the REAL-DSL editor beside the goal model.
2. Typing, with completion offering only the modules the simulator runs.
3. The pointer on an assumption, which lights up its box in the goal model.
4. The run panel, which checks the requirement (never submitted).

**Say:**
1. The engineer writes the requirement in REAL-DSL.
2. The editor completes it as you type, and offers only modules the simulator really runs.
3. Point at any part of the text, and the goal model shows where it sits.
4. One button checks the requirement and runs it in CARLA, with the real detector in the loop.

---

## 02 · A worked example (`02_worked_example.mp4`, 24.6 s)

**Screen:** test case 6. The CARLA camera recording, and the replay of a counted run playing to the closest moment. Under it, the moments: brakes, sees the pedestrian, closest.

**Say:**
1. Before the numbers, one example, so the failure is concrete.
2. On the left, what the car's camera saw. On the right, a replay drawn from the run's recorded trace.
3. Here the car began to brake, here the detector saw the pedestrian, and here it came inside the safety margin.

---

## 03 · Test Execution Report (`03_test_execution_report.mp4`, 17.4 s)

**Screen:** the report's counts. The pointer moves down "What failed in the requirement"; on "fog_density <= 50" (broken), the line is outlined in the requirement beside it.

**Say:**
1. The report judges each part of the requirement on its own, and shows where it sits.
2. When an assumption about the world was broken, those runs are set aside. The car is not blamed for them.

---

## 04 · Failure Analysis (`04_failure_analysis.mp4`, 17.3 s)

**Screen:** the goal model with its obstacles, DetectionTooLate selected with its evidence. Then the pattern map, with that obstacle's runs ringed.

**Say:**
1. REAL groups the failures into obstacles, each attached to the goal it blocks, with its evidence.
2. On the map, runs that unfolded alike sit close together, and the runs behind the selected obstacle are ringed.

---

## 05 · Obstacle triage (`05_obstacle_triage.mp4`, 21.7 s)

**Screen:**
1. PedestrianSizeTooSmall: "The car is at fault" is chosen.
2. DetectionTooLate: the pointer rests on the world option, which is greyed out with its reason; then "The car is at fault".

**Say:**
1. Then the engineer decides, one obstacle at a time: does the world explain these failures, or is the car at fault?
2. Small pedestrians are part of the world the car must handle, so here the car is at fault.
3. And REAL holds one line firmly: an assumption may describe the world, never the car.

---

## 06 · Requirement revision (`06_requirement_revision.mp4`, 36.9 s)

**Screen:**
1. The refined requirement, then the remaining failures.
2. DetectionTooLate: "It is a real system failure", then the larger detector.
3. StandoffUnnecessaryStop: "Refine the requirement", with the new promise typed in: "The car must resume within 10 s once the crossing is clear."
4. The rest: "Not enough evidence: leave it for the next round".
5. The reviewer's name, then Sign.

**Say:**
1. Every failure that remains gets one of three outcomes.
2. This one is a real system failure. The engineer picks a fix for the car: a larger detector.
3. Here, the promise itself asked the wrong thing. The car stopped and never moved on, so the requirement is refined, in the engineer's own words.
4. The rest have too little evidence, so they carry over to the next round.
5. Signing records every decision, each with its reason.

*(Then your slide 7, "One change, with its reason".)*

---

## 07 · Results chart (`07_results_chart.mp4`, 16 s)

**Screen:** four bars, failures counted against the car: as tested 22, larger detector 6, path-aware braking 349, both 335.

**Say:**
1. On the same 288 scenarios, the larger detector cut the failures from twenty-two to six, out of three hundred and seventy-six.
2. But braking only for a person in the car's lane, a plausible fix, made it far worse: three hundred and forty-nine.
3. That is why every change is measured.

---

## 08 · Who reviews, and the study (`08_welcome.mp4`, 8.6 s)

**Screen:** the tool's welcome page, with REAL's four steps; the reviewer types their expertise ("Legal Compliance"), which is recorded with every signed review.

**Say:** Each review records who made it and their expertise. Next, about ten practitioners will review the same round independently, so we can compare their decisions.

---

## 09 · Try it (`09_try_it.mp4`, 16.4 s)

**Screen:** a terminal typing `docker run --rm -p 8080:80 <docker image>`, then the tool's Manual page, scrolled.

**Say:**
1. REAL runs in one Docker command, with no build needed.
2. It comes with a manual for REAL-DSL and example rounds to explore.

*(Then your slide 8, the end card.)*

`10_end_card_optional.mp4` is my end card, with a working QR code to <repository URL>. Use it only if you prefer it to your own slide.

---

## Before you upload

- Check the Docker image name in clip 09 (`<docker image>`) is the one you publish. If not, I re-record clip 09.
- Clip 05 still **shows** the tool's world option for small pedestrians ("pedestrian is at least 1.2 m tall") as an option that is not chosen. Changing what the tool suggests is a separate decision.
