"""Failure model: turn a run's simulations.csv into failure *patterns*.

Pipeline stage 6 ("failure model" / diagnostics) in Notes.md Sec. 7. Pure
statistics over data that scripts/analysis/telemetry.py already persisted -
no simulator needed, runs on a laptop in well under a second.

Three questions are answered:

1. How often does the car fail overall, and per scenario?
2. Which scenario settings go with failure? (failure rate with the setting
   minus failure rate without it - the "effect" of each parameter value)
3. HOW did each simulation end? One of:
       passed               kept the safety margin after a real encounter
       passed_stalled       kept the margin, but only by braking to a standstill
                            and never moving again until the time limit (a
                            standoff with the crossing pedestrian). Counts as a
                            pass for the safety requirement; reported separately
                            because the soft goal (progress / smooth driving)
                            failed - a mitigation can shift the failure mode
       no_encounter         the car never came near the pedestrian (never within
                            NO_ENCOUNTER_M and never detected) - NOT a pass;
                            excluded from all rates and reported separately
       left_road            the car left the drivable area (scene v2 records
                            it) - a defect of the test, NOT a pass or a
                            failure; excluded from all rates like no_encounter
       never_detected       the model never reached the confidence bar
       detected_not_braked  detected, but no braking action was ever taken
       detected_too_late    first braked closer than the distance needed to stop
                            and keep the margin at that speed (v^2/2a + margin)
       brake_released       detected in time, but braking stopped before the
                            closest point and the car was still moving there
       braking_insufficient braked all the way to the closest point, still moving
       stopped_too_close    braked and stopped, but inside the safety margin

Plus a sanity check: if failures do not vary with ANY setting, the scoring
(the "oracle") or the fixed parts of the scenario are the first suspect, not
the settings the grammar varies - exactly what the old distance-to-vending-
machine check produced, and what run 35acc09e (2026-09-23) showed for real:
detection at ~6 m with a 26 km/h approach fails whatever the pedestrian looks like.
"""

import math
import os

import pandas as pd

PARAMS = ["pedestrian", "dress", "direction", "distance", "fog_density",
          "approach_distance_m", "pedestrian_min_speed_mps", "crossing_trigger_m"]
# Numeric settings with more than two values (the GE grammar scene_v2.bnf)
# are split low / high at the grammar's midpoint for the effects table, so
# each side has enough simulations. Two-valued settings (old.bnf fog 0/50)
# keep their values.
BANDS = {"fog_density": 50, "approach_distance_m": 25,
         "pedestrian_min_speed_mps": 2.0, "crossing_trigger_m": 20}


def _banded(df, param):
    """The column used for `param` in the effects table: its values, or
    '<= mid' / '> mid' when it is numeric with more than two values."""
    col = df[param]
    if param not in BANDS or col.dropna().nunique() <= 2:
        return col
    num = pd.to_numeric(col, errors="coerce")
    mid = BANDS[param]
    return num.map(lambda v: None if pd.isna(v) else (f"<= {mid:g}" if v <= mid else f"> {mid:g}"))

BOOL_COLUMNS = ["passed", "stopped", "resumed", "left_road"]
NUMERIC_COLUMNS = [
    "rho", "min_distance_m", "min_distance_step", "ego_speed_at_min_distance",
    "steps", "timestep_s", "duration_s", "ego_speed_max", "ego_speed_final",
    "frames_seen", "detection_frames", "max_confidence", "first_detection_step",
    "first_detection_conf", "first_detection_distance_m",
    "ego_speed_at_first_detection", "mean_inference_ms", "first_brake_step",
    "first_brake_distance_m", "ego_speed_at_first_brake", "brake_steps",
    "reaction_steps", "sim_index",
    # scene v2
    "approach_distance_m", "crossing_trigger_m", "pedestrian_min_speed_mps", "pedestrian_speed_mps", "crossing_start_distance_m",
    "peak_decel_mps2", "peak_jerk_mps3", "min_ttc_s", "first_stop_step",
    "resume_after_s", "resume_within_s", "left_road_step",
]

# Slower than this (m/s) when closest to the pedestrian counts as "stopped".
MOVING_SPEED = 0.5
# Effects smaller than this (fraction of simulations) are treated as noise.
MIN_EFFECT = 0.15
# Need at least this many simulations on each side of a comparison.
MIN_N = 10
# Never closer than this AND never detected = the two never met.
NO_ENCOUNTER_M = 10.0
# Full-brake deceleration assumed for the stopping-distance estimate (m/s^2).
# Dry-road hard braking for a passenger car; the CARLA Tesla is in this range.
DECEL_MPS2 = 8.0
# Fallback safety margin when it cannot be recovered from the row (min_distance - rho).
DEFAULT_MARGIN_M = 5.0

FAILURE_TYPES = ["never_detected", "detected_not_braked", "detected_too_late",
                 "brake_released", "braking_insufficient", "stopped_too_close"]
PASS_TYPES = ["passed", "passed_stalled"]
NOT_ENCOUNTERS = ["no_encounter", "left_road"]
OUTCOMES = PASS_TYPES + NOT_ENCOUNTERS + FAILURE_TYPES


def load_simulations(run_dir_or_csv, include_video_rerun=False):
    """Read simulations.csv with sane types. Drops the 'best_video' re-run
    (it is a recording pass, not a search sample) unless asked otherwise."""
    path = run_dir_or_csv
    if os.path.isdir(path):
        path = os.path.join(path, "simulations.csv")
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    # the scene-v2 smoke run (job 4354082) wrote the car start as ego_start_m
    if "ego_start_m" in df and "approach_distance_m" not in df:
        df = df.rename(columns={"ego_start_m": "approach_distance_m"})
    for col in BOOL_COLUMNS:
        if col in df:
            df[col] = df[col].map({"True": True, "False": False}).astype(object)
    for col in NUMERIC_COLUMNS:
        if col in df:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if not include_video_rerun and "scenario_id" in df:
        df = df[df["scenario_id"] != "best_video"]
    df = df.reset_index(drop=True)
    df["failed"] = ~df["passed"].eq(True)
    return df


def stopping_distance(speed_mps, margin_m=DEFAULT_MARGIN_M, decel=DECEL_MPS2):
    """Distance needed to brake from `speed_mps` to a stop AND still keep
    `margin_m` to the pedestrian: v^2 / (2a) + margin."""
    if speed_mps is None or pd.isna(speed_mps):
        return float("nan")
    return speed_mps ** 2 / (2 * decel) + margin_m


def _num(value):
    """Float or NaN - tolerates None, '' and text (raw CSV rows, not just loaded frames)."""
    try:
        if value is None or value == "":
            return float("nan")
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _margin(row):
    # rho = min_distance - margin, so the margin the run used is recoverable.
    d, rho = _num(row.get("min_distance_m")), _num(row.get("rho"))
    if pd.notna(d) and pd.notna(rho):
        return float(d - rho)
    return DEFAULT_MARGIN_M


def reacted(row):
    """Did the car respond to the pedestrian at all? Either the detector
    crossed the full-detection bar (detection_frames counts frames > 0.85) or
    the car braked (proportional braking acts from 0.30 confidence, so a car
    can slow and stop without ever logging a 'detection')."""
    detections = _num(row.get("detection_frames"))
    brakes = _num(row.get("brake_steps"))
    return (pd.notna(detections) and detections > 0) or (pd.notna(brakes) and brakes > 0)


def classify_failure(row):
    """Name how one simulation ended (see module docstring)."""
    if row.get("left_road") is True:
        return "left_road"
    min_d = _num(row.get("min_distance_m"))
    did_react = reacted(row)

    if row.get("passed") is True:
        if not did_react and pd.notna(min_d) and min_d > NO_ENCOUNTER_M:
            return "no_encounter"
        final_speed = _num(row.get("ego_speed_final"))
        timed_out = "time limit" in str(row.get("termination") or "")
        if timed_out and pd.notna(final_speed) and final_speed < MOVING_SPEED:
            return "passed_stalled"
        return "passed"
    if not did_react:
        return "never_detected"
    brakes = _num(row.get("brake_steps"))
    if pd.isna(brakes) or brakes == 0:
        return "detected_not_braked"

    first_brake_d = _num(row.get("first_brake_distance_m"))
    need = stopping_distance(_num(row.get("ego_speed_at_first_brake")), _margin(row))
    if pd.notna(first_brake_d) and pd.notna(need) and first_brake_d < need:
        return "detected_too_late"

    speed = _num(row.get("ego_speed_at_min_distance"))
    still_moving = pd.isna(speed) or speed > MOVING_SPEED
    if still_moving:
        first_step, min_step = _num(row.get("first_brake_step")), _num(row.get("min_distance_step"))
        if pd.notna(first_step) and pd.notna(min_step) and brakes < (min_step - first_step):
            return "brake_released"
        return "braking_insufficient"
    return "stopped_too_close"


def add_failure_types(df):
    df = df.copy()
    df["failure_type"] = df.apply(classify_failure, axis=1)
    df["encounter"] = ~df["failure_type"].isin(NOT_ENCOUNTERS)
    df["reacted"] = df.apply(reacted, axis=1)
    return df


def _rate(sub):
    return float(sub["failed"].mean()) if len(sub) else float("nan")


def _scenario_rate(sub):
    """Failure rate with every distinct scenario counted once (the mean of
    each scenario's own rate) - GE revisits scenarios it likes, so per
    simulation one scenario can dominate."""
    if not len(sub):
        return float("nan")
    key = "phenotype" if "phenotype" in sub else "scenario_id"
    return float(sub.groupby(key)["failed"].mean().mean())


def failure_rate_by_parameter(df):
    """For every parameter value: n, failures, failure rate, and the effect
    (rate with this value minus rate for the other values), per simulation
    and with every scenario counted once. Encounters only."""
    rows = []
    for param in PARAMS:
        if param not in df or df[param].replace("", None).dropna().empty:
            continue
        col = _banded(df, param).replace("", None)
        for value in sorted(col.dropna().unique(), key=str):
            with_v = df[col == value]
            without = df[(col != value) & col.notna()]
            rate_with, rate_without = _rate(with_v), _rate(without)
            rows.append({
                "param": param, "value": value,
                "n": int(len(with_v)), "failures": int(with_v["failed"].sum()),
                "failure_rate": rate_with,
                "failure_rate_others": rate_without,
                "effect": rate_with - rate_without if len(without) else float("nan"),
                "enough_data": len(with_v) >= MIN_N and len(without) >= MIN_N,
                "n_distinct_scenarios": int(with_v["phenotype"].nunique()) if "phenotype" in with_v else None,
                "scenario_effect": (_scenario_rate(with_v) - _scenario_rate(without))
                                   if len(without) else float("nan"),
            })
    return pd.DataFrame(rows)


def failure_rate_by_scenario(df_all):
    """One row per scenario: encounters, failures, rate, and how each ended.
    Takes the full frame (incl. no-encounter rows) so those can be counted."""
    if "failure_type" not in df_all:
        df_all = add_failure_types(df_all)
    # settings a run does not have (e.g. the numeric scene-v2 ones in older
    # runs) are left out, and empty values are kept (dropna=False)
    keys = ["scenario_id", "phenotype"] + [p for p in PARAMS if p in df_all
                                           and df_all[p].replace("", None).notna().any()]
    rows = []
    for key_values, sub in df_all.groupby(keys, sort=False, dropna=False):
        enc = sub[sub["encounter"]]
        row = dict(zip(keys, key_values))
        row.update(n=int(len(sub)), encounters=int(len(enc)), failures=int(enc["failed"].sum()),
                   failure_rate=_rate(enc),
                   min_distance_m=float(enc["min_distance_m"].min())
                   if enc["min_distance_m"].notna().any() else float("nan"))
        for outcome in OUTCOMES:
            row[outcome] = int((sub["failure_type"] == outcome).sum())
        rows.append(row)
    out = pd.DataFrame(rows)
    if len(out):
        out = out.sort_values(["failure_rate", "min_distance_m"],
                              ascending=[False, True], na_position="last").reset_index(drop=True)
    return out


def failure_type_counts(df):
    if "failure_type" not in df:
        df = add_failure_types(df)
    failed = df[df["failed"]]
    return {ftype: int((failed["failure_type"] == ftype).sum()) for ftype in FAILURE_TYPES}


def timing_summary(df):
    """Medians that explain *why* the car failed, over encounters in which the
    car reacted (detected above the bar, or braked at all)."""
    if "reacted" not in df:
        df = add_failure_types(df)
    det = df[(df["encounter"]) & (df["reacted"])] if len(df) else df
    if not len(det):
        return {}
    need = det.apply(lambda r: stopping_distance(r.get("ego_speed_at_first_brake"), _margin(r)), axis=1)
    late = (det["first_brake_distance_m"] < need)
    return {
        "n_detected": int(len(det)),
        "first_detection_distance_m_median": float(det["first_detection_distance_m"].median()),
        "first_brake_distance_m_median": float(det["first_brake_distance_m"].median()),
        "speed_at_first_brake_mps_median": float(det["ego_speed_at_first_brake"].median()),
        "stopping_distance_needed_m_median": float(need.median()),
        "share_detected_too_late": float(late.mean()),
        "brake_steps_median": float(det["brake_steps"].median()),
        "share_still_moving_at_closest": float((det["ego_speed_at_min_distance"] > MOVING_SPEED).mean()),
        "mean_inference_ms_median": float(det["mean_inference_ms"].median()),
    }


def sanity_warnings(df, by_param, n_no_encounter=0, n_stalled=0, n_left_road=0):
    """Plain-language warnings about the data itself (not about the car)."""
    warnings = []
    if n_left_road:
        warnings.append(
            f"{n_left_road} simulation(s) ended with the car OFF THE ROAD. That is a defect of "
            "the test scene (placement / lane direction), not a result about the car: they are "
            "excluded from every rate. Fix the scene before reading anything else in this report.")
    n = len(df)
    if n_stalled:
        n_pass = int((~df["failed"]).sum()) if n else 0
        warnings.append(
            f"{n_stalled} of {n_pass} passes were 'stalled': the car braked to a standstill and "
            "never moved again before the time limit. The safety rule held, but the car did not "
            "get past the crossing - a standoff (in scene v1 the pedestrian also waited for the "
            "car to come within 8 m). Read the pass rate with this in mind; it is the paper's "
            "'mitigation shifts the failure mode' effect.")
    if n_no_encounter:
        warnings.append(
            f"{n_no_encounter} simulation(s) were 'no encounter': the car never came within "
            f"{NO_ENCOUNTER_M:.0f} m of the pedestrian and never saw it. They are NOT counted as "
            "passes. If this is common, the scenario geometry (random lane / heading) is "
            "sending the car away from the pedestrian - fix the template, do not celebrate the passes.")
    if n == 0:
        return warnings + ["No simulations with a real encounter to analyse."]
    overall = _rate(df)
    if overall == 1.0:
        warnings.append(
            "Every encounter failed. Before blaming the car, check the scoring: "
            "a check that always trips (like the old distance-to-any-object rule) "
            "looks exactly like this.")
    elif overall == 0.0:
        warnings.append(
            "No encounter failed. Either the car handles all scenarios, or "
            "the safety margin / detection threshold is too lenient to expose anything.")
    usable = by_param[by_param["enough_data"]] if len(by_param) else by_param
    if 0 < overall < 1 and len(usable) and usable["effect"].abs().max() < MIN_EFFECT:
        warnings.append(
            f"Failures ({overall:.0%} overall) do not vary with any scenario setting "
            f"(largest effect {usable['effect'].abs().max():.0%} < {MIN_EFFECT:.0%}). "
            "That pattern points at the scoring or the fixed parts of the scenario "
            "(approach speed, confidence bar, braking logic), not at the settings the grammar varies.")
    if n < 32 * 3:
        warnings.append(
            f"Only {n} encounters - treat rates as rough. 5 trials per scenario "
            "gives 160 simulations in total; fewer means the job stopped early or many were no-encounter.")
    return warnings


def build_failure_model(df):
    """Everything above in one dict (JSON-serialisable). Rates use encounters only."""
    df = add_failure_types(df)
    enc = df[df["encounter"]]
    by_param = failure_rate_by_parameter(enc)
    by_scenario = failure_rate_by_scenario(df)
    n_no_enc = int((df["failure_type"] == "no_encounter").sum())
    n_left_road = int((df["failure_type"] == "left_road").sum())
    n_stalled = int((df["failure_type"] == "passed_stalled").sum())
    return {
        "n_simulations": int(len(df)),
        "n_no_encounter": n_no_enc,
        "n_left_road": n_left_road,
        "n_encounters": int(len(enc)),
        "n_scenarios": int(df["scenario_id"].nunique()) if len(df) else 0,
        "failures": int(enc["failed"].sum()),
        "failure_rate": _rate(enc),
        "failure_rate_scenarios": _scenario_rate(enc),
        "n_distinct_scenarios": int(df["phenotype"].nunique()) if "phenotype" in df and len(df) else 0,
        "max_repeats_of_a_scenario": int(df["phenotype"].value_counts().max()) if "phenotype" in df and len(df) else 0,
        "passes": int((~enc["failed"]).sum()),
        "passed_clean": int((df["failure_type"] == "passed").sum()),
        "passed_stalled": n_stalled,
        "failure_types": failure_type_counts(enc),
        "timing": timing_summary(enc),
        "by_parameter": by_param.to_dict(orient="records"),
        "by_scenario": by_scenario.to_dict(orient="records"),
        "warnings": sanity_warnings(enc, by_param, n_no_enc, n_stalled, n_left_road),
    }
