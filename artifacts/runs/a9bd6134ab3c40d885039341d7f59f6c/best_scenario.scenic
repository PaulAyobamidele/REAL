# SET SCENARIO PARAMETERS AND MODEL 
import carla
import logging
import time
import os
import sys
import random
import cv2

from scripts.analysis import telemetry

# Define the weather conditions
weather = {
    "cloudiness":50,
    "precipitation":0,
    "sun_azimuth_angle":80,
    "sun_altitude_angle":60,
    "fog_density":0 
}

# Apply the weather conditions to the scenario
param map = localPath('/artifacts/maps/Town01.xodr')
param carla_map = 'Town01'
model scenic.simulators.carla.model  # Here the definitions of all referenceables are defined (vehicle types, road library, etc) 
import scenic.simulators.carla as carla_simulator
param weather = weather
# SCENARIO CONSTANTS 
EGO_MODEL = "vehicle.tesla.model3"
PEDESTRIAN_MODEL = "walker.pedestrian.0008"
EGO_SPEED = 7.5
SAFETY_DISTANCE = 10
BRAKE_INTENSITY = 1.0
PEDESTRIAN_MIN_SPEED = 2.0   # CrossingBehavior's floor; it walks faster to meet the car
# Scene v2 (roadmap M2, Notes 8.19). All four come from util.build_scenario:
CROSSING_TRIGGER_M = 100.0   # pedestrian steps out once the car is this close (was a fixed 8 m)
APPROACH_DISTANCE_M = 20.0   # car starts this far before the crossing point (grid `distance` or GE setting)
PEDESTRIAN_SIDE = -1         # -1 = starts at the left kerb, +1 = right kerb (driver's view)
KERB_OFFSET_M = 3.0                         # lateral start, from the lane centre
DETECTION_CONFIDENCE = 0.85   # full braking above this (baseline / paper MLSv1)
CAUTION_CONFIDENCE = 0.30     # proportional braking starts here (paper M4)

# SENSOR ATTRIBUTES
attrs = {"image_size_x": 640,
         "image_size_y": 640}

## DEFINING SPATIAL RELATIONS
lane = Uniform(*network.lanes)
# Everything is placed along the chosen lane's OWN direction (lane.orientation).
# `facing lane.orientation` is rejected by this Scenic (smoke run 2, job
# 4385790), so the heading is read off the field at the sampled point.
# Checked on the laptop by tests/test_scene_compile.py (Notes 8.27).
crossing = new Point on lane.centerline
spot = new OrientedPoint at crossing, facing lane.orientation[crossing.position]
vending_spot = new OrientedPoint following lane.orientation from spot for -3

_perception = {"step": -1, "confidence": 0.0}

def perceive(observations):
    # Same detector call as checkPedestrianDectectedFlag in the vendored
    # driving model (YOLO class 0 = person), but it returns the highest person
    # confidence (0.0 if none) instead of a yes/no, runs YOLO at most once per
    # simulation step (cached - the braking behaviours below may ask twice),
    # and logs confidence + inference time for EVERY frame to the telemetry
    # log so failure analysis can see why the car did or did not brake.
    step = simulation().currentTime
    if _perception["step"] == step:
        return _perception["confidence"]
    confidence = 0.0
    if observations is not None:
        resized_frame = cv2.resize(observations, (640, 640))
        t0 = time.time()
        results = yolo_model(resized_frame)
        inference_ms = (time.time() - t0) * 1000
        df = results.pandas().xyxy[0]
        persons = df[df["class"] == 0]
        confidence = float(persons["confidence"].max()) if not persons.empty else 0.0
        telemetry.log_detection(step=step, confidence=confidence,
                                inference_ms=inference_ms, ego_speed=ego.speed,
                                dist_m=ego.position.distanceTo(pedestrian.position))
    _perception["step"] = step
    _perception["confidence"] = confidence
    return confidence

def brake_now(brake):
    telemetry.log_brake(step=simulation().currentTime, brake=brake, ego_speed=ego.speed,
                        dist_m=ego.position.distanceTo(pedestrian.position))

# Filled by scripts/simulations/util.py::build_scenario from the braking module
# the requirement names after "performed by": emergency_braking (the baseline)
# or proportional_braking (paper M4). See BRAKING_BEHAVIOURS there.
behavior Exp_EgoBehaviour():
    try:
        do FollowLaneBehavior(target_speed = EGO_SPEED)
    interrupt when perceive(ego.observations["front_rgb"]) > CAUTION_CONFIDENCE:
        brake = adjust_based_on_confidence(perceive(ego.observations["front_rgb"]))
        brake_now(brake)
        take SetThrottleAction(0.0), SetBrakeAction(brake)


# The pedestrian walks TOWARDS a point on the far kerb, steered by position
# every step. With the stock CrossingBehavior (walk along the pedestrian's own
# heading) it walked away from the road in CARLA (smoke run 3, job 4779526,
# Notes 8.31): the heading is mirrored somewhere between Scenic and CARLA,
# while positions are right. Speed is matched to the car as CrossingBehavior
# does (it walks faster than min_speed to meet the car), so the two meet.
behavior CrossToKerb(target, reference_actor, min_speed, threshold):
    while (distance from self to reference_actor) > threshold:
        wait
    while (distance from self to target) > 0.5:
        rel = (self.position - reference_actor.position).rotatedBy(-reference_actor.heading)
        walk_speed = min_speed
        if rel.y > 0 and reference_actor.speed > 0.1:
            walk_speed = max(min_speed, abs(rel.x) * reference_actor.speed / rel.y)
        take SetWalkingDirectionAction(angle from self to target), SetWalkingSpeedAction(walk_speed)
    while True:
        take SetWalkingSpeedAction(0)

behavior PedestrianBehavior(min_speed=1, threshold=CROSSING_TRIGGER_M):
    do CrossToKerb(far_kerb, ego, min_speed, threshold)

# The pedestrian starts at a kerb and walks straight across the car's lane
# (heading +-90 deg); `spot` is the crossing point. Small jitter keeps
# repeats from being identical. (Local frame: x to the right, y forward.)
far_kerb = new Point at (-PEDESTRIAN_SIDE * (KERB_OFFSET_M + 1.0), 0, 0) relative to spot
pedestrian = new Pedestrian at (PEDESTRIAN_SIDE * (KERB_OFFSET_M + Range(-0.3, 0.3)), Range(-1, 1), 0) relative to spot,
    with heading (spot.heading + (-90 deg)),
    with regionContainedIn None,  # Allow the actor to spawn outside the driving lanes
    with behavior PedestrianBehavior(PEDESTRIAN_MIN_SPEED, CROSSING_TRIGGER_M),
    with blueprint PEDESTRIAN_MODEL

vending_machine = new VendingMachine right of vending_spot by 3,
    with heading 90 deg relative to vending_spot.heading,
    with regionContainedIn None  # Allow the actor to spawn outside the driving lanes

ego = new Car following lane.orientation from spot for -APPROACH_DISTANCE_M,
    with blueprint EGO_MODEL,
    with sensors {"front_rgb": RGBSensor(offset=(1.6, 0, 1.7), attributes=attrs)}, #(201 -> low) (x-> horizontal front back, y -> horizontal left right, z -> vertical up down)
    with behavior Exp_EgoBehaviour()

# RECORDING SETUP
record ego.observations["front_rgb"] as "front_rgb"
# Time series read back by MyMonitor (scripts/simulations/util.py) for the
# failure-analysis log.
record ego.speed as "ego_speed"
record (distance from ego to pedestrian) as "pedestrian_distance"
record pedestrian.speed as "pedestrian_speed"
# Did the car stay on the road? A run where it leaves is a test defect, not a pass.
record (ego.position in network.drivableRegion) as "on_road"
# To find out why a car leaves the road (smoke run 1, Notes 8.25/8.27): its
# heading, the lane's heading at the crossing point, and its distance from the
# lane centre, every step.
record ego.heading as "ego_heading"
record spot.heading as "lane_heading"
record (distance from ego to lane.centerline) as "lane_offset_m"
# Where the pedestrian is across the road (m from the lane centre; - left, + right
# in the car's direction): every run says whether it actually crossed.
record ((pedestrian.position - spot.position).rotatedBy(-spot.heading)).x as "ped_lateral_m"
require monitor RecordingMonitor(ego, path=localPath(f"/artifacts/runs/a9bd6134ab3c40d885039341d7f59f6c/frames"), recording_start=5, subsample=2)

# REQUIREMENTS
require (distance to intersection) > 30
require (distance from spot to intersection) > 30
require always (ego.laneSection._slowerLane is None)
require always (ego.laneSection._fasterLane is None)
# The car must start on the pedestrian's lane (round 1-2's no-encounter runs
# drove away from the pedestrian - Notes 8.19).
require ego.lane == lane
# ... and face the crossing point, i.e. drive with its lane, not against it.
require abs(relative heading of ego from spot) < 20 deg

# TERMINATION CONDITION: the car is 20 m past the crossing point (it started
# APPROACH_DISTANCE_M before it, so "distance to spot" alone would end Long runs at once).
# Otherwise the run ends at util.MAX_STEPS.
terminate when (ego.position - spot.position).rotatedBy(-spot.heading).y > 20