"""The study's goal models: one per participant (their R1) and one combined.

    sim_env/bin/python -m scripts.analysis.study_goal_models <sessions> <out>

<sessions> is a folder of the participants' downloads (study_<id>.zip, or the
folders they unzip to). Each holds R0.dsl, R1.dsl and decisions.json. For each
participant, R1 is parsed with the authoring parser (the same as the tool's
editor) and compared with R0: the assumptions and soft goals added, and the
modules swapped. The combined model is R0 with every added assumption and soft
goal, each counted ("3 of 10"), and the module choices counted on their
operation. Refinements made in a participant's own words are not written into
R1 (by design), so they are listed beside it, not drawn.

Writes <out>/goal_models.json, which ui/scripts/analysis/render_goal_models.mjs
draws with the tool's own goal-model layout (one PNG per participant, and the
combined one). Nothing in <sessions> is changed.
"""
import json
import os
import sys
import zipfile
from collections import Counter

from scripts.redsl import serve


def _sessions(folder):
    """(name, {file: text}) for each participant, from zips or folders."""
    for entry in sorted(os.listdir(folder)):
        path = os.path.join(folder, entry)
        files = {}
        if entry.endswith(".zip"):
            with zipfile.ZipFile(path) as z:
                for name in z.namelist():
                    if not name.endswith("/"):
                        files[os.path.basename(name)] = z.read(name).decode("utf-8")
        elif os.path.isdir(path):
            for root, _, names in os.walk(path):
                for name in names:
                    with open(os.path.join(root, name), encoding="utf-8") as f:
                        files[name] = f.read()
        else:
            continue
        if {"R0.dsl", "R1.dsl", "decisions.json"} <= files.keys():
            yield (entry[:-4] if entry.endswith(".zip") else entry), files


def _modules(tree):
    """task -> module, for every operation in the goal tree."""
    out = {}

    def walk(node):
        if not isinstance(node, dict):
            return
        for op in node.get("operations") or []:
            out[op.get("task")] = op.get("module")
        ref = node.get("refinement")
        if isinstance(ref, dict):
            if "goals" in ref:
                for g in ref["goals"]:
                    walk(g)
            else:
                walk(ref)

    walk(tree)
    return out


def changes(r0_tree, r1_tree):
    """What R1 adds to R0: assumptions (D), soft goals (R), module swaps (S)."""
    out = []
    for text in r1_tree.get("assumptions") or []:
        if text not in (r0_tree.get("assumptions") or []):
            out.append({"kind": "D", "text": text})
    for text in r1_tree.get("soft_goals") or []:
        if text not in (r0_tree.get("soft_goals") or []):
            out.append({"kind": "R", "text": text})
    before, after = _modules(r0_tree), _modules(r1_tree)
    for task, module in after.items():
        if before.get(task) != module:
            out.append({"kind": "S", "task": task, "from": before.get(task), "text": module})
    return out


def _own_words(decisions):
    """Refinements a participant wrote in their own words (not drawn in R1)."""
    out = []
    for oid, o in (decisions.get("obstacles") or {}).items():
        m = o.get("mitigation") or {}
        if o.get("resolution") == "refine" and m.get("action"):
            out.append({"obstacle": oid, "text": m["action"]})
    return out


def build(folder):
    participants, r0_text = [], None
    for name, files in _sessions(folder):
        decisions = json.loads(files["decisions.json"])
        study = decisions.get("study") or {}
        r0_text = r0_text or files["R0.dsl"]
        check = serve.check(files["R1.dsl"])
        if not check.get("ok"):
            participants.append({"id": study.get("participant") or name, "error": check.get("error")})
            continue
        r0_tree = serve.check(files["R0.dsl"])["tree"]
        participants.append({
            "id": study.get("participant") or name,
            "expertise": study.get("expertise"),
            "car": study.get("car"),
            "check": check,
            "changes": changes(r0_tree, check["tree"]),
            "own_words": _own_words(decisions),
        })
    if r0_text is None:
        raise SystemExit(f"no participant files (R0.dsl, R1.dsl, decisions.json) in {folder}")

    drawn = [p for p in participants if "check" in p]
    n = len(drawn)
    # the combined model: R0 plus every added assumption and soft goal, counted
    combined = serve.check(r0_text)
    tree = combined["tree"]
    counts = Counter(json.dumps(c, sort_keys=True) for p in drawn for c in p["changes"])
    badges = []
    for key, k in sorted(counts.items(), key=lambda kv: -kv[1]):
        c = json.loads(key)
        if c["kind"] == "D" and c["text"] not in tree["assumptions"]:
            tree["assumptions"].append(c["text"])
        if c["kind"] == "R" and c["text"] not in tree["soft_goals"]:
            tree["soft_goals"].append(c["text"])
        badges.append({**c, "count": k, "of": n})
    unchanged = sum(1 for p in drawn if not p["changes"])
    return {
        "participants": participants,
        "combined": {"check": combined, "badges": badges, "unchanged": unchanged, "of": n},
        "own_words": [{"participant": p["id"], **w} for p in drawn for w in p["own_words"]],
    }


def main(folder, out):
    os.makedirs(out, exist_ok=True)
    data = build(folder)
    with open(os.path.join(out, "goal_models.json"), "w") as f:
        json.dump(data, f, indent=1)
    for p in data["participants"]:
        what = "; ".join(f"[{c['kind']}] {c['text']}" for c in p.get("changes", [])) or "no change"
        print(f"{p['id']}: {what}" if "check" in p else f"{p['id']}: R1 does not parse")
    print(f"combined: {len(data['combined']['badges'])} distinct changes over {data['combined']['of']} participants")


if __name__ == "__main__":
    main(*sys.argv[1:3])
