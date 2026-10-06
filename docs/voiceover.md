# REAL — voice-over for the envisioned tool

*A narration script for the tool's demo video. **ICSE 2027 demo track: the
video must be 3-5 minutes and on YouTube** (docs/paper/icse27_call.md); this
script runs ~5 minutes, so trim to ~4:30 when recording. It describes
the tool as we intend it to be when finished. Numbers marked **(real)** come
from rounds 1–2 already run on Narval; everything else describes the target
behaviour. The table at the end says which parts exist today and which are
still being built.*

---

## 0:00 — The problem

**[SCREEN: a car approaching a pedestrian crossing in fog, CARLA view. It brakes late.]**

> A self-driving car has just failed to stop for a pedestrian.
>
> Testing tools are good at producing moments like this one. Run enough
> simulations and you will find hundreds of them. But a pile of failures
> doesn't tell an engineer what to *do*. Was the camera model too weak? Was
> the braking logic wrong? Was the scene unrealistic? Or did we never write
> down what the car was supposed to guarantee in the first place?
>
> In requirements engineering, a system is correct when, **given what we
> assume about the world, the system's behaviour delivers what we promised**.
> D, S entails R. Machine-learning systems break this relationship all the
> time, and today nobody tracks which of the three was to blame.
>
> REAL is a tool that does.

---

## 0:40 — Writing the requirement

**[SCREEN: the requirement editor. The text is highlighted clause by clause as the narrator names it.]**

```
MAINTAIN "Pedestrian Safety"
  by "Pedestrian Check" ... performed by "yolov5s"
  followed by "braking" ... performed by "proportional_braking"
  in scenario where "A pedestrian trying to cross the street in fog."
  assuming "fog_density <= 50" & "initial_separation_m >= 15" & "pedestrian_speed_mps <= 3"
  ensuring "resume_within_s <= 10" & "peak_jerk_mps3 <= 10"
```

> The engineer starts with one requirement in a goal-oriented language. It
> has three parts, and REAL keeps them separate from start to finish.
>
> **Performed by** names the system under test: here, a YOLO detector and a
> braking controller. That's **S**.
>
> **Assuming** states what we believe about the world: how thick the fog can
> be, how fast a pedestrian walks. That's **D**. And REAL enforces one rule:
> an assumption may describe the world, never the car. Try to write
> "assuming the car drives slowly" and the tool refuses, because that would
> let you define every failure away.
>
> **Ensuring** states the promises beyond safety. The car must not only avoid
> the pedestrian; it must move on again, and brake smoothly. That's part of
> **R**.

---

## 1:20 — Searching for failure

**[SCREEN: the run dashboard. A grammatical-evolution search fills a scatter of scenarios. Failing ones turn red and cluster.]**

> REAL turns the requirement into a scenario grammar: who is crossing, what
> they wear, which way they walk, how far away the car is, how dense the
> fog is. That's tens of thousands of possible scenes.
>
> A grammatical-evolution search breeds scenarios that make the car fail, and
> runs each one in a real driving simulator with the real perception model
> on a GPU cluster. Every simulation leaves a full trace: distances, speeds,
> detection confidence frame by frame, every brake command.
>
> The search deliberately looks *beyond* the stated assumptions, into thicker
> fog and faster pedestrians. That isn't a mistake. It's how REAL will find
> out whether the assumptions matter.

---

## 2:00 — Whose fault is it?

**[SCREEN: the analysis view. Each failure gets a tag: "car's fault" in red, "world broke the assumption" in grey.]**

> Now the step most tools skip. For every failure, REAL checks every stated
> assumption: held, broken, or not measured.
>
> If the fog was thicker than we promised to handle, the failure is
> **spurious**: the world broke the deal. If every assumption held, the
> failure is **valid**, and it belongs to the car.
>
> Then REAL turns the question around. For each assumption it asks: when this
> one was broken, did failures go up? If yes, the assumption is
> **load-bearing**, and the requirement depends on it. If not, it's a
> candidate for loosening. If it was never broken, REAL says so and refuses to
> let you loosen it without evidence.
>
> Assumptions stop being boilerplate in a document. They become claims with
> evidence for or against them.

---

## 2:40 — From failures to obstacles

**[SCREEN: obstacle cards, one at a time. "DetectionTooLate — 70 of 91 failures (real)". A sparkline shows detection at 7 m while the car needs 8 m to stop.]**

> Valid failures are grouped into **obstacles**: named conditions that stop
> the goal from being satisfied, each with its evidence.
>
> In our first round, 91 of 120 real encounters failed **(real)**. REAL
> didn't just report that number. It showed *why*: the pedestrian was
> detected, but at about 7 metres, while the car needed about 8 to stop
> **(real)**. That obstacle is *Detection Too Late*, with 70 failures behind it.
>
> Each obstacle comes with a menu of fixes across the paper's layers: better
> data, a better model, a smarter system around the model, or a more honest
> requirement.

---

## 3:10 — A human decides, and the tool keeps the record

**[SCREEN: the review page. A reviewer accepts an obstacle, picks "system: proportional braking", tightens one assumption, adds a soft goal. The page shows a labelled diff of the requirement.]**

> REAL never changes the requirement by itself. A person reviews each
> obstacle and each assumption: accept, reject, defer; keep, tighten,
> loosen, drop.
>
> The tool then writes the next version of the requirement and labels every
> change: **[S]** we changed the car, **[R]** we changed the promise, **[D]**
> we changed the assumptions, **[T]** we fixed the test. The decision, the
> reviewer, the evidence and the reason are saved together, and the next run
> records which decision caused it.

---

## 3:40 — The loop tells the truth

**[SCREEN: round comparison. Failure rate falls from 76% to 3% (real). Then a second bar rises: stalled passes, 12 → 113 (real).]**

> In round two the reviewer chose proportional braking. Failures dropped from
> 76% to 3% **(real)**. A typical tool would stop there and call it fixed.
>
> REAL didn't. It showed that 113 of the passes were stalls **(real)**: the
> car stopped short and never moved again. The safety goal held, but only by
> giving up on driving. The failure hadn't been solved; it had **shifted**.
> And the original obstacles were **masked, not resolved**: the slower car
> simply avoided the situations that caused them.
>
> That's why the requirement now carries a promise to move on again. And it's
> exactly what the theory predicts: changing one layer can create violations
> in another.

---

## 4:10 — When the test itself is wrong

**[SCREEN: a scene diagram. The "right-to-left" pedestrian walks along the road, not across it. Then the corrected scene, where both directions cross.]**

> Sometimes the honest answer is that the *test* was wrong. Following a
> suspicious pattern, REAL's trail led us to our own scene: one of the two
> crossing directions never actually crossed the road. Part of an apparent
> perception weakness was an artefact of the test.
>
> REAL has a place for that finding, too. It's labelled **[T]**, the scene is
> fixed, and the earlier conclusion is marked as affected. A tool that can
> catch its own test bias is one you can trust with everything else.

---

## 4:35 — Reproducible, and yours

**[SCREEN: a laptop terminal running `real demo`; the review page opens in seconds. Then the lineage graph: R0 → R1 → R2, each node linking to its runs, decisions and evidence.]**

> Everything REAL produces is a file you can open, diff, and cite: the
> requirement versions, the traces, the decisions, the comparisons. Runs are
> repeated and compared one change at a time, and predictions are written
> down before the run, not after.
>
> Reviewers can replay the whole loop on a laptop, without a simulator, from
> the archived runs. The full pipeline runs on a cluster with one command.
>
> And over the rounds, the requirement's history becomes something rare: an
> audit trail of what we assumed, what we promised, what failed, and what we
> decided, for a system that learns.

---

## 4:55 — Close

**[SCREEN: the REAL logo over the lineage graph.]**

> Testing finds failures. REAL turns them into better requirements.
>
> **REAL: Requirements Engineering for mAchines that Learn — and Fail.**

---

## What exists today and what is still being built (status 2026-10-01)

| In the voice-over | Status |
|---|---|
| Requirement language with `performed by`, `assuming`, `ensuring` | built |
| "Assumptions may not be about the car" | built |
| Exhaustive grid search on Narval with full traces | built, used in rounds 1–2 |
| GE search over a large scenario space (scene v2 grammar) | built; first GE run pending |
| Fixed scene (both directions cross, car on the pedestrian's lane) | built; Narval smoke run pending |
| Held / broken / not measured per assumption, and load-bearing verdicts | built; real evidence needs GE / run 2b |
| Obstacles with evidence and a mitigation menu | built |
| Review page, decisions file, labelled requirement diff [S]/[R]/[D]/[T] | built |
| Round comparison: 76% → 3%, stalls 12 → 113 | real result, rounds 1–2 |
| Soft goals checked per run (moving on again; jerk measured) | built; jerk threshold not yet chosen |
| A round that changes D, S and R together | planned: round 3 |
| `real demo` on a laptop without a simulator | planned (roadmap M5.1) |
| Lineage graph view across rounds | envisioned (not in the roadmap yet) |
| Model- and data-layer runs (yolov5m, fine-tuned, newer YOLO) | planned (M2b, M4b) |
| Archived artifact with DOI | planned (M5.8) |
