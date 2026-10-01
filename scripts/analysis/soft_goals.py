"""Soft goals (the requirement's `ensuring "..."` clause), checked per simulation.

A soft goal is a quality the car should have on top of the safety goal - the
paper's SmoothBraking, or "moves on again once the crossing is clear". Unlike
a domain assumption it IS about the car, so car quantities are exactly what
it may name. Machine-readable items (`<quantity> <op> <value>`) are checked
against the scene-v2 measures in simulations.csv (telemetry.motion_metrics);
anything else is free text for the human. Checked over real encounters only.

    ensuring "resume_within_s <= 10" & "braking is smooth unless an emergency stop is needed"
"""

import math

from scripts.analysis.admissibility import ASSUMPTION_RE, _coerce

# quantity -> what it means (all from telemetry.motion_metrics)
QUANTITIES = {
    "resume_within_s": "seconds from stopping to moving on again (0 = never stopped, inf = never moved on)",
    "peak_decel_mps2": "largest deceleration (m/s^2)",
    "peak_jerk_mps3": "largest change of acceleration (m/s^3) - smoothness",
    "min_ttc_s": "smallest time-to-collision while closing in (s)",
}


def parse_soft_goal(text):
    """{text, kind, quantity, op, value, message}; kind = checked / free_text / rejected."""
    text = str(text).strip()
    item = {"text": text, "kind": "free_text", "quantity": None, "op": None,
            "value": None, "message": ""}
    m = ASSUMPTION_RE.match(text)
    if not m:
        return item
    quantity, op, value = m.groups()
    item.update(quantity=quantity, op=op, value=value)
    if quantity in QUANTITIES:
        item["kind"] = "checked"
    else:
        item.update(kind="rejected",
                    message=f"unknown quantity '{quantity}'. Known: {', '.join(QUANTITIES)}.")
    return item


def goal_status(item, value):
    """'met' / 'missed' / 'not_measured' for one checked goal and one value."""
    if value is None or value == "":
        return "not_measured"
    try:
        if math.isnan(float(value)):
            return "not_measured"
    except (TypeError, ValueError):
        return "not_measured"
    a, b = _coerce(value, item["value"])
    ok = {"==": a == b, "!=": a != b, "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b}[item["op"]]
    return "met" if ok else "missed"


def check_soft_goals(df, goals):
    """Per goal, over real encounters (df after failure_model.add_failure_types):
    {text, kind, quantity, message, met, missed, not_measured}."""
    enc = df[df["encounter"]] if "encounter" in df else df
    summary = []
    for text in goals or []:
        item = parse_soft_goal(text)
        entry = {k: item[k] for k in ("text", "kind", "quantity", "message")}
        entry.update(met=0, missed=0, not_measured=0)
        if item["kind"] == "checked":
            for _, row in enc.iterrows():
                entry[goal_status(item, row.get(item["quantity"]))] += 1
        summary.append(entry)
    return summary
