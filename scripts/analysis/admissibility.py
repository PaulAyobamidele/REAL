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


def rules_from_assumptions(assumptions):
    """Turn the requirement's machine-readable assumptions into out-of-scope
    rules. "fog_density <= 50" -> {param fog_density, op >, value 50}.
    Returns (rules, free_text) - anything not of the form
    `<param> <op> <value>` is left for the human as free text."""
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
