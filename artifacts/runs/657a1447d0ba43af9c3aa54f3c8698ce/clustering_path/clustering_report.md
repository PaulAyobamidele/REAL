# Failure-trace clustering (prototype)

Prototype on run 2b (scene v2.3, valid test - Notes Sec. 8.40-8.41); these clusters are a methodological result, not a finding about the vehicle.

Input: `657a1447d0ba43af9c3aa54f3c8698ce`, safety rule `path`, detection debounce 3 frames - 4 failing simulations in 4 failing scenarios. Encoding in `event_sequences.json`, sweep in `calibration.md`, cut in `dendrogram.png`.

Setting: weighted linkage, threshold 0.7: 2 clusters, ARI 1.000 against the rule types (chance best-of-sweep: median 0.500, 95th pct 1.000).

## Repeats (reproducibility)

Normalised distance between event sequences (0 = identical, 1 = nothing shared). If repeats of one scenario are about as far apart as different scenarios, the scenario settings do not determine how the run unfolds.

- All valid encounters (passes included): 156 simulations, 143 distinct sequences; repeats of one scenario median 0.591 (305 pairs), different scenarios median 0.667 (11785 pairs)
- Failures only: 4 simulations, 4 distinct sequences; repeats of one scenario median n/a (0 pairs), different scenarios median 0.629 (6 pairs)

0 of 4 failing scenarios have two failing repeats further apart than the cut (0.7).

## Clusters

### Cluster 1 - 3 scenarios, 3 failing simulations

Scenarios: 10, 18, 20 (medoid 20)

Medoid sequence:

1. closing to 20-10 m
2. closing to 10-5 m
3. braking begins
4. first detected (>0.30) + detection reaches 0.85
5. pedestrian enters the ego's lane
6. ego stops
7. safety violated (<5 m)
8. pedestrian leaves the ego's lane
9. detection lost (<=0.30 after 0.85)
10. ego resumes
11. braking begins
12. braking released while moving
13. closest approach

Rule types (failing simulations): brake_released 100%; scenario labels: brake_released 3

Over-represented settings (share in cluster vs all failing scenarios, +25 points or more): none

Catalogue: BrakingNotLatched via brake_released (100% of failing simulations)

### Cluster 2 - 1 scenarios, 1 failing simulations

Scenarios: 26 (medoid 26)

Medoid sequence:

1. closing to 20-10 m
2. closing to 10-5 m
3. braking begins + pedestrian enters the ego's lane
4. first detected (>0.30) + detection reaches 0.85 + safety violated (<5 m)
5. ego stops
6. closest approach

Rule types (failing simulations): detected_too_late 100%; scenario labels: detected_too_late 1

Over-represented settings (share in cluster vs all failing scenarios, +25 points or more): none

Catalogue: DetectionTooLate via detected_too_late (100% of failing simulations)

## Summary

Four failures (3 brake_released, 1 detected_too_late) - too few to cluster meaningfully; ARI 1.0 is the lone detected_too_late scenario sitting apart. The 3 brake_released medoid (scenario 20): the car stops inside 5 m while the pedestrian is in its lane, the pedestrian leaves the lane, the car resumes and the overall closest approach comes after - so the path-rule violation is a stop too close, while the rule type (taken at the overall closest approach) says brake_released. Stop-and-resume exists on the valid scene, but in 3 runs and as 'stopped too close, then moved on', not as round 1's resume-into-the-pedestrian. No group without a rule-based counterpart.
