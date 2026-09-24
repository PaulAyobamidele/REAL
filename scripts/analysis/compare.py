"""Compare two runs of the loop - typically round n and round n+1.

    python -m scripts.analysis.compare artifacts/runs/<round_1> artifacts/runs/<round_2>

Two things a fair comparison needs, both enforced here:

1. **One variable.** The runs' run_meta.json files are diffed (ignoring run
   id, timestamps and result fields). Anything that differs other than the
   system under test is flagged - a comparison with two changed variables
   proves nothing. Where a run predates a field (round 1, 2026-09-23, has no
   `system_under_test`), the caller supplies the known value via --assume.
2. **A comparable metric.** Failure rate over *true encounters* only, with
   the no-encounter count reported separately per round (a run whose car
   drives away from the pedestrian more often would otherwise look safer).

Also compared: failure-type counts and shares, obstacle verdicts, and the
timing medians - so a pre-registered prediction ("DetectionTooLate should
drop, BrakingNotLatched may not") can be checked against exactly the numbers
it named. Writes comparison.md/.json next to the later run.
"""

import argparse
import hashlib
import json
import math
import os
from datetime import datetime, timezone

from scripts.analysis import failure_model, obstacles, report

# Fields that legitimately differ between any two runs and say nothing about
# the experiment's variables.
VOLATILE_META = {"run_id", "created_at", "finished_at", "status", "worst_phenotype",
                 "worst_pct", "best_phenotype", "parent_run_id", "round", "requirement_source",
                 "decisions_path"}

# The variable a mitigation round is allowed to change.
ALLOWED_DIFF = {"system_under_test"}


def _flatten(d, prefix=""):
    out = {}
    for k, v in (d or {}).items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, key + "."))
        else:
            out[key] = v
    return out


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def meta_diff(meta_a, meta_b, assume_a=None, assume_b=None):
    """Return {key: (a, b)} for every non-volatile key that differs.
    `assume_*` fill in values a run's meta predates (e.g. system_under_test)."""
    a = dict(meta_a or {})
    b = dict(meta_b or {})
    for target, assumed in ((a, assume_a), (b, assume_b)):
        for k, v in (assumed or {}).items():
            target.setdefault(k, v)
    fa, fb = _flatten(a), _flatten(b)
    diffs = {}
    for key in sorted(set(fa) | set(fb)):
        top = key.split(".")[0]
        if top in VOLATILE_META:
            continue
        if fa.get(key) != fb.get(key):
            diffs[key] = (fa.get(key), fb.get(key))
    return diffs


def _metric(analysis):
    fm = analysis["failure_model"]
    n_fail = fm["failures"] or 0
    types = {k: {"count": v, "share": (v / n_fail) if n_fail else None}
             for k, v in fm["failure_types"].items()}
    return {
        "n_simulations": fm["n_simulations"],
        "n_encounters": fm["n_encounters"],
        "n_no_encounter": fm["n_no_encounter"],
        "failures": n_fail,
        "failure_rate": fm["failure_rate"],
        "passes": fm.get("passes", 0),
        "passed_clean": fm.get("passed_clean", 0),
        "passed_stalled": fm.get("passed_stalled", 0),
        "failure_types": types,
        "timing": fm.get("timing") or {},
        "obstacles": {o["id"]: o["verdict"] for o in analysis["obstacles"]},
        "n_spurious": analysis["admissibility"]["n_spurious"],
    }


def compare_runs(run_a, run_b, assume_a=None, assume_b=None, rules_path=None, allow=None):
    """`allow` = {meta key: justification} for differences the experimenter has
    inspected and accepts as part of the one variable (e.g. template_sha256
    when the only template change is the behaviour block). They are listed
    in the comparison with the justification, not flagged."""
    analysis_a = report.analyse(run_a, rules_path)
    analysis_b = report.analyse(run_b, rules_path)
    diffs = meta_diff(analysis_a["run_meta"], analysis_b["run_meta"], assume_a, assume_b)
    allow = allow or {}
    unexpected = {k: v for k, v in diffs.items()
                  if k.split(".")[0] not in ALLOWED_DIFF and k not in allow}
    ma, mb = _metric(analysis_a), _metric(analysis_b)

    def delta(x, y):
        if x is None or y is None or (isinstance(x, float) and math.isnan(x)) or (isinstance(y, float) and math.isnan(y)):
            return None
        return y - x

    type_deltas = {t: {"count": delta(ma["failure_types"][t]["count"], mb["failure_types"][t]["count"]),
                       "share": delta(ma["failure_types"][t]["share"], mb["failure_types"][t]["share"])}
                   for t in failure_model.FAILURE_TYPES}
    return {
        "compared_at": datetime.now(timezone.utc).isoformat(),
        "run_a": analysis_a["run_id"], "run_b": analysis_b["run_id"],
        "meta_diff": diffs,
        "allowed_diff": {k: allow[k] for k in diffs if k in allow},
        "unexpected_diff": unexpected,
        "one_variable": not unexpected and bool(diffs),
        "metric_a": ma, "metric_b": mb,
        "failure_rate_delta": delta(ma["failure_rate"], mb["failure_rate"]),
        "failure_type_deltas": type_deltas,
        "obstacle_changes": {k: (ma["obstacles"].get(k), mb["obstacles"].get(k))
                             for k in sorted(set(ma["obstacles"]) | set(mb["obstacles"]))
                             if ma["obstacles"].get(k) != mb["obstacles"].get(k)},
    }


def _pct(x):
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.0%}"


def _pp(x):
    return "n/a" if x is None else f"{x:+.0%}"


def to_markdown(c):
    ma, mb = c["metric_a"], c["metric_b"]
    L = []
    add = L.append
    add(f"# Round comparison: `{c['run_a']}` -> `{c['run_b']}`")
    add("")
    add("## 1. One variable?")
    if not c["meta_diff"]:
        add("- The two runs' metadata are identical (nothing changed?).")
    for k, (a, b) in c["meta_diff"].items():
        if k.split(".")[0] in ALLOWED_DIFF:
            flag = ""
        elif k in c.get("allowed_diff", {}):
            flag = f"  (allowed: {c['allowed_diff'][k]})"
        else:
            flag = "  **<- UNEXPECTED**"
        add(f"- `{k}`: `{a}` -> `{b}`{flag}")
    add("- " + ("OK: only the system under test differs"
                + (" (plus the allowed, justified differences above)." if c.get("allowed_diff") else ".")
                if c["one_variable"]
                else "NOT a one-variable comparison - see flagged lines." if c["unexpected_diff"]
                else "Nothing differs."))
    add("")
    add("## 2. Comparable metric: failure rate over true encounters")
    add("")
    add("| | round A | round B | change |")
    add("|---|---|---|---|")
    add(f"| simulations | {ma['n_simulations']} | {mb['n_simulations']} | |")
    add(f"| no-encounter (car never met the pedestrian; excluded) | {ma['n_no_encounter']} | {mb['n_no_encounter']} | |")
    add(f"| true encounters | {ma['n_encounters']} | {mb['n_encounters']} | |")
    add(f"| failures | {ma['failures']} | {mb['failures']} | |")
    add(f"| **failure rate (encounters)** | **{_pct(ma['failure_rate'])}** | **{_pct(mb['failure_rate'])}** | {_pp(c['failure_rate_delta'])} |")
    add(f"| passes that drove on normally | {ma['passed_clean']} | {mb['passed_clean']} | |")
    add(f"| passes that stalled (standoff; soft goal failed) | {ma['passed_stalled']} | {mb['passed_stalled']} | |")
    add(f"| set aside as spurious | {ma['n_spurious']} | {mb['n_spurious']} | |")
    add("")
    add("## 3. How the failures happened")
    add("")
    add("| failure type | round A | round B | change in share |")
    add("|---|---|---|---|")
    for t in failure_model.FAILURE_TYPES:
        a, b = ma["failure_types"][t], mb["failure_types"][t]
        add(f"| {t} | {a['count']} ({_pct(a['share'])}) | {b['count']} ({_pct(b['share'])}) | "
            f"{_pp(c['failure_type_deltas'][t]['share'])} |")
    add("")
    ta, tb = ma["timing"], mb["timing"]
    if ta and tb:
        add("## 4. Timing (medians over detected encounters)")
        add("")
        add("| | round A | round B |")
        add("|---|---|---|")
        for key, label in (("first_detection_distance_m_median", "first detection distance (m)"),
                           ("speed_at_first_brake_mps_median", "speed at first brake (m/s)"),
                           ("stopping_distance_needed_m_median", "stopping distance needed (m)"),
                           ("share_detected_too_late", "detections too late"),
                           ("brake_steps_median", "brake steps"),
                           ("share_still_moving_at_closest", "still moving at closest point")):
            va, vb = ta.get(key), tb.get(key)
            fmt = _pct if key.startswith("share") else (lambda v: "n/a" if v is None else f"{v:.1f}")
            add(f"| {label} | {fmt(va)} | {fmt(vb)} |")
        add("")
    add("## 5. Obstacle verdicts")
    add("")
    add("| obstacle | round A | round B |")
    add("|---|---|---|")
    for k in sorted(set(ma["obstacles"]) | set(mb["obstacles"])):
        a, b = ma["obstacles"].get(k, "-"), mb["obstacles"].get(k, "-")
        mark = "  **changed**" if a != b else ""
        add(f"| {k} | {a} | {b}{mark} |")
    add("")
    add("Check these numbers against the prediction written down *before* round B ran (Notes.md).")
    return "\n".join(L) + "\n"


def write_comparison(run_a, run_b, assume_a=None, assume_b=None, rules_path=None, allow=None):
    c = compare_runs(run_a, run_b, assume_a, assume_b, rules_path, allow)
    md = to_markdown(c)
    with open(os.path.join(run_b, "comparison.json"), "w") as f:
        json.dump(c, f, indent=2, default=str)
    with open(os.path.join(run_b, "comparison.md"), "w") as f:
        f.write(md)
    return c, md


def _parse_assume(items):
    """--assume system_under_test.braking_mode=emergency_braking -> nested dict."""
    out = {}
    for item in items or []:
        key, _, value = item.partition("=")
        node = out
        parts = key.split(".")
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = value
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("run_a")
    p.add_argument("run_b")
    p.add_argument("--assume-a", action="append", default=[],
                   help="key=value to fill in metadata run A predates, e.g. "
                        "system_under_test.braking_mode=emergency_braking")
    p.add_argument("--assume-b", action="append", default=[])
    p.add_argument("--allow", action="append", default=[],
                   help="key=justification for a metadata difference you inspected and accept, e.g. "
                        "'template_sha256=only the <ego_behavior> block differs (diffed 2026-09-23)'")
    p.add_argument("--rules", default=None)
    args = p.parse_args(argv)
    allow = dict(item.partition("=")[::2] for item in args.allow)
    _, md = write_comparison(args.run_a, args.run_b, _parse_assume(args.assume_a),
                             _parse_assume(args.assume_b), args.rules, allow)
    print(md)


if __name__ == "__main__":
    main()
