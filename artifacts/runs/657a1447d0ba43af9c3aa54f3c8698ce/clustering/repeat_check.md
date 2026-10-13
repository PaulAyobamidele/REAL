# Repeat check: do five repeats of one scenario unfold alike?

Computed 2026-10-08 with `scripts.analysis.cluster` (encoder as in `event_sequences.json`:
debounce 3 frames, safety rule `anywhere`) over every valid encounter, passes included.
Distance = normalised event-sequence edit distance (0 identical, 1 nothing shared).
"Nearest neighbour is a repeat" = for each simulation, the closest other simulation is a
repeat of the same scenario; chance = the expected count if scenario labels were random.
"Brake events removed" drops `braking begins` / `braking released while moving` before
computing, to test whether proportional-brake on/off flicker drives the result.

| run | encounters | distinct sequences | median distance, repeats | median distance, other scenarios | nearest neighbour is a repeat | chance |
|---|---|---|---|---|---|---|
| round 1 (35acc09e) | 120 | 95 | 0.556 | 0.562 | 5 | 3.0 |
| round 1, brake events removed | 120 | - | 0.500 | 0.519 | 3 | 3.0 |
| run 2b (657a1447) | 156 | 143 | 0.591 | 0.667 | 19 | 3.9 |
| run 2b, brake events removed | 156 | - | 0.556 | 0.643 | 15 | 3.9 |

Reading: on round 1 the scenario settings carry no information about how a run unfolds
(nearest-neighbour hits at chance). On run 2b (valid scene) they carry some - about 5x
chance - but 137 of 156 runs are still closer to a run of a different scenario than to any
of their own repeats. Not caused by brake flicker. Measured on event sequences only; what
it implies for per-scenario rates and support bars is not assessed here.
