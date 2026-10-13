# Failure-trace clustering (prototype)

Prototype on run 2b (scene v2.3, valid test - Notes Sec. 8.40-8.41); these clusters are a methodological result, not a finding about the vehicle.

Input: `657a1447d0ba43af9c3aa54f3c8698ce`, safety rule `anywhere`, detection debounce 3 frames - 10 failing simulations in 8 failing scenarios. Encoding in `event_sequences.json`, sweep in `calibration.md`, cut in `dendrogram.png`.

Setting: single linkage, threshold 0.6: 2 clusters, ARI 1.000 against the rule types (chance best-of-sweep: median 0.077, 95th pct 1.000).

## Repeats (reproducibility)

Normalised distance between event sequences (0 = identical, 1 = nothing shared). If repeats of one scenario are about as far apart as different scenarios, the scenario settings do not determine how the run unfolds.

- All valid encounters (passes included): 156 simulations, 143 distinct sequences; repeats of one scenario median 0.591 (305 pairs), different scenarios median 0.667 (11785 pairs)
- Failures only: 10 simulations, 10 distinct sequences; repeats of one scenario median 0.547 (2 pairs), different scenarios median 0.606 (43 pairs)

1 of 8 failing scenarios have two failing repeats further apart than the cut (0.6): 18 (0.68, types {'brake_released': 2}).

## Clusters

### Cluster 1 - 7 scenarios, 9 failing simulations

Scenarios: 2, 3, 10, 11, 18, 20, 30 (medoid 3)

Medoid sequence:

1. closing to 20-10 m
2. braking begins
3. first detected (>0.30)
4. ego stops
5. pedestrian enters the ego's lane
6. pedestrian leaves the ego's lane
7. ego resumes
8. braking begins + closing to 10-5 m
9. detection reaches 0.85
10. ego stops
11. braking begins
12. detection reaches 0.85
13. braking begins
14. detection lost (<=0.30 after 0.85)
15. braking begins + ego resumes
16. ego stops
17. ego resumes
18. safety violated (<5 m)
19. closest approach

Rule types (failing simulations): brake_released 100%; scenario labels: brake_released 7

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

Too few failures for this to test the method: 10 failing simulations in 8 scenarios, 9 of them brake_released, so ARI 1.0 only says the single detected_too_late scenario (26) sits apart. Round 1's stop-and-resume shape survives in sequence form - cluster 1's medoid stops, the pedestrian enters and leaves the lane, the car resumes and passes - but with the lane events it reads as the car moving on after the pedestrian has crossed (pedestrian out of the lane at closest approach), i.e. the spurious far-kerb 'failures' of Notes Sec. 8.40, not a braking failure. No group without a rule-based counterpart. Under the path-aware rule see ../clustering_path/. Repeat variance: see repeat_check.md.
