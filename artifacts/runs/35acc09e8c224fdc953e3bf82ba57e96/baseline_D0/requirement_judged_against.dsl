# Requirement this run is re-judged against (roadmap M1.8, 2026-10-01):
# the text run 35acc09e8c224fdc953e3bf82ba57e96 actually ran with (run_meta.json), plus the assuming /
# ensuring lines of docs/examples/R_baseline.dsl, stated AFTER the run.

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
    assuming "fog_density <= 50" & "initial_separation_m >= 15" & "pedestrian_speed_mps <= 3" & "daylight, dry road" & "pedestrian on foot"
    ensuring "vehicle resumes within 10 s once the crossing is clear" & "braking is smooth unless an emergency stop is needed"
