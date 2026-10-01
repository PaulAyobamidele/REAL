"""Admissibility rules: which scenarios are inside the operational design
domain (ODD) at all.

We separate *valid* failures - the car failed in a
scenario it is supposed to handle - from *spurious* ones, where the scenario
itself is outside the intended ODD (its example: extreme fog). Spurious
failures are not thrown away: they are evidence that the ODD was never
written down, and the report lists them separately for the human to act on
(state the limit explicitly, or decide the scenario IS in scope and drop the
rule).

Rules live in a small JSON file the human edits (default:
admissibility_rules.json next to this module). A scenario matching ANY rule
is out of scope. Rule shape:

    {"name": "extreme_fog", "param": "fog_density", "op": ">", "value": 80,
     "reason": "visibility below what the ODD is meant to cover"}

Supported ops: ==, !=, <, <=, >, >=, in, not in. Values are compared as
numbers when both sides parse as numbers, otherwise as strings.
"""

import json
import math
import os
import re

DEFAULT_RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "admissibility_rules.json")


def load_rules(path=None):
    path = path or DEFAULT_RULES_PATH
    with open(path) as f:
        data = json.load(f)
    rules = data.get("rules", [])
    for rule in rules:
        for key in ("name", "param", "op", "value"):
            if key not in rule:
                raise ValueError(f"admissibility rule missing '{key}': {rule}")
    return rules


def _coerce(a, b):
    try:
        return float(a), float(b)
    except (TypeError, ValueError):
        return str(a), str(b)


def rule_matches(rule, params):
    """True if the scenario `params` falls under `rule` (i.e. is OUT of scope)."""
    if rule["param"] not in params or params[rule["param"]] in (None, ""):
        return False
    actual = params[rule["param"]]
    op = rule["op"]
    if op in ("in", "not in"):
        options = [str(v) for v in rule["value"]]
        hit = str(actual) in options
        return hit if op == "in" else not hit
    a, b = _coerce(actual, rule["value"])
    return {
        "==": a == b, "!=": a != b,
        "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b,
    }[op]


def classify(params, rules):
    """Return (admissible, [names of matching rules])."""
    matched = [r["name"] for r in rules if rule_matches(r, params)]
    return (not matched), matched


# "fog_density <= 50", "pedestrian == Adult" ... (the requirement's `assuming` clause)
ASSUMPTION_RE = re.compile(r"^\s*(\w+)\s*(<=|>=|==|!=|<|>)\s*([\w.]+)\s*$")
# An assumption says what IS in scope; a rule says what is OUT - so invert.
_INVERT = {"<=": ">", "<": ">=", ">=": "<", ">": "<=", "==": "!=", "!=": "=="}


# What an `assuming` item may talk about (docs/design/domain_assumptions.md).
# A domain assumption is about the world, never the car under test.
# level "scenario": a grid setting, the same for every trial of a scenario.
# level "run":      measured in each simulation.
# available False:  in the design but not recorded yet (roadmap M2) - an
#                   assumption on it is reported "not measured", never held.
QUANTITIES = {
    "fog_density":               {"level": "scenario", "unit": "%",   "source": "grid setting",        "available": True},
    "pedestrian":                {"level": "scenario", "unit": None,  "source": "grid setting",        "available": True},
    "dress":                     {"level": "scenario", "unit": None,  "source": "grid setting",        "available": True},
    "direction":                 {"level": "scenario", "unit": None,  "source": "grid setting",        "available": True},
    # NB: `distance` does not yet move the pedestrian (scratch.temp, roadmap M2.3).
    "distance":                  {"level": "scenario", "unit": None,  "source": "grid setting",        "available": True},
    "initial_separation_m":      {"level": "run",      "unit": "m",   "source": "trace distance_m[0]", "available": True},
    "pedestrian_speed_mps":      {"level": "run",      "unit": "m/s", "source": "template recording",  "available": False},
    "crossing_start_distance_m": {"level": "run",      "unit": "m",   "source": "template recording",  "available": False},
}


def parse_assumption(text):
    """Classify one `assuming` item. Returns a dict with keys
    text, kind, quantity, op, value, message. kind is one of:
      "scenario" / "run" - checkable against grid settings / run measurements
      "free_text"        - not of the form <quantity> <op> <value>; shown to the human
      "rejected"         - about the car under test, or an unknown quantity;
                           flagged in the report, never used
    Assumptions are checked after the run, never imposed on the simulator."""
    text = str(text).strip()
    item = {"text": text, "kind": "free_text", "quantity": None,
            "op": None, "value": None, "message": ""}
    m = ASSUMPTION_RE.match(text)
    if not m:
        return item
    quantity, op, value = m.groups()
    item.update(quantity=quantity, op=op, value=value)
    if quantity.startswith("ego"):
        item.update(kind="rejected", message=(
            f"'{quantity}' is about the car under test. An assumption may only "
            "describe the world (pedestrian, weather, road, start positions); "
            "otherwise failures could be defined away by narrowing the car's "
            "own behaviour."))
    elif quantity not in QUANTITIES:
        item.update(kind="rejected", message=(
            f"unknown quantity '{quantity}'. Known: {', '.join(QUANTITIES)}."))
    else:
        q = QUANTITIES[quantity]
        item["kind"] = q["level"]
        if not q["available"]:
            item["message"] = (f"'{quantity}' is not recorded yet; this "
                               "assumption will be reported as not measured.")
    return item


def parse_assumptions(assumptions):
    return [parse_assumption(t) for t in assumptions or []]


def _first_distance(run_dir, scenario_id, sim_index):
    path = os.path.join(run_dir, "traces", f"{scenario_id}_{sim_index}.json")
    try:
        with open(path) as f:
            distances = json.load(f).get("distance_m") or []
        return float(distances[0]) if distances else float("nan")
    except (OSError, ValueError, TypeError, IndexError):
        return float("nan")


def add_run_quantities(df, run_dir):
    """Add the run-level quantities that are recorded (QUANTITIES with level
    "run" and available True) as columns. initial_separation_m = first value
    of traces/<scenario_id>_<sim_index>.json distance_m; NaN when the trace is
    missing or empty (-> "not measured")."""
    df = df.copy()
    df["initial_separation_m"] = [
        _first_distance(run_dir, row.get("scenario_id"), row.get("sim_index"))
        for _, row in df.iterrows()]
    return df


def _missing(value):
    if value is None or value == "":
        return True
    try:
        return math.isnan(float(value))
    except (TypeError, ValueError):
        return False


def assumption_status(item, value):
    """'held' / 'broken' / 'not_measured' for one checkable item and one value."""
    if not QUANTITIES.get(item["quantity"], {}).get("available") or _missing(value):
        return "not_measured"
    a, b = _coerce(value, item["value"])
    holds = {
        "==": a == b, "!=": a != b,
        "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b,
    }[item["op"]]
    return "held" if holds else "broken"


def check_assumptions(df, items):
    """For every scenario/run item add a column  assumption::<text>  with its
    status per simulation. A simulation with any 'broken' item is not
    admissible; spurious_reason gains 'assumption: <text>' (same wording as
    the old rules_from_assumptions, so earlier reports and decisions files
    still line up). Free-text and rejected items are only summarised.
    Returns (df, summary) - one summary dict per item: text, kind, quantity,
    held, broken, not_measured, message."""
    df = df.copy()
    if "admissible" not in df:
        df["admissible"] = True
    if "spurious_reason" not in df:
        df["spurious_reason"] = ""
    summary = []
    for item in items:
        entry = {k: item[k] for k in ("text", "kind", "quantity", "message")}
        entry.update(held=0, broken=0, not_measured=0)
        if item["kind"] in ("scenario", "run"):
            column = f"assumption::{item['text']}"
            statuses = [assumption_status(item, row.get(item["quantity"]))
                        for _, row in df.iterrows()]
            df[column] = statuses
            for status in statuses:
                entry[status] += 1
            broken = df[column].eq("broken")
            df.loc[broken, "admissible"] = False
            name = f"assumption: {item['text']}"
            df.loc[broken, "spurious_reason"] = [
                f"{r}, {name}" if r else name for r in df.loc[broken, "spurious_reason"]]
        summary.append(entry)
    df["admissible"] = df["admissible"].astype(bool)
    return df, summary


def rules_from_assumptions(assumptions):
    """Turn the requirement's machine-readable assumptions into out-of-scope
    rules. "fog_density <= 50" -> {param fog_density, op >, value 50}.
    Returns (rules, free_text) - anything not of the form
    `<param> <op> <value>` is left for the human as free text.

    No longer used by report.py since roadmap M1.3 (2026-10-01): it turned
    every machine-readable item into a rule, so assumptions about the car or
    about unmeasured quantities silently counted as held. The report now uses
    parse_assumptions + check_assumptions. Kept for its tests and old callers."""
    rules, free_text = [], []
    for text in assumptions or []:
        m = ASSUMPTION_RE.match(str(text))
        if not m:
            free_text.append(str(text))
            continue
        param, op, value = m.groups()
        rules.append({
            "name": f"assumption: {text.strip()}",
            "param": param, "op": _INVERT[op], "value": value,
            "reason": f"The requirement assumes {text.strip()}",
            "source": "requirement",
        })
    return rules, free_text


PARAM_COLUMNS = ["pedestrian", "dress", "direction", "distance", "fog_density"]


def label_simulations(df, rules):
    """Add 'admissible' (bool) and 'spurious_reason' (str) columns to a
    simulations DataFrame (see failure_model.load_simulations)."""
    admissible, reasons = [], []
    for _, row in df.iterrows():
        params = {c: row.get(c) for c in PARAM_COLUMNS}
        ok, matched = classify(params, rules)
        admissible.append(ok)
        reasons.append(", ".join(matched))
    df = df.copy()
    df["admissible"] = admissible
    df["spurious_reason"] = reasons
    return df


def assumption_verdicts(df, summary, min_effect=0.15, min_n=10):
    """Does breaking an assumption go with more failures? Over real
    encounters only (df needs 'encounter' and 'failed', i.e. after
    failure_model.add_failure_types). Adds enc_held, enc_broken, rate_held,
    rate_broken and verdict to each checkable summary entry:
      not measured / untested (never broken) / insufficient data (< min_n
      on a side) / load-bearing (>= +min_effect) / fewer failures when broken
      (<= -min_effect) / not load-bearing.
    Same bars as the rest of the analysis: a judgement call, not a test."""
    enc = df[df["encounter"]] if "encounter" in df else df
    out = []
    for entry in summary:
        entry = dict(entry)
        column = f"assumption::{entry['text']}"
        if entry["kind"] not in ("scenario", "run"):
            entry["verdict"] = None
            out.append(entry)
            continue
        if column not in enc:
            entry.update(enc_held=0, enc_broken=0, rate_held=None, rate_broken=None,
                         verdict="not measured")
            out.append(entry)
            continue
        held = enc[enc[column] == "held"]
        broken = enc[enc[column] == "broken"]
        rate_held = float(held["failed"].mean()) if len(held) else None
        rate_broken = float(broken["failed"].mean()) if len(broken) else None
        entry.update(enc_held=int(len(held)), enc_broken=int(len(broken)),
                     rate_held=rate_held, rate_broken=rate_broken)
        if len(held) + len(broken) == 0:
            verdict = "not measured"
        elif len(broken) == 0:
            verdict = "untested"
        elif len(held) < min_n or len(broken) < min_n:
            verdict = "insufficient data"
        elif rate_broken - rate_held >= min_effect:
            verdict = "load-bearing"
        elif rate_broken - rate_held <= -min_effect:
            verdict = "fewer failures when broken"
        else:
            verdict = "not load-bearing"
        entry["verdict"] = verdict
        out.append(entry)
    return out
