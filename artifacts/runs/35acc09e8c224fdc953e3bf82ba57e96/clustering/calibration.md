# Calibration: distance threshold x linkage, scored by adjusted Rand index

Safety rule `anywhere`, detection debounce 3 frames.

Reference labels: each failing scenario's majority rule type over its failing repeats (ties: the type of its medoid repeat). Label counts: detected_too_late 23, brake_released 6, braking_insufficient 1. Types never a scenario majority: stopped_too_close, never_detected.

Every setting tried is listed. Ward, centroid and median linkage are not tried: they assume Euclidean distances and ours is an edit distance.

**Chosen:** complete linkage, threshold 0.7 -> 3 clusters, ARI 0.729. Rule: highest ARI; ties go to the fewest clusters, then the larger threshold.

**Chance level of this sweep:** with the labels shuffled 200 times, the best ARI over all settings had median 0.090, 95th percentile 0.334 (the winner of a sweep is optimistic; compare with this, not with 0).

## Sweep

| linkage | threshold | clusters | ARI |
|---|---|---|---|
| single | 0.05 | 25 | 0.014 |
| single | 0.1 | 23 | 0.026 |
| single | 0.15 | 17 | 0.088 |
| single | 0.2 | 12 | 0.134 |
| single | 0.25 | 8 | 0.527 |
| single | 0.3 | 6 | 0.314 |
| single | 0.35 | 5 | 0.382 |
| single | 0.4 | 3 | 0.334 |
| single | 0.45 | 2 | 0.148 |
| single | 0.5 | 2 | 0.148 |
| single | 0.55 | 1 | 0.000 |
| single | 0.6 | 1 | 0.000 |
| single | 0.65 | 1 | 0.000 |
| single | 0.7 | 1 | 0.000 |
| single | 0.75 | 1 | 0.000 |
| single | 0.8 | 1 | 0.000 |
| single | 0.85 | 1 | 0.000 |
| single | 0.9 | 1 | 0.000 |
| single | 0.95 | 1 | 0.000 |
| complete | 0.05 | 25 | 0.014 |
| complete | 0.1 | 23 | 0.026 |
| complete | 0.15 | 18 | 0.052 |
| complete | 0.2 | 17 | 0.048 |
| complete | 0.25 | 15 | 0.093 |
| complete | 0.3 | 14 | 0.096 |
| complete | 0.35 | 12 | 0.137 |
| complete | 0.4 | 11 | 0.162 |
| complete | 0.45 | 9 | 0.230 |
| complete | 0.5 | 7 | 0.231 |
| complete | 0.55 | 7 | 0.231 |
| complete | 0.6 | 6 | 0.382 |
| complete | 0.65 | 4 | 0.370 |
| complete | 0.7 | 3 | 0.729 |
| complete | 0.75 | 2 | 0.328 |
| complete | 0.8 | 2 | 0.328 |
| complete | 0.85 | 1 | 0.000 |
| complete | 0.9 | 1 | 0.000 |
| complete | 0.95 | 1 | 0.000 |
| average | 0.05 | 25 | 0.014 |
| average | 0.1 | 23 | 0.026 |
| average | 0.15 | 18 | 0.052 |
| average | 0.2 | 17 | 0.048 |
| average | 0.25 | 14 | 0.073 |
| average | 0.3 | 11 | 0.194 |
| average | 0.35 | 10 | 0.220 |
| average | 0.4 | 8 | 0.160 |
| average | 0.45 | 7 | 0.167 |
| average | 0.5 | 6 | 0.295 |
| average | 0.55 | 4 | 0.265 |
| average | 0.6 | 3 | 0.334 |
| average | 0.65 | 2 | 0.328 |
| average | 0.7 | 1 | 0.000 |
| average | 0.75 | 1 | 0.000 |
| average | 0.8 | 1 | 0.000 |
| average | 0.85 | 1 | 0.000 |
| average | 0.9 | 1 | 0.000 |
| average | 0.95 | 1 | 0.000 |
| weighted | 0.05 | 25 | 0.014 |
| weighted | 0.1 | 23 | 0.026 |
| weighted | 0.15 | 18 | 0.052 |
| weighted | 0.2 | 17 | 0.048 |
| weighted | 0.25 | 14 | 0.091 |
| weighted | 0.3 | 12 | 0.137 |
| weighted | 0.35 | 10 | 0.220 |
| weighted | 0.4 | 8 | 0.160 |
| weighted | 0.45 | 7 | 0.100 |
| weighted | 0.5 | 7 | 0.100 |
| weighted | 0.55 | 5 | 0.201 |
| weighted | 0.6 | 3 | 0.334 |
| weighted | 0.65 | 2 | 0.328 |
| weighted | 0.7 | 1 | 0.000 |
| weighted | 0.75 | 1 | 0.000 |
| weighted | 0.8 | 1 | 0.000 |
| weighted | 0.85 | 1 | 0.000 |
| weighted | 0.9 | 1 | 0.000 |
| weighted | 0.95 | 1 | 0.000 |

## Confusion matrix (chosen setting): clusters x scenario rule type

| cluster | detected_too_late | brake_released | braking_insufficient |
|---|---|---|---|
| 1 | 0 | 1 | 1 |
| 2 | 2 | 5 | 0 |
| 3 | 21 | 0 | 0 |
