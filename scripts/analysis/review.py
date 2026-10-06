"""Terminal walk-through of one round's review - writes decisions.json.

    python -m scripts.analysis.review artifacts/runs/<round_2> \
        --previous artifacts/runs/<round_1> --reviewer "Paul"

For each obstacle, in support order: the condition, the evidence, its status
against the previous round (new / persisting / resolved / absent), the timing
medians, a representative trace and the video, then the questions:
verdict (accept / rename / reject / skip), reason, and - for an accepted
obstacle - a numbered mitigation menu from the catalogue (data / model /
system / requirement / scenario). Then the scope items (rules that set
simulations aside, and scenario-artefact candidates): out of scope / in scope /
scenario defect. Then the domain assumptions (D) the requirement states:
keep / tighten / loosen / drop, and new ones may be added. Five minutes per
obstacle; no UI.

Nothing is applied. The result is decisions.json in the run folder (see
scripts/analysis/decisions.py for the schema); scripts/analysis/refine.py
turns it into a proposed requirement.

`--answers FILE` runs it non-interactively from a JSON of prepared answers
(same keys as decisions.json: obstacles -> {verdict, reason, mitigation_layer,
renamed_to}, scope -> {verdict, reason}, assumptions -> {verdict, new_text,
reason}, added_assumptions -> [{text, reason}]); `input_fn`/`output_fn` make
it testable.
"""

import argparse
import json
import math
import os

from scripts.analysis import decisions, failure_model, obstacles, report

VERDICT_KEYS = {"a": "accept", "r": "rename", "j": "reject", "d": "defer", "s": None,
                "accept": "accept", "rename": "rename", "reject": "reject", "defer": "defer", "skip": None}
SCOPE_KEYS = {"o": "out_of_scope", "i": "in_scope", "d": "scenario_defect", "s": None,
              "out_of_scope": "out_of_scope", "in_scope": "in_scope",
              "scenario_defect": "scenario_defect", "skip": None}

ASSUMPTION_KEYS = {"k": "keep", "t": "tighten", "l": "loosen", "d": "drop", "s": None,
                   "keep": "keep", "tighten": "tighten", "loosen": "loosen", "drop": "drop", "skip": None}

ORDER = {"supported": 0, "insufficient_data": 1, "not_supported": 2}


def _pct(x):
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.0%}"


def _representative_trace(run_dir, obstacle):
    """Path of one trace file that shows this obstacle, if the data allows."""
    try:
        df = failure_model.add_failure_types(failure_model.load_simulations(run_dir))
    except Exception:
        return None
    if obstacle.get("failure_type"):
        sub = df[df["failure_type"] == obstacle["failure_type"]]
    elif obstacle.get("outcome"):
        sub = df[df["failure_type"] == obstacle["outcome"]]
    else:
        sub = df[(df[obstacle["param"]].astype(str) == str(obstacle["value"])) & df["failed"]]
    if not len(sub):
        return None
    row = sub.iloc[0]
    return os.path.join(run_dir, "traces", f"{row['scenario_id']}_{int(row['sim_index'])}.json")


def _card(o, entry, analysis, run_dir):
    fm = analysis["failure_model"]
    label = obstacles.verdict_label(o["verdict"], analysis.get("sampling"))
    lines = ["", "=" * 78, f"{o['id']}   [tool: {label}]   [vs previous round: {entry['status']}]", "-" * 78]
    if o.get("outcome"):
        lines.append(f"Condition : passes of type {o['outcome']} - blocks soft goal {o['blocks_goal']}")
    elif o.get("failure_type"):
        lines.append(f"Condition : failures of type {o['failure_type']} - blocks goal {o['blocks_goal']}")
    else:
        lines.append(f"Condition : {o['param']} = {o['value']} - blocks goal {o['blocks_goal']}")
    lines.append(f"Evidence  : {entry['evidence']}")
    lines.append(f"What      : {o['description']}")
    t = fm.get("timing") or {}
    if t:
        lines.append(f"Timing    : first seen {t['first_detection_distance_m_median']:.1f} m at "
                     f"{t['speed_at_first_brake_mps_median']:.1f} m/s; needs {t['stopping_distance_needed_m_median']:.1f} m; "
                     f"{_pct(t['share_detected_too_late'])} too late; still moving at closest {_pct(t['share_still_moving_at_closest'])}")
    trace = _representative_trace(run_dir, o)
    if trace:
        lines.append(f"Trace     : {trace}")
    video = os.path.join(run_dir, "best_scenario.mp4")
    if os.path.exists(video):
        lines.append(f"Video     : {video}  (worst scenario of this run)")
    return "\n".join(lines)


def _ask(input_fn, output_fn, prompt, mapping):
    while True:
        raw = input_fn(prompt).strip().lower()
        if raw in mapping:
            return mapping[raw]
        output_fn(f"  please answer one of: {', '.join(k for k in mapping if len(k) > 1)}")


def run_review(run_dir, previous=None, reviewer=None, round_no=None, answers=None,
               input_fn=input, output_fn=print, rules_path=None, write=True):
    analysis = report.analyse(run_dir, rules_path)
    prev = report.analyse(previous, rules_path) if previous else None
    doc = decisions.from_analysis(analysis, prev, reviewer=reviewer, round_no=round_no,
                                  artefacts=obstacles.SCENARIO_ARTEFACTS)
    answers = answers or {}
    fm = analysis["failure_model"]

    output_fn(f"\nREVIEW - run {analysis['run_id']}" + (f" (previous: {prev['run_id']})" if prev else ""))
    sut = (analysis.get("run_meta") or {}).get("system_under_test") or {}
    output_fn(f"System under test: {sut or 'not recorded'}")
    output_fn(f"{fm['n_simulations']} simulations, {fm['n_encounters']} true encounters, "
              f"{fm['n_no_encounter']} no-encounter; {fm['failures']} failed ({_pct(fm['failure_rate'])}); "
              f"passes {fm.get('passes', 0)} of which stalled {fm.get('passed_stalled', 0)}")
    if prev:
        pf = prev["failure_model"]
        output_fn(f"Previous  : {pf['n_encounters']} encounters, {pf['failures']} failed ({_pct(pf['failure_rate'])}); "
                  f"stalled {pf.get('passed_stalled', 0)}, no-encounter {pf['n_no_encounter']}")

    by_id = {o["id"]: o for o in analysis["obstacles"]}
    ordered = sorted(doc["obstacles"], key=lambda k: (ORDER.get(by_id[k]["verdict"], 9), k))

    for oid in ordered:
        o, entry = by_id[oid], doc["obstacles"][oid]
        output_fn(_card(o, entry, analysis, run_dir))
        pre = answers.get("obstacles", {}).get(oid)
        if pre is not None:
            verdict = pre.get("verdict")
            entry["verdict"] = verdict
            entry["renamed_to"] = pre.get("renamed_to")
            entry["reason"] = pre.get("reason")
            layer = pre.get("mitigation_layer")
        else:
            verdict = _ask(input_fn, output_fn, "Verdict [a]ccept / [r]ename / re[j]ect / [d]efer / [s]kip: ", VERDICT_KEYS)
            entry["verdict"] = verdict
            if verdict == "rename":
                entry["renamed_to"] = input_fn("New name: ").strip() or None
            if verdict is not None:
                entry["reason"] = input_fn("Reason (one line): ").strip() or None
            layer = None
            if verdict in ("accept", "rename") and entry["options"]:
                output_fn("Mitigation menu (0 = none yet):")
                for i, opt in enumerate(entry["options"], 1):
                    output_fn(f"  {i}. [{opt['layer']}] {opt['action']}")
                while True:
                    raw = input_fn("Choose a number: ").strip()
                    if raw.isdigit() and 0 <= int(raw) <= len(entry["options"]):
                        break
                    output_fn(f"  0..{len(entry['options'])} please")
                if int(raw) > 0:
                    layer = entry["options"][int(raw) - 1]["layer"]
        if layer and verdict in ("accept", "rename"):
            opt = next((x for x in entry["options"] if x["layer"] == layer), None)
            entry["mitigation"] = {"layer": layer, "action": (pre or {}).get("mitigation_action") or (opt["action"] if opt else "")}

    if doc["scope"]:
        output_fn("\n" + "=" * 78 + "\nSCOPE - rules that set simulations aside, and scenario-artefact candidates\n" + "-" * 78)
    for sid, s in doc["scope"].items():
        output_fn(f"\n{sid}   ({s['kind']})\nEvidence : {s['evidence']}")
        if s.get("description"):
            output_fn(f"What     : {s['description']}\nFix      : {s['suggested_fix']}")
        pre = answers.get("scope", {}).get(sid)
        if pre is not None:
            s["verdict"], s["reason"] = pre.get("verdict"), pre.get("reason")
        else:
            s["verdict"] = _ask(input_fn, output_fn,
                                "Verdict [o]ut of scope / [i]n scope / scenario [d]efect / [s]kip: ", SCOPE_KEYS)
            if s["verdict"] is not None:
                s["reason"] = input_fn("Reason (one line): ").strip() or None

    if doc["assumptions"]:
        output_fn("\n" + "=" * 78 + "\nASSUMPTIONS (D) - what the requirement assumes about the world\n" + "-" * 78)
    for text, a in doc["assumptions"].items():
        output_fn(f"\n{text}   ({a['kind']})\nEvidence : {a['evidence']}"
                  + (f"\nTool     : {a['tool_verdict']}" if a.get("tool_verdict") else ""))
        pre = answers.get("assumptions", {}).get(text)
        if pre is not None:
            a["verdict"], a["new_text"], a["reason"] = pre.get("verdict"), pre.get("new_text"), pre.get("reason")
        else:
            a["verdict"] = _ask(input_fn, output_fn,
                                "Verdict [k]eep / [t]ighten / [l]oosen / [d]rop / [s]kip: ", ASSUMPTION_KEYS)
            if a["verdict"] in ("tighten", "loosen"):
                if a["verdict"] == "loosen" and a.get("tool_verdict") == "untested":
                    output_fn("  Note: never broken in this run - loosening it has no evidence behind it.")
                a["new_text"] = input_fn("New text: ").strip() or None
            if a["verdict"] is not None:
                a["reason"] = input_fn("Reason (one line): ").strip() or None
    if "added_assumptions" in answers:
        doc["added_assumptions"] = list(answers["added_assumptions"])
    elif doc["assumptions"]:
        while True:
            t = input_fn("Add an assumption (blank to finish): ").strip()
            if not t:
                break
            doc["added_assumptions"].append({"text": t, "reason": input_fn("Reason (one line): ").strip() or None})

    problems = decisions.validate(doc)
    if problems:
        raise ValueError("; ".join(problems))
    if write:
        path = decisions.save(doc, run_dir)
        output_fn(f"\nWrote {path}  (complete: {decisions.is_complete(doc)})")
    return doc


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("run_dir")
    p.add_argument("--previous", default=None, help="run folder of the previous round")
    p.add_argument("--reviewer", default=None)
    p.add_argument("--round", type=int, default=None)
    p.add_argument("--answers", default=None, help="JSON file of prepared answers (non-interactive)")
    p.add_argument("--rules", default=None)
    args = p.parse_args(argv)
    answers = json.load(open(args.answers)) if args.answers else None
    run_review(args.run_dir, previous=args.previous, reviewer=args.reviewer, round_no=args.round,
               answers=answers, rules_path=args.rules)


if __name__ == "__main__":
    main()
