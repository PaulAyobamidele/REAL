"""Run the whole laptop-side failure analysis on one run folder.

    python -m scripts.analysis.report artifacts/runs/<run_id> [--rules FILE]
    python -m scripts.analysis.report artifacts/runs/<run_id> --requirement FILE \
        --out artifacts/runs/<run_id>/<subfolder> --banner "..."

The second form re-judges a finished run against a different requirement
(e.g. assumptions stated after the run). It must write to its own folder,
so the run's original report is never overwritten, and its report carries
the banner.

Reads simulations.csv (+ run_meta.json if present), applies the admissibility
rules, builds the failure model on the admissible simulations, assesses the
obstacles, and writes analysis_report.json + analysis_report.md into the run
folder. No simulator, GPU or network needed.
"""

import argparse
import json
import math
import os
from datetime import datetime, timezone

from scripts.analysis import admissibility, failure_model, obstacles, soft_goals


def _load_meta(run_dir):
    path = os.path.join(run_dir, "run_meta.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def analyse(run_dir, rules_path=None, requirement=None):
    """Return the full analysis as a dict (see write_report for the files).
    `requirement` = text to judge the run against instead of the one in
    run_meta.json (the run itself is unchanged)."""
    meta = _load_meta(run_dir)
    if requirement is not None:
        meta = dict(meta, requirement=requirement, requirement_as_run=meta.get("requirement"))
    rules = admissibility.load_rules(rules_path)
    for rule in rules:
        rule.setdefault("source", "rules file")

    # The requirement's own `assuming "..."` clause (domain assumptions, D) is
    # checked per simulation: held / broken / not measured. Only a broken
    # assumption sets a simulation aside as spurious; the rules file stays the
    # separate test-scope lever ([T]). Assumptions are checked after the run,
    # never imposed on the simulator (docs/design/domain_assumptions.md).
    req = obstacles.requirement_context(meta.get("requirement"))
    items = admissibility.parse_assumptions(req.get("assumptions"))
    free_text_assumptions = [i["text"] for i in items if i["kind"] == "free_text"]

    df = failure_model.load_simulations(run_dir)
    df = admissibility.add_run_quantities(df, run_dir)
    df = admissibility.label_simulations(df, rules)
    df, assumption_summary = admissibility.check_assumptions(df, items)
    df = failure_model.add_failure_types(df)
    assumption_summary = admissibility.assumption_verdicts(
        df, assumption_summary, failure_model.MIN_EFFECT, failure_model.MIN_N)
    soft_goal_summary = soft_goals.check_soft_goals(df[df["admissible"]], req.get("soft_goals"))

    valid = df[df["admissible"]]
    spurious = df[~df["admissible"]]

    model = failure_model.build_failure_model(valid)
    obstacle_results = obstacles.assess_obstacles(valid, model)

    spurious_summary = []
    if len(spurious):
        for reason, sub in spurious.groupby("spurious_reason"):
            spurious_summary.append({
                "rule": reason, "n": int(len(sub)), "failures": int(sub["failed"].sum()),
                "scenarios": sorted(sub["phenotype"].unique().tolist()),
            })

    return {
        "not_simulated": not_simulated(run_dir, df),
        "run_id": meta.get("run_id") or os.path.basename(os.path.normpath(run_dir)),
        "sampling": sampling_of(meta),
        "analysed_at": datetime.now(timezone.utc).isoformat(),
        "run_meta": meta,
        "requirement": req,
        "admissibility": {
            "rules": rules,
            "assumptions": assumption_summary,
            "free_text_assumptions": free_text_assumptions,
            "n_admissible": int(len(valid)),
            "n_spurious": int(len(spurious)),
            "spurious": spurious_summary,
        },
        "soft_goals": soft_goal_summary,
        "failure_model": model,
        "obstacles": obstacle_results,
    }


def not_simulated(run_dir, df):
    """Scenarios a grid / list run attempted (scenarios.csv) that left no
    simulation row - e.g. CARLA could not create them (smoke run 3: 'no
    simulation could be created in 3 attempts'). Never dropped silently."""
    path = os.path.join(run_dir, "scenarios.csv")
    if not os.path.exists(path):
        return []
    import csv
    seen = set(df["scenario_id"].astype(str)) if "scenario_id" in df else set()
    out = []
    with open(path) as f:
        for row in csv.DictReader(f):
            if str(row.get("scenario_id")) not in seen:
                out.append({"scenario_id": row.get("scenario_id"), "label": _label(row)})
    return out


def sampling_of(meta):
    """'grid' (every scenario equally often), 'list' (a chosen set, e.g. the
    grid check of a GE run, each equally often) or 'ge' (bred towards failure)."""
    return {"ge": "ge", "list": "list"}.get((meta or {}).get("mode"), "grid")


SAMPLING_TEXT = {
    "grid": "Sampling: balanced grid - every scenario run equally often.",
    "list": "Sampling: a chosen list of scenarios (e.g. a grid check of a GE run), each run equally often.",
    "ge": ("Sampling: GE search - scenarios were bred towards failure, not sampled evenly. "
           "Failure rates are not population rates, and setting effects and supported "
           "obstacles are leads to confirm on balanced repeats "
           "(python -m scripts.analysis.grid_check <this run>), not findings."),
}


def _pct(x):
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.0%}"


def _label(row):
    """Compact scenario label: 'Child, Dark, LR, Short, fog 50'."""
    parts = [row.get(p) for p in ("pedestrian", "dress", "direction", "distance")]
    parts = [str(p) for p in parts if p not in (None, "")]
    if row.get("fog_density") not in (None, ""):
        parts.append(f"fog {row['fog_density']}")
    return ", ".join(parts) or str(row.get("phenotype", "?"))


def to_markdown(analysis):
    fm = analysis["failure_model"]
    adm = analysis["admissibility"]
    req = analysis.get("requirement") or {}
    lines = []
    add = lines.append

    add(f"# Failure analysis - run `{analysis['run_id']}`")
    add("")
    if analysis.get("banner"):
        add(f"> **{analysis['banner']}**")
        add("")
    sampling = analysis.get("sampling", "grid")
    fm0 = analysis["failure_model"]
    line = SAMPLING_TEXT[sampling]
    if sampling == "ge":
        line += (f" {fm0.get('n_distinct_scenarios', '?')} distinct scenarios; the most repeated ran "
                 f"{fm0.get('max_repeats_of_a_scenario', '?')} times.")
    add(f"> {line}")
    add("")
    meta = analysis.get("run_meta") or {}
    if meta:
        add(f"- Mode: {meta.get('mode', 'ge')} | scenarios: {meta.get('n_scenarios', '?')} | "
            f"trials per scenario: {meta.get('trials_per_scenario', '?')} | seed: {meta.get('seed', '?')}")
    if req.get("parsed"):
        add(f"- Requirement goal under test: **{obstacles.DETECTION_GOAL}** performed by "
            f"`{req.get('detection_module')}`; scenario clause: \"{req.get('scenario_text')}\"")
    add("")

    add("## 1. Scope (admissibility)")
    checked = [a for a in adm.get("assumptions", []) if a["kind"] in ("scenario", "run")]
    rejected = [a for a in adm.get("assumptions", []) if a["kind"] == "rejected"]
    if checked or rejected:
        add("- Assumptions stated in the requirement (`assuming ...`), checked per simulation:")
        where = {"scenario": "scenario setting", "run": "measured in each run"}
        for a in checked:
            if a["held"] + a["broken"] == 0:
                add(f"  - `{a['text']}` ({where[a['kind']]}): not measured in this run, "
                    f"so it set nothing aside")
            else:
                line = (f"  - `{a['text']}` ({where[a['kind']]}): held {a['held']}, "
                        f"broken {a['broken']}")
                if a["not_measured"]:
                    line += f", not measured {a['not_measured']}"
                if a.get("verdict"):
                    line += f" -> **{a['verdict']}**"
                    if a.get("rate_held") is not None and a.get("rate_broken") is not None:
                        line += (f" (failure rate when held {_pct(a['rate_held'])}, "
                                 f"when broken {_pct(a['rate_broken'])}, over encounters)")
                add(line)
        for a in rejected:
            add(f"  - `{a['text']}`: REJECTED - {a['message']}")
        if checked:
            add(f"  - Verdicts: load-bearing = failures at least {failure_model.MIN_EFFECT * 100:.0f} points "
                f"higher when broken (the requirement depends on it); not load-bearing = within "
                f"that (a candidate for loosening); untested = never broken (no evidence either "
                f"way); insufficient data = fewer than {failure_model.MIN_N} encounters on a side. "
                "A judgement call, not a significance test.")
    elif not adm.get("free_text_assumptions"):
        add("- The requirement states no domain assumptions (`assuming ...`): every failure "
            "counts as a real requirement violation.")
    if adm.get("free_text_assumptions"):
        add("- Free-text assumptions (not checked automatically): "
            + "; ".join(f'"{a}"' for a in adm["free_text_assumptions"]))
    add(f"- {adm['n_admissible']} simulations in scope, {adm['n_spurious']} set aside as spurious.")
    if adm["spurious"]:
        for s in adm["spurious"]:
            add(f"  - rule `{s['rule']}`: {s['n']} simulations ({s['failures']} failed) - "
                f"{len(s['scenarios'])} scenarios. For the human: state this limit in the "
                f"requirement, or drop the rule if the scenario is realistic.")
    else:
        add("  - No rule matched. Rules file: edit `scripts/analysis/admissibility_rules.json`.")
    add("")

    add("## 2. Overall")
    add(f"- {fm['n_simulations']} simulations across {fm['n_scenarios']} scenarios; "
        f"{fm['n_encounters']} real encounters, {fm['n_no_encounter']} where the car never met the pedestrian "
        "(not counted as passes)"
        + (f", **{fm['n_left_road']} where the car left the road (a test defect, excluded)**"
           if fm.get("n_left_road") else "")
        + (f", **{fm['n_not_crossed']} where the pedestrian never crossed (a test defect, excluded)**"
           if fm.get("n_not_crossed") else "") + ".")
    if analysis.get("not_simulated"):
        add(f"- **{len(analysis['not_simulated'])} scenario(s) could not be simulated** (the simulator "
            "could not create them) and have no data: "
            + "; ".join(f"#{s['scenario_id']} {s['label']}" for s in analysis["not_simulated"]) + ".")
    add(f"- {fm['failures']} of {fm['n_encounters']} encounters failed ({_pct(fm['failure_rate'])})"
        + (f"; with every distinct scenario counted once: {_pct(fm.get('failure_rate_scenarios'))}."
           if analysis.get("sampling") == "ge" else "."))
    if fm.get("passed_stalled"):
        add(f"- Of the {fm['passes']} passes, **{fm['passed_stalled']} were stalled**: the car stopped "
            f"short and never moved again (standoff; counts as a pass for the safety rule, but the "
            f"progress soft goal failed). {fm['passed_clean']} passes drove on normally.")
    goals = analysis.get("soft_goals") or []
    if goals:
        add("- Soft goals stated in the requirement (`ensuring ...`), over in-scope encounters:")
        for g in goals:
            if g["kind"] == "checked" and g["met"] + g["missed"]:
                add(f"  - `{g['text']}`: met {g['met']}, missed {g['missed']}"
                    + (f", not measured {g['not_measured']}" if g["not_measured"] else ""))
            elif g["kind"] == "checked":
                add(f"  - `{g['text']}`: not measured in this run (recorded from scene v2 on)")
            elif g["kind"] == "rejected":
                add(f"  - `{g['text']}`: REJECTED - {g['message']}")
            else:
                add(f'  - "{g["text"]}": free text, not checked automatically')
        if fm.get("passed_stalled"):
            add(f"  - {fm['passed_stalled']} stalled passes are relevant to any progress / resume goal.")
    elif req.get("parsed") and not req.get("soft_goals"):
        add("- The requirement states no soft goals (`ensuring ...`).")
    types = fm["failure_types"]
    if fm["failures"]:
        add("- How they failed: " + ", ".join(f"{k} {v}" for k, v in types.items() if v))
    t = fm.get("timing") or {}
    if t:
        add(f"- Timing (medians over {t['n_detected']} detected encounters): pedestrian first seen at "
            f"{t['first_detection_distance_m_median']:.1f} m, first brake at "
            f"{t.get('first_brake_distance_m_median', float('nan')):.1f} m while doing "
            f"{t['speed_at_first_brake_mps_median']:.1f} m/s; stopping needs "
            f"{t['stopping_distance_needed_m_median']:.1f} m at that speed, so "
            f"{_pct(t['share_detected_too_late'])} of detections came too late; braking lasted "
            f"{t['brake_steps_median']:.0f} steps; still moving at the closest point in "
            f"{_pct(t['share_still_moving_at_closest'])}; model inference {t['mean_inference_ms_median']:.1f} ms/frame.")
    add("")

    add("## 3. Which settings go with failure")
    add("")
    ge = analysis.get("sampling") == "ge"
    if ge:
        add("| setting | value | n | failure rate | others | effect | effect, each scenario once |")
        add("|---|---|---|---|---|---|---|")
    else:
        add("| setting | value | n | failure rate | others | effect |")
        add("|---|---|---|---|---|---|")
    for r in fm["by_parameter"]:
        flag = "" if r["enough_data"] else " (few data)"
        cells = (f"| {r['param']} | {r['value']} | {r['n']} | {_pct(r['failure_rate'])} | "
                 f"{_pct(r['failure_rate_others'])} | {r['effect']:+.0%}{flag} |")
        if ge:
            se = r.get("scenario_effect")
            cells += (" n/a |" if se is None or (isinstance(se, float) and math.isnan(se))
                      else f" {se:+.0%} |")
        add(cells)
    add("")
    add("*effect* = failure rate with this value minus failure rate with the other value(s). "
        f"Effects under {failure_model.MIN_EFFECT:.0%} are treated as noise.")
    add("")

    add("## 4. Worst scenarios")
    add("")
    add("| scenario (pedestrian, dress, direction, distance, fog) | failures / encounters | min distance (m) | how |")
    add("|---|---|---|---|")
    for r in fm["by_scenario"][:8]:
        how = ", ".join(f"{k} {r[k]}" for k in failure_model.FAILURE_TYPES if r.get(k))
        for extra in ("passed_stalled", "no_encounter"):
            if r.get(extra):
                how = (how + ", " if how else "") + f"{extra} {r[extra]}"
        md_ = r["min_distance_m"]
        md_s = "n/a" if md_ is None or (isinstance(md_, float) and math.isnan(md_)) else f"{md_:.1f}"
        add(f"| {_label(r)} | {r['failures']}/{r['encounters']} | {md_s} | {how or '-'} |")
    add("")
    add("Full phenotype strings are in `scenarios.csv`; per-simulation detail in `simulations.csv`.")
    add("")

    add("## 5. Obstacles")
    add("")
    for o in analysis["obstacles"]:
        ev = o.get("evidence") or {}
        verdict = obstacles.verdict_label(o["verdict"], analysis.get("sampling"))
        add(f"### {o['id']} - {verdict}")
        if o.get("outcome"):
            add(f"- Condition: passes of type `{o['outcome']}`; blocks soft goal **{o['blocks_goal']}**"
                + (f"; challenges domain property *{o['domain_property']}*" if o.get("domain_property") else ""))
        elif o.get("failure_type"):
            add(f"- Condition: failures of type `{o['failure_type']}`; blocks goal **{o['blocks_goal']}**"
                + (f"; challenges domain property *{o['domain_property']}*" if o.get("domain_property") else ""))
        else:
            add(f"- Condition: `{o['param']} = {o['value']}`; blocks goal **{o['blocks_goal']}**"
                + (f"; challenges domain property *{o['domain_property']}*" if o.get("domain_property") else ""))
        add(f"- {o['description']}")
        if ev and "passes" in ev:
            add(f"- Evidence: {ev['count']} of {ev['passes']} passes ended this way "
                f"({_pct(ev['share'])}; bar for support {obstacles.MIN_SHARE:.0%}).")
        elif ev and "share" in ev:
            add(f"- Evidence: {ev['count']} of {ev['failures']} encounter failures ended this way "
                f"({_pct(ev['share'])}; bar for support {obstacles.MIN_SHARE:.0%}).")
        elif ev:
            add(f"- Evidence: failure rate {_pct(ev.get('failure_rate'))} with vs "
                f"{_pct(ev.get('failure_rate_others'))} without (effect {ev.get('effect', float('nan')):+.0%}, "
                f"n={ev.get('n')}).")
        if o.get("detection_failure_share") is not None:
            add(f"- {_pct(o['detection_failure_share'])} of these failures were perception failures "
                "(never detected, or detected too late to stop)" if o["detection_failure_share"] >= 0.5
                else f"- Only {_pct(o['detection_failure_share'])} of these failures were perception failures - "
                     "the pedestrian was seen in time; look at braking behaviour.")
        if o["verdict"] == "supported" and o.get("mitigations"):
            add("- Candidate mitigations (paper Sec. IV-C), for the human to choose from:")
            for layer, text in o["mitigations"].items():
                if text:
                    add(f"  - **{layer}**: {text}")
        add("")

    section = 6
    if fm["warnings"]:
        add(f"## {section}. Warnings about the data")
        for w in fm["warnings"]:
            add(f"- {w}")
        add("")
        section += 1

    add(f"## {section}. For the human")
    add("- Confirm, rename or reject each obstacle above.")
    add("- Decide for each spurious group: is that scenario really out of scope? "
        "If yes, write the limit into the requirement; if no, remove the rule.")
    add("- Pick a mitigation per confirmed obstacle; the requirement-level ones become "
        "the proposed requirement change (stage 8).")
    return "\n".join(lines) + "\n"


def write_report(run_dir, rules_path=None, requirement=None, out_dir=None, banner=None):
    if requirement is not None and (out_dir is None or
                                    os.path.abspath(out_dir) == os.path.abspath(run_dir)):
        raise ValueError("re-judging against another requirement needs its own --out folder "
                         "(the run's original report is never overwritten)")
    analysis = analyse(run_dir, rules_path, requirement)
    if banner:
        analysis["banner"] = banner
    out_dir = out_dir or run_dir
    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.join(out_dir, "analysis_report.json")
    md_path = os.path.join(out_dir, "analysis_report.md")
    with open(json_path, "w") as f:
        json.dump(analysis, f, indent=2, default=str)
    md = to_markdown(analysis)
    with open(md_path, "w") as f:
        f.write(md)
    return analysis, md


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("run_dir", help="artifacts/runs/<run_id> containing simulations.csv")
    parser.add_argument("--rules", default=None, help="admissibility rules JSON (default: built-in)")
    parser.add_argument("--requirement", default=None,
                        help="judge the run against this requirement file instead of the one it ran with")
    parser.add_argument("--out", default=None, help="folder for the report (required with --requirement)")
    parser.add_argument("--banner", default=None, help="line shown at the top of the report")
    args = parser.parse_args(argv)
    requirement = open(args.requirement).read() if args.requirement else None
    _, md = write_report(args.run_dir, args.rules, requirement, args.out, args.banner)
    print(md)


if __name__ == "__main__":
    main()
