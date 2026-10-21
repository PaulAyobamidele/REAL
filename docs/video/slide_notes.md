# Slide notes: ICSE 2027 demonstration video

What goes on each slide, the order things appear (builds), and what to say.

Corrected 2026-10-20 after:

- the review against the parent paper and the study data ([slide_notes_review.md](slide_notes_review.md));
- a review of the deck itself.

## Running order

| # | Part | Length |
|---|---|---|
| 1 | **Cold open** (CARLA clip S1) | ~8 s |
| 2 | Slides 0–6 | ~1:45 |
| 3 | **Demo** (clips S3–S8) | ~2:10 |
| 4 | Slide 7, then the results chart (A3), then the study (S9) | ~0:35 |
| 5 | Try it (S10), then the end card | ~0:20 |

Keep the total under 5:00.

## Set-up (every slide)

- **Size:** 16:9.
- **Font:** Poppins. For code, use **one** monospace font without ligatures (Roboto Mono, Source Code Pro or JetBrains Mono NL), so `<=` stays `<=`.
- **Colours:**

  | Use | Colour |
  |---|---|
  | Background | `#F5F5DC` |
  | Text | `#172033` |
  | Grey text | `#4A5161` |
  | Olive (labels, title rule, **the world**) | `#667D01` |
  | Lime (★) | `#9EB200` |
  | **Wine** (top band, **the promise**) | `#8A1538` |
  | Brick (**the car**, failure) | `#AD1F07` |
  | Cards | white, thin border `#DCDCB0` |

- **Master:**
  - a thin **wine** band at the top (not the old dark maroon);
  - an olive section label;
  - a bold title with an olive rule under it;
  - the slide number bottom right, clear of any other text.
- **Spacing:** start the content just under the title rule, with no large empty gap. If a slide has little content, centre it vertically.
- **Builds:** each point fades in, one per line of narration.
- **Captions:** burn in short subtitles in the edit (many reviewers watch muted).

---

## Cold open · the failure (CARLA clip S1, before slide 0)

**Screen:** the CARLA camera clip (`S1.mp4`): the pedestrian steps out and the car keeps coming. Freeze on the closest moment.
**Caption at the freeze:** 3.6 m · margin 5 m

**Say:**
1. A self-driving car meets a pedestrian.
2. Here it came within three point six metres. The requirement asks for five.
3. So who failed: the world it was tested in, the promise we wrote, or the car?

---

## Slide 0 · Title

**On the slide:**
- **REAL** (very large, centred).
- The sub-headline, in grey. Use the same line as the tool and the paper (agree it with your supervisor):
  - today's line: *A Tool for Refining Autonomous Systems Requirements through Compliance Failure Analysis*;
  - the parent paper's expansion: *Requirements Engineering for mAchines that Learn – and Fail*.
- A short olive rule.
- **The authors' names.**
- "ICSE 2027 · Tool Demonstration".
- **One row of logos:** Polytechnique Montréal · Mila · The Open University, on the cream background (no white boxes), with **no** text row repeating the names.

**Builds:** REAL → sub-headline → names → logos.

**Say:** "This is REAL: a tool that helps engineers decide what to change when a self-driving car fails a test."

---

## Slide 1 · The big picture

**Label:** 1 · THE BIG PICTURE
**Title:** Self-driving cars learn to see

**Left side, three cards stacked or in a row:**

| Card | Line under it |
|---|---|
| **Learned, not written** | A detector learns to spot pedestrians from camera images. |
| **Tested in simulation** | Thousands of virtual drives: fog, low sun, wet roads, hidden pedestrians. |
| **Against a requirement** | Each drive passes or fails a safety promise. |

**Below, a quote box with an olive left bar:**
- REQUIREMENT
- *"The car must keep at least 5 m from a pedestrian in its path."*

**Right side:** a CARLA frame (a still from `S1.mp4`), to balance the slide.

**Builds:** title → card 1 → card 2 → card 3 → quote.

**Say:**
1. Self-driving cars learn to see.
2. A detector learns to spot pedestrians from camera images. We can't read it like ordinary code.
3. So it is tested in simulation, over thousands of virtual drives: in fog, in low sun, on wet roads, with pedestrians stepping out from behind parked cars.
4. Each drive passes or fails a requirement…
5. …for example: the car must keep at least five metres from a pedestrian in its path.

---

## Slide 2 · The problem

**Label:** 2 · THE PROBLEM
**Title:** A failure doesn't say what to change

**In brick red, bold:** Hundreds of failures. Fix what?

**Four cards in a row:**

| Card | Line under it |
|---|---|
| **Data** | Retrain the detector? |
| **Model** | Use a larger detector? |
| **System** | Brake differently? |
| **Requirement** | Specify when it holds? |

**Bold line:** Today: decided by hand, and the rationale is lost.
**Brick-red line:** Or the requirement is loosened until the failures disappear.

**Builds:** title → red line → the four cards one by one → "Today…" → "Or…".

**Say:**
1. Simulation finds failures by the hundred.
2. But a failure doesn't say what to change.
3. Retrain the detector? Use a larger one? Brake differently? Or specify more precisely when the requirement holds?
4. Today, engineers sort this out by hand, and the rationale is lost.
5. Worse, a requirement can be quietly loosened until the failures disappear.

---

## Slide 3 · The context

**Label:** 3 · THE CONTEXT
**Title:** A promise holds only in the world we assume
**Small badge, top right or centred:** D, S ⊨ R

**Top row, three cards, in this order:**

| Tag | Card | Line under it |
|---|---|---|
| D · ASSUMPTIONS (olive) | **The World** | What we assume: the fog is not too thick. |
| R · REQUIREMENT (wine) | **The Promise** | Keep 5 m from a pedestrian in its path. |
| S · SYSTEM (brick) | **The Car** | What the system actually does. |

**Line:** So every failure points to **one of three**:

**Bottom row, three cards in the same order.** Build them from one copied card so the borders and text line up.

| Card | Left bar and title colour | Line under it |
|---|---|---|
| **The world we assumed** | olive | The test went beyond it. Say so in the requirement. |
| **The promise we made** | wine | It asked for the wrong thing. Refine it. |
| **The car we built** | brick | The world was as assumed. Fix the car. |

**Builds:** title → D, S ⊨ R → world → promise → car → "So every failure…" → the three bottom cards one by one.

**Say:**
1. In requirements engineering, a promise only holds in the world we assume.
2. There is the world we assume: for example, the fog is not too thick.
3. There is the promise we made.
4. And there is the car, and what it actually does.
5. So every failure points to one of three.
6. The world we assumed: the test went beyond it, and the requirement should say so.
7. The promise we made: it asked for the wrong thing, and should be refined.
8. Or the car we built: the world was as assumed, and the car must be fixed.

---

## Slide 4 · The gap we fill

**Label:** 4 · THE GAP WE FILL
**Title:** Failures and requirements live apart

**Row:**
- left card: **Testing tools** (Find failures in simulation);
- right card: **Requirements tools** (Specify formal promises);
- in between, a pill with a wine border: **★ REAL**.

**Bold line:** An assumption may describe **the world, never the car.** (the last words in olive)
**Grey line:** Designed for requirements engineers and machine-learning engineers.

**Builds:** title → testing tools → requirements tools → ★ REAL → rule → who.

**Say:**
1. Failures and requirements usually live apart.
2. Testing tools find failures; requirements tools specify promises. They are rarely connected.
3. REAL closes the loop, and records every decision.
4. With one firm rule: an assumption may describe the world, never the car. That makes failures much harder to define away.
5. REAL is designed for requirements engineers and machine-learning engineers.

---

## Slide 5 · How REAL works

**Label:** 5 · HOW REAL WORKS
**Title:** From a failed test to a better requirement

**Five boxes left to right, joined by arrows.** Starred boxes have an olive border and a ★. **Under each box, a small screenshot of the matching tool page**, so the slide previews the demo.

| # | Box | Line under it | ★ | Screenshot |
|---|---|---|---|---|
| 1 | **Write** | The requirement in REAL-DSL, with the world it assumes | ★ | Requirement page (editor) |
| 2 | **Test** | CARLA, with the real detector in the loop | (no star) | Test Execution Report |
| 3 | **Understand** | Did the world hold? Similar failures grouped | ★ | Failure Analysis |
| 4 | **Decide** | World, promise or car? The engineer decides, one group at a time | ★ | Obstacle triage |
| 5 | **Refine** | The refined requirement, every change with its reason | ★ | Requirement revision |

**Bar under the boxes:** ↺ Car changes are tested again; world and promise changes are re-checked on the same runs.
**Legend:** ★ What REAL adds · The simulator and the detector are existing tools.

**Builds:** title → box 1 → 2 → 3 → 4 → 5 → bar → legend.

**Say:**
1. Here is how REAL works.
2. The engineer writes the requirement, with the world it assumes.
3. It is tested in CARLA, with the real detector in the loop.
4. REAL checks whether the world held, and groups similar failures.
5. The engineer decides, one group at a time: is it the world, the promise, or the car?
6. REAL writes the refined requirement and records every change with its reason.
7. Changes to the car are tested again; changes to the world or the promise are re-checked on the same runs.

---

## Slide 6 · Let's see it

**Title, centred:** Let's see it

**Five numbered olive circles on a line**, each with the tool's page name under it:

| # | Step | Tool page (small grey text) |
|---|---|---|
| 1 | Write | Requirements Compliance to Validate |
| 2 | Test | Test Execution Report |
| 3 | Understand | Failure Analysis |
| 4 | Decide | Obstacle triage |
| 5 | Refine | Requirement revision |

**Builds:** title → the five steps one by one.

**Say:** "Let's see it, in five steps: write, test, understand, decide, and refine."

→ Cut to the demo clips S3 … S8.

---

## Slide 7 · One change, with its reason (after the demo)

**Label:** RESULTS · BEFORE AND AFTER
**Title:** One change, with its reason
**Small grey tag, top right:** Illustration: a change a reviewer can choose in REAL.

**Two code boxes side by side, all in one monospace font:**

**BEFORE · R0 (grey tag):**
```
performed by "yolov5s"
assuming "fog_density <= 50" & … & "pedestrian on foot"
```

**AFTER · R1 (olive tag, olive border):**
```
performed by "yolov5m"          ← highlight "yolov5m" in light lime
  # the car is at fault: a larger detector     (small grey)
assuming "fog_density <= 50" & … & "pedestrian on foot"
```

**Bottom line, bold:** Each change is tested, so its effect is measured, not assumed.

**Before building, delete the stray text box** `& "pedestrian is at least 1.2 m tall"` at the top-left corner. It still shows on the slide.

**Builds:** title → BEFORE → AFTER → the highlight and its reason → bottom line.

**Say:**
1. Every change REAL writes carries its reason.
2. Here, the reviewer decided the car was at fault, and chose a larger detector.
3. Each change is tested, so its effect is measured, not assumed.

→ Then the **results chart (A3)**. Say:
1. On the same 288 scenarios, the larger detector cut the failures from twenty-two to six, out of three hundred and seventy-six.
2. But braking only for a person in the car's lane, a plausible fix, made it far worse: three hundred and forty-nine. It freezes on the road far less often, but misses far more.
3. That is why every fix is measured.

→ Then the **study clip (S9)**. Say: "Next, about ten practitioners will review the same round independently, so we can compare their decisions."

---

## Slide 8 · End card

**On the card:**
- **REAL** and the sub-headline (the same line as slide 0).
- Result box (olive bar): *Shown on 288 CARLA scenarios × 3 runs: each fix measured, each decision recorded.*
- **QR code** to `<repository URL>`. Scan it with your phone to check before exporting.
- **Beside the QR code, in text:** `<repository URL>`, and the arXiv id once there is one.
- **Bottom row:** the logos (or institution names) and a **real** contact email. Remove `contact@real-tool.org` unless that address exists.
- The slide number must not touch the email; move one of them.

**Say:** "REAL: try it in one Docker command."

---

## Numbers to keep right

| Fact | Value |
|---|---|
| Scenarios | 288, each run 3 times |
| Conditions varied | fog, sun height, wet road, a parked car hiding the pedestrian (no rain) |
| Requirement's margin | 5 m from a pedestrian in the car's path |
| Failures counted against the car, as tested (C1) | 22 of 376 |
| Larger detector (C3) | 6 of 376 |
| Path-aware braking (C2) | 349 of 375 |
| Both (C4) | 335 of 375 |
| Closest approach in C1 | 1.35 m |
| Test case 6 (the cold open) | 3.6 m: say "here", not "the worst" |

## Do not say

- "pedestrian is at least 1.2 m tall", or any assumption that scopes children out;
- "world or car?" alone: it is three answers (world, promise, car);
- "nothing connects";
- "the next round" for the larger detector (it was run on the same scenarios);
- "rain".
