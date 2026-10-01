# R0 - the requirement that rounds 1 (emergency braking, job 3830258) and 2
# (proportional braking, job 3843349) actually ran with, on 2026-09-23.
# It states NO assumptions (`assuming`) and NO soft goals (`ensuring`):
# every failure in those rounds is therefore 'valid' by construction, and
# nothing in the text said the car must keep moving. Compare with
# requirement_full_example.dsl, which shows every clause the DSL has.
# Note: the executor ignored `performed by` until after round 1, so round 1
# ran emergency braking despite this text; round 2 honoured it.
MAINTAIN "Pedestrian Safety"
    by
        "Pedestrian Check" using "Perception Module"
            operationalized as
                "Detect Pedestrian" performed by "yolov5s"
                taking input "image" producing output "pedestrian detection confidence" & "pedestrian detection flag"
    followed by
        "braking" using "braking module"
            operationalized as
                "Bring down throttle" & "Apply Brakes" if "pedestrian detection flag=True" performed by "proportional_braking"
                taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where
        "A pedestrian trying to cross the street in fog."
