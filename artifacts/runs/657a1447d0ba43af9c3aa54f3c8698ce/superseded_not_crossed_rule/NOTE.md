Superseded on 2026-10-13. These files were produced when every run whose
pedestrian did not finish crossing was set aside as a test defect. The rule
changed: such a run is a test defect only if the pedestrian never entered the
car's lane (scripts/analysis/failure_model.py, classify_failure). In this run
3 of the 4 "not crossed" runs had the pedestrian in the lane and are now
judged as encounters (all three passed). The run folder's main report is the
current one; these are kept for traceability, not deleted.
