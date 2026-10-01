"""Requirement writer: decisions.json -> proposed next requirement (R1).

    python -m scripts.analysis.refine artifacts/runs/<round_n>

Reads the round's decisions.json and the requirement it was run with (R0,
from run_meta.json), and writes next to them:

    R0.dsl                the requirement as run
    R1.dsl                the proposed next requirement
    requirement_diff.md   R0 / R1 side by side, a unified diff, and the change
                          list with each change labelled
        [S]  we changed the car   - a `performed by "<module>"` swap (braking
             mode, detector); flagged if the executor does not implement it yet
        [R]  we changed the promise - an `ensuring "..."` soft goal (or other
             goal text) added
        [D]  we changed the assumptions - an `assuming "..."` domain assumption
             / ODD limit added (the paper's domain revision D'')
        [T]  we fix the test  - a scenario-template or scope-rule fix; NOT part
             of the requirement text, listed so nothing is lost

and records the change list in decisions.json under `requirement_changes`.

Nothing is applied: R1.dsl is a proposal for the human to edit or accept, and
the next round is launched deliberately (with `parent_run_id` and
`requirement_source` so run_meta.json says where its requirement came from).
The R1 text is checked to parse with the DSL before it is written.
"""

import argparse
import difflib
import os
import re

from scripts.analysis import decisions

R0_FILENAME = "R0.dsl"
R1_FILENAME = "R1.dsl"
DIFF_FILENAME = "requirement_diff.md"

# (obstacle id, mitigation layer) -> (task whose module changes, new module).
# The paper's M1-M4 mapped onto the requirement's "performed by" slots.
S_CHANGES = {
    ("DetectionTooLate", "system"): ("Apply Brakes", "proportional_braking"),
    ("DetectionTooLate", "model"): ("Detect Pedestrian", "yolov5m"),
    ("DetectionTooLate", "data"): ("Detect Pedestrian", "fine_tune"),
    ("PedestrianSizeTooSmall", "data"): ("Detect Pedestrian", "fine_tune"),
    ("PedestrianSizeTooSmall", "model"): ("Detect Pedestrian", "yolov5m"),
    ("PedestrianSizeTooSmall", "system"): ("Apply Brakes", "proportional_braking"),
    ("PedestrianClothingNotVisible", "data"): ("Detect Pedestrian", "fine_tune"),
    ("PedestrianClothingNotVisible", "system"): ("Apply Brakes", "proportional_braking"),
    ("AdverseWeather", "data"): ("Detect Pedestrian", "fine_tune"),
    ("BrakingNotLatched", "system"): ("Apply Brakes", "latched_braking"),
    ("StandoffUnnecessaryStop", "system"): ("Apply Brakes", "proportional_braking_with_resume"),
}

# (obstacle id, "requirement") -> (clause, text). Machine-readable assumptions
# (<param> <op> <value>) become scope rules automatically; the rest is for humans.
R_CHANGES = {
    ("DetectionTooLate", "requirement"): ("assuming", "ego_speed <= 5"),
    ("AdverseWeather", "requirement"): ("assuming", "fog_density <= 50"),
    ("PedestrianSizeTooSmall", "requirement"): ("assuming", "pedestrian is at least 1.2 m tall"),
    ("PedestrianClothingNotVisible", "requirement"): ("assuming", "pedestrian clothing contrasts with the background"),
    ("StandoffUnnecessaryStop", "requirement"): ("ensuring", "vehicle resumes within 10 s once the crossing is clear"),
    ("BrakingNotLatched", "requirement"): ("ensuring", "once braking has started it continues until the vehicle has stopped or the pedestrian is clear"),
}

# Braking modules the executor can actually run (kept in sync with
# scripts/simulations/util.py::BRAKING_BEHAVIOURS; imported lazily because
# util pulls in VerifAI/MLflow, which the offline review page must not need).
_FALLBACK_BRAKING = ("emergency_braking", "proportional_braking")
_INVERT = {"<=": ">", "<": ">=", ">=": "<", ">": "<=", "==": "!=", "!=": "=="}


def available_modules():
    """{'braking': set(...), 'perception': set(...)} the executor supports today."""
    try:
        from scripts.simulations.util import BRAKING_BEHAVIOURS
        braking = set(BRAKING_BEHAVIOURS)
    except Exception:
        braking = set(_FALLBACK_BRAKING)
    try:
        from real_config import settings
        perception = {f[:-3] for f in os.listdir(settings.model_dir) if f.endswith(".pt")}
    except Exception:
        perception = {"yolov5s"}
    return {"braking": braking, "perception": perception}


def _is_available(task, module, avail):
    pool = avail["braking"] if "brake" in task.lower() else avail["perception"]
    return module in pool


def assumption_changes(doc, r0_assumptions):
    """[D] changes from the reviewer's assumption verdicts
    (docs/design/domain_assumptions.md, 'Revision'). `r0_assumptions` = the
    items in the run's own `assuming` clause; anything else was stated after
    the run (e.g. a baseline re-analysis) and is new to R1 if kept."""
    changes = []
    for text, a in (doc.get("assumptions") or {}).items():
        v = a.get("verdict")
        in_r0 = text in r0_assumptions
        sid = f"assumption:{text}"
        base = {"kind": "D", "from": sid, "layer": "requirement", "clause": "assuming"}
        if v == "keep" and not in_r0:
            changes.append(dict(base, item=text, text=f'assuming "{text}" (kept; stated after the run)'))
        elif v in ("tighten", "loosen"):
            new = a["new_text"].strip()
            no_evidence = v == "loosen" and a.get("tool_verdict") == "untested"
            changes.append(dict(base, item=new, replaces=text if in_r0 else None,
                                no_evidence=no_evidence,
                                text=f'assuming "{new}" ({v}ed from "{text}")'))
        elif v == "drop" and in_r0:
            changes.append(dict(base, item=text, remove=True, text=f'drop assuming "{text}"'))
    for added in doc.get("added_assumptions") or []:
        t = str(added.get("text") or "").strip()
        if t:
            changes.append({"kind": "D", "from": "added by reviewer", "layer": "requirement",
                            "clause": "assuming", "item": t, "text": f'assuming "{t}" (added)'})
    return changes


def plan_changes(doc, r0=None):
    """The list of changes the decisions imply. Each: {kind, from, layer,
    text, ...}; S-changes carry task/module/available, R-changes clause/item,
    D-changes clause/item (+ replaces / remove / no_evidence for assumption
    verdicts). `r0` (the requirement as run) tells which assumptions it
    already states."""
    changes = []
    avail = available_modules()
    for oid, o in doc.get("obstacles", {}).items():
        if o.get("verdict") not in ("accept", "rename") or not o.get("mitigation"):
            continue
        layer = o["mitigation"]["layer"]
        key = (oid, layer)
        if layer in ("system", "model", "data"):
            if key in S_CHANGES:
                task, module = S_CHANGES[key]
                changes.append({"kind": "S", "from": oid, "layer": layer, "task": task, "module": module,
                                "available": _is_available(task, module, avail),
                                "text": f'"{task}" performed by "{module}"'})
            else:
                changes.append({"kind": "S", "from": oid, "layer": layer, "task": None, "module": None,
                                "available": False,
                                "text": f"{layer}-level change with no requirement slot: {o['mitigation']['action']}"})
        elif layer == "requirement":
            clause, item = R_CHANGES.get(key, ("assuming", o["mitigation"]["action"]))
            kind = "D" if clause == "assuming" else "R"
            changes.append({"kind": kind, "from": oid, "layer": layer, "clause": clause, "item": item,
                            "text": f'{clause} "{item}"'})
        elif layer == "scenario":
            changes.append({"kind": "T", "from": oid, "layer": layer, "target": "scripts/scenarios/scratch.temp",
                            "text": o["mitigation"]["action"]})
    for sid, s in doc.get("scope", {}).items():
        v = s.get("verdict")
        if v == "out_of_scope":
            rule = s.get("rule") or {}
            if rule.get("param") and rule.get("op") in _INVERT:
                item = f"{rule['param']} {_INVERT[rule['op']]} {rule['value']}"
                changes.append({"kind": "D", "from": sid, "layer": "requirement", "clause": "assuming",
                                "item": item, "text": f'assuming "{item}"'})
            else:
                changes.append({"kind": "D", "from": sid, "layer": "requirement", "clause": "assuming",
                                "item": s.get("reason") or sid, "text": f'assuming "{s.get("reason") or sid}"'})
        elif v == "in_scope":
            changes.append({"kind": "T", "from": sid, "layer": "scope",
                            "target": "scripts/analysis/admissibility_rules.json",
                            "text": f"drop the rule behind {sid}: the scenario is realistic"})
        elif v == "scenario_defect":
            changes.append({"kind": "T", "from": sid, "layer": "scenario", "target": "scripts/scenarios/scratch.temp",
                            "text": s.get("suggested_fix") or s.get("reason") or "fix the test scenario"})
    r0_assumptions = _split_clauses(r0)[1] if r0 else []
    changes.extend(assumption_changes(doc, r0_assumptions))
    return changes


def _replace_module(text, task, new_module):
    """Swap the module in `"<task>" ... performed by "<old>"` (first occurrence)."""
    i = text.find(f'"{task}"')
    if i < 0:
        raise ValueError(f'task "{task}" not found in the requirement')
    m = re.compile(r'performed by\s+"([^"]*)"').search(text, i)
    if not m:
        raise ValueError(f'no "performed by" after task "{task}"')
    return text[:m.start(1)] + new_module + text[m.end(1):], m.group(1)


_TAIL = re.compile(
    r'^(?P<head>.*?)'
    r'(?P<assuming>\s+assuming\s+"[^"]*"(?:\s*&\s*"[^"]*")*)?'
    r'(?P<ensuring>\s+ensuring\s+"[^"]*"(?:\s*&\s*"[^"]*")*)?'
    r'\s*$', re.DOTALL)


def _split_clauses(text):
    m = _TAIL.match(text)
    head = m.group("head")
    items = lambda g: re.findall(r'"([^"]*)"', m.group(g) or "")
    return head, items("assuming"), items("ensuring")


def _join(head, assuming, ensuring):
    out = head.rstrip()
    if assuming:
        out += "\n    assuming " + " & ".join(f'"{a}"' for a in assuming)
    if ensuring:
        out += "\n    ensuring " + " & ".join(f'"{e}"' for e in ensuring)
    return out + "\n"


def apply_changes(r0, changes):
    """R0 text + change list -> R1 text (S- and R-changes only; D-changes are
    not requirement text). Duplicate clause items are not added twice."""
    text = r0
    for ch in changes:
        if ch["kind"] == "S" and ch.get("task") and ch.get("module"):
            text, _ = _replace_module(text, ch["task"], ch["module"])
    head, assuming, ensuring = _split_clauses(text)
    for ch in changes:
        if ch["kind"] not in ("R", "D") or not ch.get("clause"):
            continue
        target = assuming if ch["clause"] == "assuming" else ensuring
        if ch.get("remove"):
            if ch["item"] in target:
                target.remove(ch["item"])
            continue
        if ch.get("replaces") in target:
            target[target.index(ch["replaces"])] = ch["item"]
        elif ch["item"] not in target:
            target.append(ch["item"])
    return _join(head, assuming, ensuring)


def check_parses(text):
    from scripts.redsl.grammar import DSL
    return DSL(text).parse_tree is not None


def render_diff(r0, r1, changes, run_id=None):
    L = []
    add = L.append
    add(f"# Proposed requirement change{f' - after run `{run_id}`' if run_id else ''}")
    add("")
    add("Labels: **[S]** we changed the car (`performed by`), "
        "**[R]** we changed the promise (an `ensuring` soft goal added), "
        "**[D]** we changed the assumptions (an `assuming` domain assumption added, changed or dropped), "
        "**[T]** we fix the test (a scenario or scope fix - not requirement text). "
        "R1 is a proposal: edit or accept; nothing is applied automatically.")
    add("")
    add("## Changes")
    if not changes:
        add("- none - the decisions imply no change to the requirement")
    for ch in changes:
        note = ""
        if ch["kind"] == "S" and not ch.get("available", True):
            note = "  **(executor does not implement this module yet - round 3 cannot run it until it does)**"
        if ch.get("no_evidence"):
            note = ("  **(loosened although the assumption was never broken in this run - "
                    "no evidence behind it)**")
        add(f"- [{ch['kind']}] from `{ch['from']}` ({ch['layer']}): {ch['text']}{note}")
    add("")
    add("## R0 (as run)")
    add("```")
    add(r0.strip())
    add("```")
    add("## R1 (proposed)")
    add("```")
    add(r1.strip())
    add("```")
    add("## Unified diff")
    add("```diff")
    L.extend(l.rstrip("\n") for l in difflib.unified_diff(
        r0.strip().splitlines(), r1.strip().splitlines(), "R0.dsl", "R1.dsl", lineterm=""))
    add("```")
    return "\n".join(L) + "\n"


def write_files(run_dir, r0, r1, changes, run_id=None):
    paths = {}
    for name, content in ((R0_FILENAME, r0), (R1_FILENAME, r1),
                          (DIFF_FILENAME, render_diff(r0, r1, changes, run_id))):
        p = os.path.join(run_dir, name)
        with open(p, "w") as f:
            f.write(content if content.endswith("\n") else content + "\n")
        paths[name] = p
    return paths


def refine(run_dir, doc=None, r0=None, r1_override=None, write=True):
    """decisions (+ R0 from run_meta.json) -> R1. `r1_override` = a human-edited
    R1 text to use instead of the generated one (still parse-checked)."""
    import json
    doc = doc or decisions.load(run_dir)
    if r0 is None:
        with open(os.path.join(run_dir, "run_meta.json")) as f:
            r0 = json.load(f).get("requirement") or ""
    if not r0.strip():
        raise ValueError("no requirement text (R0) in run_meta.json")
    changes = plan_changes(doc, r0)
    r1 = r1_override if r1_override is not None else apply_changes(r0, changes)
    if not check_parses(r1):
        raise ValueError("the proposed R1 does not parse with the DSL - not written")
    doc = dict(doc, requirement_changes=[
        {"kind": c["kind"], "text": c["text"], "from": c["from"], "layer": c["layer"],
         **({"available": c["available"]} if "available" in c else {})} for c in changes])
    paths = {}
    if write:
        paths = write_files(run_dir, r0, r1, changes, doc.get("run_id"))
        paths[decisions.FILENAME] = decisions.save(doc, run_dir)
    return {"r0": r0, "r1": r1, "changes": changes, "paths": paths, "decisions": doc}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("run_dir")
    args = p.parse_args(argv)
    out = refine(args.run_dir)
    print(render_diff(out["r0"], out["r1"], out["changes"], out["decisions"].get("run_id")))
    for name, path in out["paths"].items():
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
