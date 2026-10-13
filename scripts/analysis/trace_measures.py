"""Measures recomputed from the per-step traces, robust to simulator glitches,
and the choice of safety rule.

Two problems seen in real runs motivate this module:

1. **Short spikes.** The simulator occasionally reports a pedestrian speed
   of 6-13 m/s for one or two steps (then ~0 again), and the car's speed series
   has similar jumps. Taking the maximum of the raw series turns one glitch
   into an "assumption broken" or an implausible peak deceleration. Here every
   speed series is smoothed with a short median filter before peaks are taken;
   the raw values are kept in `*_raw` columns.

2. **Where the safety margin applies.** The monitor's rule is "stay more than
   SAFETY_MARGIN_M from the pedestrian", wherever the pedestrian is. A car that
   drives on past a pedestrian who has finished crossing and stands on the far
   pavement then "fails", while a car that never moves again "passes". The
   `path` rule applies the margin only while the pedestrian is in, or about to
   enter, the car's path (|lateral position| <= PATH_HALF_WIDTH_M from the lane
   centre). Which rule the requirement means is a requirement decision ([R]);
   reports state the rule they used, and the default stays `anywhere`.

Everything here reads `traces/<scenario>_<sim>.json` and only adds columns to
the simulations frame; runs without the needed series are left unchanged.
"""

import json
import os

import pandas as pd

from scripts.analysis import telemetry

SAFETY_MARGIN_M = 5.0
# Lane half-width (~1.75 m) plus ~0.75 m: a pedestrian closer than this to the
# lane centre is in, or stepping into, the car's path.
PATH_HALF_WIDTH_M = 2.5
MEDIAN_WINDOW = 5   # 0.5 s: removes spikes of up to two steps; real speeds last longer
SAFETY_RULES = ("anywhere", "path")
# Decided 2026-10-08 (review of run 2b): the safety goal is violated only when
# the car comes within SAFETY_MARGIN_M of a pedestrian who is in its lane.
# "anywhere" (the simulator monitor's own verdict, which also counted a car
# passing a pedestrian already on the far kerb) remains available for
# comparison, written to its own folder.
DEFAULT_SAFETY_RULE = "path"


def median_filter(xs, window=MEDIAN_WINDOW):
    """Centred running median; removes spikes shorter than half the window."""
    xs = [float(x) for x in xs]
    if window <= 1 or len(xs) < window:
        return xs
    half = window // 2
    out = []
    for i in range(len(xs)):
        lo, hi = max(0, i - half), min(len(xs), i + half + 1)
        chunk = sorted(xs[lo:hi])
        out.append(chunk[len(chunk) // 2])
    return out


def safe_values(distances, ped_laterals=None, rule=DEFAULT_SAFETY_RULE,
                margin=SAFETY_MARGIN_M, half_width=PATH_HALF_WIDTH_M):
    """Per-step robustness of the safety goal, the signal the simulator's
    monitor evaluates as `G safe` (rho = its minimum). `anywhere`: distance -
    margin at every step. `path`: distance - margin while the pedestrian is
    within `half_width` of the lane centre, the plain distance (always > 0)
    otherwise - so rho > 0 exactly when path_min_distance > margin, the same
    verdict apply_safety_rule computes in analysis. Without a lateral series
    the `path` rule falls back to `anywhere`."""
    distances = [float(d) for d in distances]
    laterals = list(ped_laterals or [])
    if rule == "anywhere" or not laterals:
        return [d - margin for d in distances]
    if rule != "path":
        raise ValueError(f"unknown safety rule {rule!r} (expected one of {SAFETY_RULES})")
    out = []
    for i, d in enumerate(distances):
        x = laterals[min(i, len(laterals) - 1)]
        out.append(d - margin if abs(float(x)) <= half_width else d)
    return out


def path_min_distance(distances, ped_laterals, half_width=PATH_HALF_WIDTH_M):
    """Closest car-pedestrian distance over the steps in which the pedestrian
    is within `half_width` of the lane centre; None if it never is."""
    pairs = [(d, abs(x)) for d, x in zip(distances or [], ped_laterals or [])]
    in_path = [d for d, x in pairs if x <= half_width]
    return min(in_path) if in_path else None


def measures(trace, timestep):
    """Robust measures for one simulation trace (a dict as written by telemetry)."""
    speeds = trace.get("ego_speed") or []
    ped = trace.get("pedestrian_speed") or []
    on_road = trace.get("on_road") or None
    out = {"pedestrian_speed_mps": None, "peak_decel_mps2": None, "peak_jerk_mps3": None,
           "path_min_distance_m": path_min_distance(trace.get("distance_m"), trace.get("ped_lateral_m"))}
    if ped:
        out["pedestrian_speed_mps"] = max(median_filter(ped))
    if speeds and timestep:
        m = telemetry.motion_metrics(trace.get("distance_m") or [], median_filter(speeds),
                                     [], timestep, on_road)
        out["peak_decel_mps2"], out["peak_jerk_mps3"] = m["peak_decel_mps2"], m["peak_jerk_mps3"]
    return out


def _load_trace(run_dir, scenario_id, sim_index):
    path = os.path.join(run_dir, "traces", f"{scenario_id}_{sim_index}.json")
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def add_trace_measures(df, run_dir):
    """Replace pedestrian top speed and peak deceleration / jerk with their
    glitch-robust versions (raw values kept as `<name>_raw`) and add
    `path_min_distance_m`. Rows without a usable trace keep their values."""
    df = df.copy()
    for col in ("pedestrian_speed_mps", "peak_decel_mps2", "peak_jerk_mps3"):
        if col in df:
            df[f"{col}_raw"] = df[col]
    df["path_min_distance_m"] = float("nan")
    for i, row in df.iterrows():
        trace = _load_trace(run_dir, row.get("scenario_id"), row.get("sim_index"))
        if not trace:
            continue
        timestep = row.get("timestep_s")
        timestep = float(timestep) if pd.notna(timestep) and timestep not in ("", None) else None
        m = measures(trace, timestep)
        for col in ("pedestrian_speed_mps", "peak_decel_mps2", "peak_jerk_mps3"):
            if m[col] is not None:
                df.at[i, col] = m[col]
        if m["path_min_distance_m"] is not None:
            df.at[i, "path_min_distance_m"] = m["path_min_distance_m"]
    return df


def apply_safety_rule(df, rule=DEFAULT_SAFETY_RULE, margin=SAFETY_MARGIN_M):
    """Set `passed` / `failed` by the chosen safety rule. `anywhere` keeps the
    monitor's verdict. `path` passes a simulation when the car stayed more than
    `margin` from the pedestrian while the pedestrian was in its path (or the
    pedestrian never entered it); rows without the lateral series keep the
    monitor's verdict. The monitor's verdict is kept as `passed_anywhere`."""
    if rule not in SAFETY_RULES:
        raise ValueError(f"unknown safety rule {rule!r} (expected one of {SAFETY_RULES})")
    df = df.copy()
    # The margin-anywhere verdict: from `rho_anywhere` where the monitor
    # recorded it (its own verdict, `passed`, then follows the path rule);
    # for older runs the monitor's verdict *is* the anywhere rule.
    if "rho_anywhere" in df:
        ra = pd.to_numeric(df["rho_anywhere"], errors="coerce")
        df["passed_anywhere"] = df["passed"].where(ra.isna(), (ra > 0).astype(object))
    else:
        df["passed_anywhere"] = df["passed"]
    df["safety_rule"] = rule
    if rule == "anywhere":
        df["passed"] = df["passed_anywhere"]
    if rule == "path" and "path_min_distance_m" in df:
        has_lateral = df["path_min_distance_m"].notna() | df.get("crossed", pd.Series(index=df.index, dtype=object)).notna()
        path_pass = df["path_min_distance_m"].isna() | (df["path_min_distance_m"] > margin)
        df.loc[has_lateral, "passed"] = path_pass[has_lateral].astype(object)
    df["failed"] = ~df["passed"].eq(True)
    return df
