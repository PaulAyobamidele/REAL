"""Per-simulation quantities of a run, for re-judging a revised requirement in
the study page (ui/src/study/rejudge.ts) without the simulator or a server.

    sim_env/bin/python ui/scripts/study_quantities.py <run folder>   (from the repository root)

Runs the analysis's own steps up to - not including - the requirement's
assumptions (scripts/analysis/report.py analyse(): load the simulations, add
the run quantities and the trace measures, apply the default safety rule,
label the test-scope rules, add the failure types) and prints, as JSON, what
the page needs to do the rest exactly as report.py does: for every
simulation its outcome flags, the test-scope rules that set it aside, and the
value of every quantity an assumption or a soft goal may name. Read only.
NaN is written as null and infinities as the strings "Infinity" /
"-Infinity" (Python's float() and JavaScript's Number() both read them).
"""

import json
import math
import sys

from scripts.analysis import admissibility, failure_model, soft_goals, trace_measures


def _value(v):
    if v is None:
        return None
    if hasattr(v, "item"):          # numpy scalars
        v = v.item()
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
    return v


def export(run_dir):
    df = failure_model.load_simulations(run_dir)
    df = admissibility.add_run_quantities(df, run_dir)
    df = trace_measures.add_trace_measures(df, run_dir)
    df = trace_measures.apply_safety_rule(df, trace_measures.DEFAULT_SAFETY_RULE)
    rules = admissibility.load_rules()
    df = admissibility.label_simulations(df, rules)
    df = failure_model.add_failure_types(df)
    names = [q for q in list(admissibility.QUANTITIES) + list(soft_goals.QUANTITIES) if q in df]
    rows = []
    for _, row in df.iterrows():
        idx = row.get("sim_index")
        rows.append({
            "scenario_id": str(row.get("scenario_id")),
            "sim_index": int(float(idx)) if idx not in (None, "") else None,
            "phenotype": _value(row.get("phenotype")),
            "failure_type": _value(row.get("failure_type")),
            "encounter": bool(row.get("encounter")),
            "failed": bool(row.get("failed")),
            "rules_reason": row.get("spurious_reason") or "",
            "values": {q: _value(row.get(q)) for q in names},
        })
    return {
        "assumption_quantities": {q: {"level": v["level"], "available": bool(v["available"])}
                                  for q, v in admissibility.QUANTITIES.items()},
        "soft_goal_quantities": list(soft_goals.QUANTITIES),
        "min_effect": failure_model.MIN_EFFECT,
        "min_n": failure_model.MIN_N,
        "rows": rows,
    }


if __name__ == "__main__":
    json.dump(export(sys.argv[1]), sys.stdout)
