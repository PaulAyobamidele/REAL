"""Obstacle model: name the failure patterns in KAOS terms and tie them back
to the requirement.

An obstacle (KAOS) is a condition under which a goal cannot be satisfied.
The REAL paper's automated-braking example (Fig. 4, Sec. V-B) names three:

    PedestrianSizeTooSmall        child pedestrians   -> blocks Always[DetectPedestrian]
    PedestrianClothingNotVisible  low-contrast dress  -> blocks Always[DetectPedestrian]
    AdverseWeather                fog                 -> breaks domain property PedestrianVisible

This module checks each one against the failure model's evidence (does the
setting actually raise the failure rate, and are those failures detection
failures?) and also proposes *unnamed* candidate obstacles for any other
setting with a strong effect, so the catalogue is a starting point, not a
ceiling. The human confirms, renames or rejects (Notes.md Sec. 7.2 step 6).

Each obstacle also carries the paper's candidate mitigations per layer
(data / model / system / requirement - Sec. IV-C, M1-M5). These are text
suggestions for the human, not actions the tool takes.
"""

# The requirement sub-goal every detection obstacle blocks, as written in the
# KAOS DSL (scripts/redsl/grammar.py: "Detect Pedestrian" performed by <module>).
DETECTION_GOAL = "Detect Pedestrian"

OBSTACLE_CATALOGUE = [
    {
        "id": "PedestrianSizeTooSmall",
        "param": "pedestrian", "value": "Child",
        "blocks_goal": DETECTION_GOAL,
        "domain_property": "PedestrianVisible",
        "description": "A child has a small apparent size in the camera frame, so the "
                       "detector rarely reaches the confidence needed to brake.",
        "mitigations": {
            "data": "Fine-tune the detector on child-pedestrian images (paper M2: "
                    "collision rate 100% -> 0% in nominal weather).",
            "model": "Use a larger detector (YOLOv5m) - more accurate but slower; the paper "
                     "(M1) saw latency-induced late braking at short distance.",
            "system": "Proportional braking from 30% confidence, full braking above 85% "
                      "(paper M4: child collisions 100% -> 8%).",
            "requirement": "State a minimum detectable pedestrian size / distance in the "
                           "requirement's domain assumptions.",
        },
    },
    {
        "id": "PedestrianClothingNotVisible",
        "param": "dress", "value": "Dark",
        "blocks_goal": DETECTION_GOAL,
        "domain_property": "PedestrianVisible",
        "description": "Low-contrast clothing against the background lowers detection "
                       "confidence (paper: 'visual saliency' obstacle class).",
        "mitigations": {
            "data": "Add low-contrast / cluttered-background pedestrian samples.",
            "model": "Lower the confidence threshold only when other cues agree (risk: "
                     "more unnecessary braking).",
            "system": "Confidence-aware cautious braking (paper M4).",
            "requirement": "Make the contrast/visibility assumption explicit in the ODD.",
        },
    },
    {
        "id": "AdverseWeather",
        "param": "fog_density", "value": "50",
        "blocks_goal": DETECTION_GOAL,
        "domain_property": "PedestrianVisible",
        "description": "Fog degrades detection confidence and adds inference latency "
                       "(paper E4). 50% fog is still a realistic deployment condition.",
        "mitigations": {
            "data": "Fine-tune with foggy scenes (paper M2: braking success in fog 0% -> 100%).",
            "model": "Weather-conditioned confidence threshold.",
            "system": "Redundant sensing (radar/lidar) or speed reduction in low visibility.",
            "requirement": "Either add 'fog density <= N' to the ODD (scoping) or keep the "
                           "requirement and demand the data/system fix.",
        },
    },
    # --- behaviour-based obstacles: keyed on HOW the car failed, not on a
    # grammar setting. Found for real in run 35acc09e (2026-09-23): the
    # pedestrian was seen in 73% of runs, but only at ~6 m while doing 26 km/h.
    {
        "id": "DetectionTooLate",
        "failure_type": "detected_too_late",
        "blocks_goal": DETECTION_GOAL,
        "domain_property": "PedestrianVisible",
        "description": "The detector only reaches the confidence bar when the pedestrian is "
                       "already closer than the distance needed to stop at the approach speed. "
                       "The pedestrian is visible for seconds before that; the bar (85%) is "
                       "reached too late for the braking distance.",
        "mitigations": {
            "data": "Fine-tune on distant / small pedestrian instances so confidence rises earlier.",
            "model": "A more sensitive detector, or a lower confidence bar with a second cue "
                     "(risk: unnecessary braking).",
            "system": "Proportional braking from 30% confidence, full braking above 85% "
                      "(paper M4) - the car starts slowing while the detector is still unsure.",
            "requirement": "State the approach-speed / minimum detection-distance assumption in the ODD "
                           "(e.g. assuming \"ego_speed <= 5\"), or specify a time-to-brake bound.",
            "scenario": "The approach speed (EGO_SPEED = 7.5 m/s) and spawn distance are fixed "
                        "constants of scratch.temp, not grammar parameters - the grid cannot "
                        "vary them. Consider making speed a scenario parameter.",
        },
    },
    {
        "id": "BrakingNotLatched",
        "failure_type": "brake_released",
        "blocks_goal": "Apply Brakes",
        "domain_property": None,
        "description": "Braking is applied only while the pedestrian is currently detected. "
                       "When the pedestrian leaves the camera frame (very close, or passing) "
                       "the car releases the brake and speeds up again before the closest point.",
        "mitigations": {
            "data": None,
            "model": None,
            "system": "Latch the brake once triggered until the car has stopped or the pedestrian "
                      "is confirmed clear; add a short detection memory (tracking).",
            "requirement": "Specify braking as a state (\"once a pedestrian is detected, keep "
                           "braking until stopped\"), not as a per-frame reaction.",
        },
    },
    # --- soft-goal obstacle: keyed on a PASS outcome. Seen in round 2
    # (proportional braking, 2026-09-23): the car braked to a standstill 9-14 m
    # from the pedestrian and never moved again; the pedestrian's
    # CrossingBehavior waits for the car to come within 8 m - a standoff.
    {
        "id": "StandoffUnnecessaryStop",
        "outcome": "passed_stalled",
        "blocks_goal": "Smooth Braking / Progress",
        "domain_property": "PedestrianCrossesWhenSafe",
        "description": "The safety goal holds, but the car stops well short of the crossing "
                       "and never resumes: the pedestrian waits for the car, the car waits for "
                       "the pedestrian. The paper's soft goal (SmoothBraking / making progress) "
                       "fails where the safety goal now succeeds - the mitigation shifted the "
                       "failure mode.",
        "mitigations": {
            "data": None,
            "model": "Raise the caution threshold only when the pedestrian is stationary and "
                     "off the road (needs a track, not a per-frame confidence).",
            "system": "Time-box the cautious stop: creep forward / resume when the pedestrian "
                      "has not moved toward the road for N seconds; distinguish 'pedestrian at "
                      "kerb' from 'pedestrian crossing'.",
            "requirement": "Add the soft goal explicitly (e.g. 'resume within N s once the path "
                           "is clear') and state the domain assumption that pedestrians cross "
                           "only when the vehicle is within/beyond a given distance.",
            "scenario": "Fix the test: let the pedestrian cross on its own schedule (time- or "
                        "distance-to-crossing-based), not only once the car is within 8 m "
                        "(CrossingBehavior threshold in scratch.temp) - otherwise a cautious car "
                        "can never be measured getting past.",
        },
    },
]

# Candidate *scenario artefacts*: things wrong with the test itself rather than
# with the system or the requirement. The paper's four mitigation layers have
# no slot for these, so the review asks for a separate verdict on each
# (out_of_scope / in_scope / scenario_defect). `metric` names the
# failure-model number that is the evidence.
SCENARIO_ARTEFACTS = [
    {
        "id": "crossing_trigger_8m",
        "metric": "passed_stalled",
        "description": "The pedestrian's CrossingBehavior only steps out once the car is within "
                       "THRESHOLD = 8 m (scratch.temp). A car that stops cautiously before that "
                       "never gets to see the crossing happen: a standoff that is a property of "
                       "the test, not of the system - it makes StandoffUnnecessaryStop partly "
                       "unmeasurable.",
        "fix": "scratch.temp: trigger the crossing on a timer or on the pedestrian's own distance "
               "to the crossing point, not on proximity to the ego.",
    },
    {
        "id": "no_encounter_geometry",
        "metric": "n_no_encounter",
        "description": "Uniform lane choice + heading can place the ego driving away from the "
                       "pedestrian, so the two never meet. These runs are excluded from the "
                       "rates, but they waste ~25% of the simulation budget.",
        "fix": "scratch.temp: choose the lane/spot so the ego approaches the crossing point; "
               "or reject such samples with a Scenic `require`.",
    },
    {
        "id": "distance_parameter_dead",
        "metric": "n_scenarios",
        "description": "The grammar's `distance` (Short/Long) does not move the pedestrian in "
                       "scratch.temp (position is a fixed random range; the angle depends only on "
                       "direction). Its measured effect should be ~0 and any effect is noise.",
        "fix": "scratch.temp: place the pedestrian from `distance` (as scenic_template.py's "
               "get_pedestrian_pos did), or drop the parameter from old.bnf.",
    },
]

# A behaviour-based obstacle is supported when at least this share of the
# encounter failures (or, for a pass-outcome obstacle, of the passes) ended that way.
MIN_SHARE = 0.25

# Plain-language names for the other grammar settings, for candidate obstacles.
PARAM_LABELS = {
    "direction": {"LR": "crossing left-to-right", "RL": "crossing right-to-left"},
    "distance": {"Short": "short distance (little time to react)",
                 "Long": "long distance"},
    "pedestrian": {"Adult": "adult pedestrian", "Child": "child pedestrian"},
    "dress": {"Light": "light clothing", "Dark": "dark clothing"},
    "fog_density": {"0": "clear weather", "50": "50% fog"},
}

MIN_EFFECT = 0.15   # same bar as failure_model.MIN_EFFECT
MIN_N_FAILURES = 10  # fewer failures than this: no verdict on behaviour-based obstacles


def _effect_row(by_parameter, param, value):
    for row in by_parameter:
        if row["param"] == param and str(row["value"]) == str(value):
            return row
    return None


def _detection_share(df, param, value):
    """Fraction of this slice's failures that were perception failures
    (never detected, or detected too late to stop)."""
    sub = df[(df[param].astype(str) == str(value)) & df["failed"]]
    if not len(sub):
        return None
    return float(sub["failure_type"].isin(["never_detected", "detected_too_late"]).mean())


def verdict_label(verdict, sampling=None):
    """How a tool verdict is shown. On GE data (scenarios bred towards
    failure, not sampled evenly) a 'supported' obstacle is a lead to confirm
    on balanced repeats (scripts/analysis/grid_check.py), not a finding."""
    label = {"supported": "SUPPORTED", "not_supported": "not supported",
             "insufficient_data": "insufficient data"}.get(verdict, str(verdict))
    if sampling == "ge" and verdict == "supported":
        label = "SUPPORTED (GE lead - confirm on grid)"
    return label


def assess_obstacles(df, failure_model, catalogue=None, min_effect=MIN_EFFECT):
    """Return a list of obstacle assessments: catalogue entries with a verdict
    ('supported' | 'not_supported' | 'insufficient_data'), then unnamed
    candidates for any other strong effect."""
    catalogue = catalogue or OBSTACLE_CATALOGUE
    by_param = failure_model["by_parameter"]
    results = []
    covered = set()

    n_failures = int(failure_model.get("failures", 0))
    type_counts = failure_model.get("failure_types", {})

    for entry in catalogue:
        result = dict(entry)
        result["source"] = "catalogue"

        if entry.get("outcome"):
            # pass-outcome based (soft goal): share of the passes that ended this way
            n_pass = int(failure_model.get("passes", 0))
            count = int(failure_model.get(entry["outcome"], 0))
            share = count / n_pass if n_pass else None
            evidence = {"outcome": entry["outcome"], "count": count, "passes": n_pass, "share": share}
            if n_pass < MIN_N_FAILURES:
                verdict = "insufficient_data"
            else:
                verdict = "supported" if share >= MIN_SHARE else "not_supported"
            result.update(verdict=verdict, evidence=evidence, detection_failure_share=None)
            results.append(result)
            continue

        if entry.get("failure_type"):
            # behaviour-based: how large a share of the failures ended this way?
            count = int(type_counts.get(entry["failure_type"], 0))
            share = count / n_failures if n_failures else None
            evidence = {"failure_type": entry["failure_type"], "count": count,
                        "failures": n_failures, "share": share}
            if n_failures < MIN_N_FAILURES:
                verdict = "insufficient_data"
            else:
                verdict = "supported" if share >= MIN_SHARE else "not_supported"
            result.update(verdict=verdict, evidence=evidence, detection_failure_share=None)
            results.append(result)
            continue

        row = _effect_row(by_param, entry["param"], entry["value"])
        covered.add((entry["param"], str(entry["value"])))
        if row is None or not row.get("enough_data"):
            result.update(verdict="insufficient_data", evidence=row)
        else:
            supported = row["effect"] >= min_effect
            result.update(verdict="supported" if supported else "not_supported", evidence=row)
        result["detection_failure_share"] = (
            _detection_share(df, entry["param"], entry["value"]) if len(df) else None)
        results.append(result)

    # Anything else with a strong effect becomes an unnamed candidate.
    for row in by_param:
        key = (row["param"], str(row["value"]))
        if key in covered or not row.get("enough_data"):
            continue
        if row["effect"] >= min_effect:
            label = PARAM_LABELS.get(row["param"], {}).get(str(row["value"]), f"{key[0]}={key[1]}")
            results.append({
                "id": f"Candidate({row['param']}={row['value']})",
                "param": row["param"], "value": row["value"],
                "blocks_goal": DETECTION_GOAL if row["param"] in ("pedestrian", "dress", "fog_density")
                               else "Pedestrian Safety",
                "domain_property": None,
                "description": f"Failures are {row['effect']:.0%} more frequent with {label}. "
                               "Not in the obstacle catalogue - needs a human to name or reject it.",
                "mitigations": {},
                "source": "candidate",
                "verdict": "supported",
                "evidence": row,
                "detection_failure_share": _detection_share(df, row["param"], row["value"]),
            })
    return results


def requirement_context(requirement_text, goal=DETECTION_GOAL):
    """Which module the requirement says performs `goal` (default 'Detect
    Pedestrian'), all its operations, and the scenario clause - if it parses."""
    if not requirement_text:
        return {}
    try:
        from scripts.redsl.grammar import DSL
        dsl = DSL(requirement_text)
        if dsl.parse_tree is None:
            return {"parsed": False}
        return {"parsed": True,
                "detection_module": dsl.get_module_for(goal),
                "operations": dsl.get_operations(),
                "assumptions": dsl.get_assumptions(),
                "soft_goals": dsl.get_soft_goals(),
                "scenario_text": dsl.get_scenario()}
    except Exception as e:  # analysis must never die on the requirement text
        return {"parsed": False, "error": str(e)}
