MAINTAIN "Pedestrian Safety"
    by
        "Pedestrian Check" using "Perception Module"
            operationalized as
                "Detect Pedestrian" performed by "yolov5s"
                taking input "image" producing output "pedestrian detection confidence" & "pedestrian detection flag"
    followed by
        "braking" using "braking module"
            operationalized as
                "Apply Brakes" if "pedestrian detection flag = True" performed by "emergency_braking"
                taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where
        "A pedestrian trying to cross the street in fog."
    assuming "fog_density <= 50" & "initial_separation_m >= 15" & "pedestrian_min_speed_mps <= 3" & "daylight, dry road" & "pedestrian on foot"
    ensuring "resume_within_s <= 10" & "braking is smooth unless an emergency stop is needed"
