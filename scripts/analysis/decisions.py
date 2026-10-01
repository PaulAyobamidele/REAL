"""decisions.json - the human's recorded decisions for one round of the loop.

This file is THE artefact of the review step (REAL stage "Human", Notes.md
Sec. 8.7). The terminal walk-through (scripts/analysis/review.py) and the
Streamlit page (pages/4_review.py) are just two ways to produce it; the
requirement writer (scripts/analysis/refine.py) and the next round's
provenance read it. Nothing here applies anything - it records.

Shape (schema_version 1):

{
  "schema_version": 1,
  "run_id": "882f...", "round": 2, "parent_run_id": "35ac...",
  "reviewer": "name", "decided_at": "ISO-8601",
  "obstacles": {
    "<obstacle id>": {
      "verdict": "accept" | "rename" | "reject" | null,
      "renamed_to": "..." | null,
      "status": "new" | "persisting" | "resolved" | "absent",   # vs the previous round
      "tool_verdict": "supported" | "not_supported" | "insufficient_data",
      "evidence": "54 of 62 passes (87%)",
      "reason": "free text",
      "mitigation": {"layer": "system"|"model"|"data"|"requirement"|"scenario",
                     "action": "free text"} | null,
      "options": [{"layer": ..., "action": ...}, ...]     # the menu offered
    }
  },
  "scope": {
    "<group id>": {"verdict": "out_of_scope" | "in_scope" | "scenario_defect" | null,
                   "kind": "rule" | "artefact", "evidence": "...", "reason": "..."}
  },
  "assumptions": {            # optional (added 2026-10-01, roadmap M1.5)
    "<assumption text>": {"verdict": "keep" | "tighten" | "loosen" | "drop" | null,
                          "new_text": "..." | null,    # required for tighten / loosen
                          "tool_verdict": "load-bearing" | "untested" | ... | null,
                          "kind": "scenario" | "run" | "free_text" | "rejected",
                          "evidence": "...", "reason": "..."}
  },
  "added_assumptions": [ {"text": "...", "reason": "..."} ],
  "requirement_changes": [ {"kind": "S"|"R"|"D"|"T", "text": "...", "from": "<obstacle id>"} ]
}

Assumptions (D): keep = the assumption stays as written; tighten / loosen =
replace it with new_text (narrower / wider); drop = remove it. An assumption
may only describe the world, never the car under test - validate() refuses
new or added text about the car.

Verdict meanings: accept = a real obstacle, act on it; rename = real but the
tool's name is wrong; reject = noise or not an obstacle; defer = a decision
that there is not enough evidence this round (revisit next round). Scope: out_of_scope =
the rule/assumption is right, state it in the requirement; in_scope = the
scenario IS realistic, drop the rule; scenario_defect = the test itself is
wrong (fix the template, re-measure) - the paper's four layers have no place
for this, so it is a fifth category here.
"""

import json
import os
from datetime import datetime, timezone

SCHEMA_VERSION = 1
FILENAME = "decisions.json"

OBSTACLE_VERDICTS = ("accept", "rename", "reject", "defer")   # defer = decided: not enough evidence yet
SCOPE_VERDICTS = ("out_of_scope", "in_scope", "scenario_defect")
STATUSES = ("new", "persisting", "resolved", "absent")
LAYERS = ("data", "model", "system", "requirement", "scenario")
ASSUMPTION_VERDICTS = ("keep", "tighten", "loosen", "drop")
CHANGE_KINDS = ("S", "R", "D", "T")   # S: specification (the car) / R: requirement (the promise) / D: domain assumption / T: test or scope fix


def obstacle_status(current, previous):
    """Status of an obstacle relative to the previous round's tool verdict.
    `previous` is None when there is no earlier round."""
    now = current == "supported"
    before = previous == "supported"
    if now and before:
        return "persisting"
    if now and not before:
        return "new"
    if before and not now:
        return "resolved"
    return "absent"


def _evidence_text(o):
    ev = o.get("evidence") or {}
    if "passes" in ev:
        return f"{ev['count']} of {ev['passes']} passes ({ev['share']:.0%})" if ev.get("share") is not None else "no passes"
    if "failures" in ev and "count" in ev:
        return f"{ev['count']} of {ev['failures']} failures ({ev['share']:.0%})" if ev.get("share") is not None else "no failures"
    if "failure_rate" in ev:
        return (f"failure rate {ev['failure_rate']:.0%} with vs {ev['failure_rate_others']:.0%} without "
                f"(effect {ev['effect']:+.0%}, n={ev['n']})")
    return "no data"


def _options(o):
    return [{"layer": layer, "action": text}
            for layer, text in (o.get("mitigations") or {}).items() if text]


def _assumption_evidence(a):
    if a["kind"] == "free_text":
        return "free text - not checked automatically"
    if a["kind"] == "rejected":
        return f"rejected by the tool: {a.get('message')}"
    text = f"held {a.get('held', 0)}, broken {a.get('broken', 0)}"
    if a.get("not_measured"):
        text += f", not measured {a['not_measured']}"
    rh, rb = a.get("rate_held"), a.get("rate_broken")
    if rh is not None or rb is not None:
        fmt = lambda x: "n/a" if x is None else f"{x:.0%}"
        text += f"; failure rate over encounters held {fmt(rh)} / broken {fmt(rb)}"
    return text


def _assumption_only(reason):
    parts = [p.strip() for p in str(reason).split(",") if p.strip()]
    return bool(parts) and all(p.startswith("assumption: ") for p in parts)


def from_analysis(analysis, previous_analysis=None, reviewer=None, round_no=None,
                  artefacts=None):
    """A decisions document with every field the tool can fill in and every
    human field left null. `artefacts` = scenario-artefact candidates
    (obstacles.SCENARIO_ARTEFACTS) to list under scope."""
    prev = {o["id"]: o["verdict"] for o in (previous_analysis or {}).get("obstacles", [])}
    doc = {
        "schema_version": SCHEMA_VERSION,
        "run_id": analysis["run_id"],
        "round": round_no,
        "parent_run_id": (previous_analysis or {}).get("run_id"),
        "reviewer": reviewer,
        "decided_at": None,
        "obstacles": {},
        "scope": {},
        "assumptions": {},
        "added_assumptions": [],
        "requirement_changes": [],
    }
    for o in analysis["obstacles"]:
        doc["obstacles"][o["id"]] = {
            "verdict": None,
            "renamed_to": None,
            "status": obstacle_status(o["verdict"], prev.get(o["id"])),
            "tool_verdict": o["verdict"],
            "evidence": _evidence_text(o),
            "reason": None,
            "mitigation": None,
            "options": _options(o),
        }
    rules_by_name = {r["name"]: r for r in analysis["admissibility"].get("rules", [])}
    for s in analysis["admissibility"].get("spurious", []):
        if _assumption_only(s["rule"]):
            continue   # reviewed once, as assumption items below
        rule = rules_by_name.get(s["rule"], {})
        doc["scope"][f"rule:{s['rule']}"] = {
            "verdict": None, "kind": "rule",
            "evidence": f"{s['n']} simulations set aside ({s['failures']} failed)",
            "rule": {k: rule.get(k) for k in ("param", "op", "value", "source")} if rule else None,
            "reason": None,
        }
    for a in analysis["admissibility"].get("assumptions", []):
        doc["assumptions"][a["text"]] = {
            "verdict": None, "new_text": None,
            "tool_verdict": a.get("verdict"), "kind": a["kind"],
            "evidence": _assumption_evidence(a), "reason": None,
        }
    fm = analysis["failure_model"]
    for a in artefacts or []:
        value = fm.get(a["metric"])
        doc["scope"][f"artefact:{a['id']}"] = {
            "verdict": None, "kind": "artefact",
            "evidence": f"{a['metric']} = {value}",
            "description": a["description"],
            "suggested_fix": a["fix"],
            "reason": None,
        }
    return doc


def validate(doc):
    """Return a list of problems (empty = valid). Nulls are allowed (an
    unfinished review); wrong values are not."""
    problems = []
    if doc.get("schema_version") != SCHEMA_VERSION:
        problems.append(f"schema_version must be {SCHEMA_VERSION}")
    if not doc.get("run_id"):
        problems.append("run_id missing")
    for oid, o in (doc.get("obstacles") or {}).items():
        v = o.get("verdict")
        if v is not None and v not in OBSTACLE_VERDICTS:
            problems.append(f"obstacle {oid}: verdict {v!r} not in {OBSTACLE_VERDICTS}")
        if v == "rename" and not o.get("renamed_to"):
            problems.append(f"obstacle {oid}: rename needs renamed_to")
        if o.get("status") not in STATUSES:
            problems.append(f"obstacle {oid}: status {o.get('status')!r} not in {STATUSES}")
        m = o.get("mitigation")
        if m is not None:
            if m.get("layer") not in LAYERS:
                problems.append(f"obstacle {oid}: mitigation layer {m.get('layer')!r} not in {LAYERS}")
            if not m.get("action"):
                problems.append(f"obstacle {oid}: mitigation needs an action")
        if v in ("reject", "defer") and m is not None:
            problems.append(f"obstacle {oid}: a {v}ed obstacle cannot carry a mitigation")
    for sid, s in (doc.get("scope") or {}).items():
        v = s.get("verdict")
        if v is not None and v not in SCOPE_VERDICTS:
            problems.append(f"scope {sid}: verdict {v!r} not in {SCOPE_VERDICTS}")
    from scripts.analysis.admissibility import parse_assumption

    def about_the_car(t):
        item = parse_assumption(t)
        return item["kind"] == "rejected" and (item["quantity"] or "").startswith("ego")

    for text, a in (doc.get("assumptions") or {}).items():
        v = a.get("verdict")
        if v is not None and v not in ASSUMPTION_VERDICTS:
            problems.append(f"assumption {text!r}: verdict {v!r} not in {ASSUMPTION_VERDICTS}")
        if v in ("tighten", "loosen") and not a.get("new_text"):
            problems.append(f"assumption {text!r}: {v} needs new_text")
        if v in ("tighten", "loosen") and a.get("new_text") and about_the_car(a["new_text"]):
            problems.append(f"assumption {text!r}: new_text is about the car under test")
    for i, added in enumerate(doc.get("added_assumptions") or []):
        t = str(added.get("text") or "").strip()
        if not t:
            problems.append(f"added_assumptions[{i}]: text missing")
        elif about_the_car(t):
            problems.append(f"added_assumptions[{i}]: {t!r} is about the car under test")
    for i, ch in enumerate(doc.get("requirement_changes") or []):
        if ch.get("kind") not in CHANGE_KINDS:
            problems.append(f"requirement_changes[{i}]: kind {ch.get('kind')!r} not in {CHANGE_KINDS}")
        if not ch.get("text"):
            problems.append(f"requirement_changes[{i}]: text missing")
    return problems


def is_complete(doc):
    """Every obstacle and scope item has a verdict; accepted/renamed obstacles
    that are currently supported have a mitigation."""
    for o in doc["obstacles"].values():
        if o.get("verdict") is None:
            return False
        if o["verdict"] in ("accept", "rename") and o.get("tool_verdict") == "supported" \
                and o.get("status") in ("new", "persisting") and o.get("mitigation") is None:
            return False
    if not all(a.get("verdict") is not None for a in (doc.get("assumptions") or {}).values()):
        return False
    return all(s.get("verdict") is not None for s in doc["scope"].values())


def save(doc, run_dir):
    problems = validate(doc)
    if problems:
        raise ValueError("decisions.json invalid: " + "; ".join(problems))
    doc = dict(doc, decided_at=doc.get("decided_at") or datetime.now(timezone.utc).isoformat())
    path = os.path.join(run_dir, FILENAME)
    with open(path, "w") as f:
        json.dump(doc, f, indent=2)
    return path


def load(run_dir):
    path = run_dir if run_dir.endswith(".json") else os.path.join(run_dir, FILENAME)
    with open(path) as f:
        doc = json.load(f)
    problems = validate(doc)
    if problems:
        raise ValueError(f"{path} invalid: " + "; ".join(problems))
    return doc
