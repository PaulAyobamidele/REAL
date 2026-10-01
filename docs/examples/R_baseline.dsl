# R_baseline - the baseline requirement from run 2b on (roadmap M1.7, agreed
# with the supervisor 2026-10-01): the same car as rounds 1-2 (R0_rounds1_2.dsl)
# plus BOTH slots the paper's D, S |= R needs:
#   assuming  - the baseline domain assumptions D0 (docs/design/domain_assumptions.md),
#               loose on purpose: the whole grid and ordinary walking.
#               Checked per simulation after the run, never imposed on the simulator.
#   ensuring  - the baseline soft goals E0: the car moves on again within 10 s of
#               stopping (checked from scene v2 on); smoothness stays text until a
#               jerk threshold is chosen (peak_jerk_mps3 is measured).
# Runs before scene v2 lack pedestrian speed and the soft-goal measures:
# those are reported as not measured.
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
    ensuring "resume_within_s <= 10" & "braking is smooth unless an emergency stop is needed"
