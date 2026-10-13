"""Oracle for the interface's contract tests: what the Python tools write.

    python tests/contract/oracle.py <run folder> <answers.json> <reviewer> <decided_at> [previous run folder]

Builds the decision document exactly as the command-line review does
(decisions.from_analysis on the folder's analysis_report.json, with the
scenario-artefact catalogue), applies the prepared answers the way
review.py --answers does, derives the requirement change list and R1 with
refine.refine(write=False), and prints a JSON envelope with the text the
three files would hold:

    {"decisions": "...", "r1": "...", "diff": "..."}

Run from the repository root (it imports scripts.analysis). Nothing is written.
"""

import json
import os
import sys

from scripts.analysis import decisions, obstacles, refine


def main(argv):
    run_dir, answers_path, reviewer, decided_at = argv[:4]
    previous_dir = argv[4] if len(argv) > 4 else None
    with open(os.path.join(run_dir, "analysis_report.json")) as f:
        analysis = json.load(f)
    previous = None
    if previous_dir:
        with open(os.path.join(previous_dir, "analysis_report.json")) as f:
            previous = json.load(f)
    with open(answers_path) as f:
        answers = json.load(f)
    doc = decisions.from_analysis(analysis, previous, reviewer=reviewer,
                                  round_no=answers.get("round"), artefacts=obstacles.SCENARIO_ARTEFACTS)
    for oid, pre in answers.get("obstacles", {}).items():
        entry = doc["obstacles"][oid]
        entry["verdict"] = pre.get("verdict")
        entry["renamed_to"] = pre.get("renamed_to")
        entry["reason"] = pre.get("reason")
        layer = pre.get("mitigation_layer")
        if layer and entry["verdict"] in ("accept", "rename"):
            opt = next((x for x in entry["options"] if x["layer"] == layer), None)
            entry["mitigation"] = {"layer": layer,
                                   "action": pre.get("mitigation_action") or (opt["action"] if opt else "")}
    for sid, pre in answers.get("scope", {}).items():
        doc["scope"][sid]["verdict"] = pre.get("verdict")
        doc["scope"][sid]["reason"] = pre.get("reason")
    for text, pre in answers.get("assumptions", {}).items():
        a = doc["assumptions"][text]
        a["verdict"], a["new_text"], a["reason"] = pre.get("verdict"), pre.get("new_text"), pre.get("reason")
    if "added_assumptions" in answers:
        doc["added_assumptions"] = list(answers["added_assumptions"])
    doc["decided_at"] = decided_at

    r0_path = os.path.join(run_dir, "R0.dsl")
    if os.path.exists(r0_path):
        with open(r0_path) as f:
            r0 = f.read()
    else:
        r0 = (analysis.get("run_meta") or {}).get("requirement") or ""
    out = refine.refine(run_dir, doc=doc, r0=r0, write=False)
    problems = decisions.validate(out["decisions"])
    if problems:
        raise SystemExit("invalid: " + "; ".join(problems))
    envelope = {
        "decisions": json.dumps(out["decisions"], indent=2),
        "r1": out["r1"] if out["r1"].endswith("\n") else out["r1"] + "\n",
        "diff": refine.render_diff(out["r0"], out["r1"], out["changes"], out["decisions"].get("run_id")),
    }
    json.dump(envelope, sys.stdout)


if __name__ == "__main__":
    main(sys.argv[1:])
