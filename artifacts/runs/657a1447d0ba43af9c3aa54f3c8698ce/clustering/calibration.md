# Calibration: distance threshold x linkage, scored by adjusted Rand index

Safety rule `anywhere`, detection debounce 3 frames.

Reference labels: each failing scenario's majority rule type over its failing repeats (ties: the type of its medoid repeat). Label counts: detected_too_late 1, brake_released 7. Types never a scenario majority: braking_insufficient, stopped_too_close, never_detected.

Every setting tried is listed. Ward, centroid and median linkage are not tried: they assume Euclidean distances and ours is an edit distance.

**Chosen:** single linkage, threshold 0.6 -> 2 clusters, ARI 1.000. Rule: highest ARI; ties go to the fewest clusters, then the larger threshold.

**Chance level of this sweep:** with the labels shuffled 200 times, the best ARI over all settings had median 0.077, 95th percentile 1.000 (the winner of a sweep is optimistic; compare with this, not with 0).

## Sweep

| linkage | threshold | clusters | ARI |
|---|---|---|---|
| single | 0.05 | 8 | 0.000 |
| single | 0.1 | 8 | 0.000 |
| single | 0.15 | 8 | 0.000 |
| single | 0.2 | 8 | 0.000 |
| single | 0.25 | 8 | 0.000 |
| single | 0.3 | 8 | 0.000 |
| single | 0.35 | 8 | 0.000 |
| single | 0.4 | 8 | 0.000 |
| single | 0.45 | 6 | 0.077 |
| single | 0.5 | 3 | 0.556 |
| single | 0.55 | 3 | 0.556 |
| single | 0.6 | 2 | 1.000 |
| single | 0.65 | 1 | 0.000 |
| single | 0.7 | 1 | 0.000 |
| single | 0.75 | 1 | 0.000 |
| single | 0.8 | 1 | 0.000 |
| single | 0.85 | 1 | 0.000 |
| single | 0.9 | 1 | 0.000 |
| single | 0.95 | 1 | 0.000 |
| complete | 0.05 | 8 | 0.000 |
| complete | 0.1 | 8 | 0.000 |
| complete | 0.15 | 8 | 0.000 |
| complete | 0.2 | 8 | 0.000 |
| complete | 0.25 | 8 | 0.000 |
| complete | 0.3 | 8 | 0.000 |
| complete | 0.35 | 8 | 0.000 |
| complete | 0.4 | 8 | 0.000 |
| complete | 0.45 | 7 | 0.024 |
| complete | 0.5 | 6 | 0.050 |
| complete | 0.55 | 6 | 0.050 |
| complete | 0.6 | 4 | 0.167 |
| complete | 0.65 | 3 | 0.273 |
| complete | 0.7 | 3 | 0.273 |
| complete | 0.75 | 2 | 0.000 |
| complete | 0.8 | 2 | 0.000 |
| complete | 0.85 | 2 | 0.000 |
| complete | 0.9 | 1 | 0.000 |
| complete | 0.95 | 1 | 0.000 |
| average | 0.05 | 8 | 0.000 |
| average | 0.1 | 8 | 0.000 |
| average | 0.15 | 8 | 0.000 |
| average | 0.2 | 8 | 0.000 |
| average | 0.25 | 8 | 0.000 |
| average | 0.3 | 8 | 0.000 |
| average | 0.35 | 8 | 0.000 |
| average | 0.4 | 8 | 0.000 |
| average | 0.45 | 7 | 0.024 |
| average | 0.5 | 6 | 0.050 |
| average | 0.55 | 5 | 0.105 |
| average | 0.6 | 3 | 0.273 |
| average | 0.65 | 2 | 0.000 |
| average | 0.7 | 1 | 0.000 |
| average | 0.75 | 1 | 0.000 |
| average | 0.8 | 1 | 0.000 |
| average | 0.85 | 1 | 0.000 |
| average | 0.9 | 1 | 0.000 |
| average | 0.95 | 1 | 0.000 |
| weighted | 0.05 | 8 | 0.000 |
| weighted | 0.1 | 8 | 0.000 |
| weighted | 0.15 | 8 | 0.000 |
| weighted | 0.2 | 8 | 0.000 |
| weighted | 0.25 | 8 | 0.000 |
| weighted | 0.3 | 8 | 0.000 |
| weighted | 0.35 | 8 | 0.000 |
| weighted | 0.4 | 8 | 0.000 |
| weighted | 0.45 | 7 | 0.024 |
| weighted | 0.5 | 6 | 0.050 |
| weighted | 0.55 | 5 | 0.105 |
| weighted | 0.6 | 3 | 0.273 |
| weighted | 0.65 | 2 | 0.000 |
| weighted | 0.7 | 2 | 0.000 |
| weighted | 0.75 | 1 | 0.000 |
| weighted | 0.8 | 1 | 0.000 |
| weighted | 0.85 | 1 | 0.000 |
| weighted | 0.9 | 1 | 0.000 |
| weighted | 0.95 | 1 | 0.000 |

## Confusion matrix (chosen setting): clusters x scenario rule type

| cluster | detected_too_late | brake_released |
|---|---|---|
| 1 | 0 | 7 |
| 2 | 1 | 0 |
