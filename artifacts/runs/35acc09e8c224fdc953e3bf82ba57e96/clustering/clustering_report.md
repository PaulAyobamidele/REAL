# Failure-trace clustering (prototype)

Prototype on round 1, whose scene defects are documented in Notes Sec. 8.19; these clusters are a methodological result, not a finding about the vehicle.

Input: `35acc09e8c224fdc953e3bf82ba57e96`, safety rule `anywhere`, detection debounce 3 frames - 91 failing simulations in 30 failing scenarios. Encoding in `event_sequences.json`, sweep in `calibration.md`, cut in `dendrogram.png`.

Setting: complete linkage, threshold 0.7: 3 clusters, ARI 0.729 against the rule types (chance best-of-sweep: median 0.090, 95th pct 0.334).

## Repeats (reproducibility)

Normalised distance between event sequences (0 = identical, 1 = nothing shared). If repeats of one scenario are about as far apart as different scenarios, the scenario settings do not determine how the run unfolds.

- All valid encounters (passes included): 120 simulations, 95 distinct sequences; repeats of one scenario median 0.556 (176 pairs), different scenarios median 0.562 (6964 pairs)
- Failures only: 91 simulations, 70 distinct sequences; repeats of one scenario median 0.500 (104 pairs), different scenarios median 0.528 (3991 pairs)

7 of 30 failing scenarios have two failing repeats further apart than the cut (0.7): 7 (0.82, types {'detected_too_late': 3, 'brake_released': 1}), 8 (0.79, types {'detected_too_late': 3}), 19 (0.76, types {'stopped_too_close': 1, 'detected_too_late': 1, 'braking_insufficient': 1}), 23 (0.72, types {'brake_released': 1, 'detected_too_late': 2}), 27 (0.79, types {'detected_too_late': 3, 'braking_insufficient': 1}), 29 (0.77, types {'brake_released': 2, 'detected_too_late': 1}), 31 (0.79, types {'detected_too_late': 2, 'brake_released': 1}).

## Clusters

### Cluster 3 - 21 scenarios, 70 failing simulations

Scenarios: 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 17, 22, 23, 24, 26, 27, 31 (medoid 0)

Medoid sequence:

1. closing to 20-10 m
2. first detected (>0.30)
3. closing to 10-5 m
4. detection reaches 0.85 + braking begins
5. safety violated (<5 m)
6. braking released while moving
7. closest approach

Rule types (failing simulations): detected_too_late 87%, brake_released 10%, never_detected 1%, braking_insufficient 1%; scenario labels: detected_too_late 21

Over-represented settings (share in cluster vs all failing scenarios, +25 points or more): none

Catalogue: DetectionTooLate via detected_too_late (87% of failing simulations)

### Cluster 2 - 7 scenarios, 17 failing simulations

Scenarios: 9, 18, 20, 21, 25, 28, 29 (medoid 20)

Medoid sequence:

1. closing to 20-10 m
2. first detected (>0.30)
3. detection reaches 0.85 + braking begins
4. braking released while moving + closing to 10-5 m
5. detection reaches 0.85 + braking begins
6. ego stops + safety violated (<5 m)
7. ego resumes
8. detection lost (<=0.30 after 0.85)
9. closest approach

Rule types (failing simulations): brake_released 53%, detected_too_late 47%; scenario labels: detected_too_late 2, brake_released 5

Over-represented settings (share in cluster vs all failing scenarios, +25 points or more): direction=RL 86% vs 47%, pedestrian=Adult 86% vs 50%

Catalogue: no rule type covers 60% of the cluster or no catalogue entry - UNNAMED, for a human to name

### Cluster 1 - 2 scenarios, 4 failing simulations

Scenarios: 15, 19 (medoid 15)

Medoid sequence:

1. first detected (>0.30)
2. closing to 20-10 m
3. detection reaches 0.85 + braking begins + closing to 10-5 m
4. ego stops
5. detection reaches 0.85 + braking begins
6. detection reaches 0.85 + braking begins
7. ego resumes
8. detection reaches 0.85 + braking begins
9. braking released while moving
10. detection reaches 0.85 + braking begins
11. braking released while moving
12. detection reaches 0.85 + braking begins
13. braking released while moving + safety violated (<5 m)
14. detection reaches 0.85 + braking begins
15. braking released while moving
16. detection lost (<=0.30 after 0.85)
17. closest approach

Rule types (failing simulations): brake_released 25%, stopped_too_close 25%, detected_too_late 25%, braking_insufficient 25%; scenario labels: brake_released 1, braking_insufficient 1

Over-represented settings (share in cluster vs all failing scenarios, +25 points or more): pedestrian=Child 100% vs 50%, dress=Dark 100% vs 53%

Catalogue: no rule type covers 60% of the cluster or no catalogue entry - UNNAMED, for a human to name

## Summary

Clustering recovered the main rule type: cluster 3 (21 scenarios) is all detected_too_late scenarios, medoid = detected at 10-5 m, braking too late, violation. ARI 0.729 is well above the sweep's chance level (95th pct 0.334) but only one of 76 settings reaches it (complete, 0.7); every other setting scores <= 0.38. It split the rules' view of one behaviour: cluster 2 (7 scenarios, 17 simulations) is stop-then-resume - the car stops inside 5 m and drives on before the closest approach - and the rules divide it between brake_released (53%) and detected_too_late (47%), because they label a run by its state at closest approach. That cluster is 86% direction=RL, the direction that is not a real crossing in this scene (Notes Sec. 8.19), so it is most likely a scene artefact. Cluster 2 and the 2-scenario cluster 1 (brake switching on and off around the 0.85 bar) have no single rule-based counterpart and are unnamed candidates for a human to name or reject. Repeats of one scenario are as far apart as different scenarios (see repeat_check.md).
