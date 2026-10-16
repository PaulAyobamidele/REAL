# Study requirement v2 (2026-10-16: pedestrian speed assumption removed - the scene sets the pedestrian's speed from the car's, so the system could break it), car C3 (car mitigation: larger detector): proportional_braking + yolov5m.
# C1-C4 differ only in the two "performed by" names (docs/paper/experiment_design.md).
MAINTAIN "Pedestrian Safety"
    by
        "Pedestrian Check" using "Perception Module"
            operationalized as
                "Detect Pedestrian" performed by "yolov5m"
                taking input "image" producing output "pedestrian detection confidence" & "pedestrian detection flag"
    followed by
        "braking" using "braking module"
            operationalized as
                "Bring down throttle" & "Apply Brakes" if "pedestrian detection flag=True" performed by "proportional_braking"
                taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where
        "A pedestrian trying to cross the street."
    assuming "fog_density <= 50" & "sun_altitude_angle >= 0" & "initial_separation_m >= 15" & "pedestrian on foot"
    ensuring "resume_within_s <= 10" & "braking is smooth unless an emergency stop is needed"
