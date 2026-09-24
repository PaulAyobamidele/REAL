# Proposed requirement change - after run `882fb2fe00bf4568bdb480a281db9e8b`

Labels: **[S]** specification (the system changes: `performed by`), **[R]** requirement (an `assuming` domain assumption or `ensuring` soft goal is added), **[D]** domain/test (a scenario or scope fix - not requirement text). R1 is a proposal: edit or accept; nothing is applied automatically.

## Changes
- [R] from `StandoffUnnecessaryStop` (requirement): ensuring "vehicle resumes within 10 s once the crossing is clear"
- [D] from `artefact:crossing_trigger_8m` (scenario): scratch.temp: trigger the crossing on a timer or on the pedestrian's own distance to the crossing point, not on proximity to the ego.
- [D] from `artefact:no_encounter_geometry` (scenario): scratch.temp: choose the lane/spot so the ego approaches the crossing point; or reject such samples with a Scenic `require`.
- [D] from `artefact:distance_parameter_dead` (scenario): scratch.temp: place the pedestrian from `distance` (as scenic_template.py's get_pedestrian_pos did), or drop the parameter from old.bnf.

## R0 (as run)
```
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
```
## R1 (proposed)
```
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
    ensuring "vehicle resumes within 10 s once the crossing is clear"
```
## Unified diff
```diff
--- R0.dsl
+++ R1.dsl
@@ -11,3 +11,4 @@
                 taking input "pedestrian detection flag" producing output "Braking Status Flag"
     in scenario where
         "A pedestrian trying to cross the street in fog."
+    ensuring "vehicle resumes within 10 s once the crossing is clear"
```
