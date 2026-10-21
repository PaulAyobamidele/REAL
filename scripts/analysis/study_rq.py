"""The study's evaluation: what participants refined, and which diagnoses they
found unhelpful (RQ: how effective is REAL in helping requirements engineers
validate and refine requirements and domain assumptions?).

    sim_env/bin/python -m scripts.analysis.study_rq <sessions> <out> [--rounds artifacts/study/rounds]

<sessions> is a folder of participant downloads: study_<ID>.zip, the folders they
unzip to, or the admin page's "Download all" zip (a zip of session zips). Writes,
into <out> (never into <sessions>):

  rq_summary.md        the answer to the RQ, per participant and per diagnosis,
                       agreement, fixes with their measured outcome, data quality
  participants.csv     one row per participant
  diagnoses.csv        one row per participant x diagnosis (obstacle or scope item)
  rq.json              everything above, machine-readable

Every number is counted from the participants' own files (decisions.json, R0.dsl,
R1.dsl, log.jsonl). Nothing is imputed: a missing value is reported as missing in
"Data quality", never filled in.
"""
import csv
import io
import json
import math
import os
import sys
import zipfile
from collections import Counter, defaultdict

from scripts.analysis import decisions as decisions_mod
from scripts.analysis.study_goal_models import changes as r_changes
from scripts.redsl import serve

REQUIRED = ("decisions.json", "R0.dsl", "R1.dsl", "log.jsonl")
RATINGS = ("helpful", "partly", "not_helpful")
# the triage paths of one obstacle (domain/triage.ts): who accounts for its failures, and what then
PATHS = ("world", "promise", "car:refine", "car:system", "car:later", "undecided")


# ------------------------------------------------------------------ reading

def _files_of_zip(data, into):
    """Every session inside one zip; a zip of zips (the admin's Download all) is opened too."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        inner = [n for n in z.namelist() if n.endswith(".zip")]
        if inner:
            for n in inner:
                _files_of_zip(z.read(n), into)
            return
        files = {}
        for name in z.namelist():
            if not name.endswith("/"):
                files[os.path.basename(name)] = z.read(name).decode("utf-8")
        into.append(files)


def load_sessions(folder):
    """[(source, {file: text})] for every session found under `folder`."""
    out = []
    for entry in sorted(os.listdir(folder)):
        path = os.path.join(folder, entry)
        found = []
        if entry.endswith(".zip"):
            with open(path, "rb") as f:
                _files_of_zip(f.read(), found)
        elif os.path.isdir(path):
            files = {}
            for root, _, names in os.walk(path):
                for name in names:
                    with open(os.path.join(root, name), encoding="utf-8") as f:
                        files[name] = f.read()
            found.append(files)
        out += [(entry, f) for f in found]
    return out


# ------------------------------------------------------------------ one session

def _minutes(a, b):
    from datetime import datetime
    try:
        t = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))  # noqa: E731
        return round((t(b) - t(a)).total_seconds() / 60, 1)
    except (TypeError, ValueError, AttributeError):
        return None


def _path_of(o):
    """One obstacle's triage path: world (an assumption), promise (a soft goal), or the car's."""
    by = o.get("explained_by")
    if by == "world":
        action = ((o.get("mitigation") or {}).get("action") or "").strip()
        return "promise" if action.startswith("ensuring") else "world"
    if by == "car":
        return f"car:{o.get('resolution')}" if o.get("resolution") in ("refine", "system", "later") else "undecided"
    return "undecided"


def _time_per_step(log):
    """Seconds spent per screen, from step_entered / step_left pairs."""
    from datetime import datetime
    out, open_at = defaultdict(float), {}
    for e in log:
        try:
            t = datetime.fromisoformat(e["time"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if e.get("event") == "step_entered":
            open_at[e.get("screen")] = t
        elif e.get("event") == "step_left" and e.get("screen") in open_at:
            out[e["screen"]] += (t - open_at.pop(e["screen"])).total_seconds()
    return {k: round(v) for k, v in out.items()}


def _screen_name(screen):
    """review/<run>/<n> -> step <n>; the run id is never shown."""
    parts = (screen or "").split("/")
    if parts[0] == "review" and len(parts) >= 3:
        return {"1": "1 requirement", "example": "example", "2": "2 report", "3": "3 failure analysis",
                "4": "4 triage", "5": "5 revision"}.get(parts[2], parts[2])
    return parts[0] or "?"


def analyse_session(source, files):
    """Everything one participant did, plus what is missing or invalid."""
    problems = [f"missing {f}" for f in REQUIRED if f not in files]
    if "decisions.json" not in files:
        return {"source": source, "id": None, "problems": problems}
    doc = json.loads(files["decisions.json"])
    study = doc.get("study") or {}
    pid = study.get("participant") or doc.get("reviewer") or source
    problems += [f"validate: {p}" for p in decisions_mod.validate(doc)]
    for key in ("participant", "expertise", "started_at", "signed_at", "car", "build"):
        if not study.get(key):
            problems.append(f"study.{key} missing")

    # what R1 changes, from the participant's own files (the same comparison as the goal models)
    d_changes, r_changes_, s_changes = [], [], []
    if "R0.dsl" in files and "R1.dsl" in files:
        c0, c1 = serve.check(files["R0.dsl"]), serve.check(files["R1.dsl"])
        if not c1.get("ok"):
            problems.append("R1.dsl does not parse")
        elif c0.get("ok"):
            for c in r_changes(c0["tree"], c1["tree"]):
                {"D": d_changes, "R": r_changes_, "S": s_changes}[c["kind"]].append(c["text"])

    # R1 must be what the project's own refine derives from the decisions (reproducibility)
    if "R0.dsl" in files and "R1.dsl" in files:
        from scripts.analysis import refine
        try:
            derived = refine.apply_changes(files["R0.dsl"], refine.plan_changes(doc, files["R0.dsl"]))
            if derived.strip() != files["R1.dsl"].strip():
                problems.append("R1.dsl differs from what refine derives from decisions.json")
        except ValueError as e:
            problems.append(f"refine cannot derive R1 from decisions.json: {e}")

    obstacles = doc.get("obstacles") or {}
    scope = doc.get("scope") or {}
    assumptions = doc.get("assumptions") or {}
    own_words = [((o.get("mitigation") or {}).get("action") or "")
                 for o in obstacles.values() if o.get("resolution") == "refine"]
    assumption_edits = Counter(a.get("verdict") for a in assumptions.values())
    scope_verdicts = Counter(s.get("verdict") for s in scope.values())

    diagnoses = []
    for kind, items in (("obstacle", obstacles), ("scope", scope)):
        for did, item in items.items():
            h = item.get("helpful") or {}
            if not h.get("rating"):
                problems.append(f"{did}: no helpfulness rating")
            diagnoses.append({
                "participant": pid, "kind": kind, "diagnosis": did,
                "decision": _path_of(item) if kind == "obstacle" else (item.get("verdict") or "undecided"),
                "rating": h.get("rating"), "why": h.get("why"),
                "reason": item.get("reason"),
            })

    log = []
    if "log.jsonl" in files:
        for line in files["log.jsonl"].splitlines():
            try:
                log.append(json.loads(line))
            except json.JSONDecodeError:
                problems.append("log.jsonl has an unreadable line")
        events = Counter(e.get("event") for e in log)
        if not events.get("session_end"):
            problems.append("log has no session_end")
        # the log's last triage value of each obstacle must be the one in the file
        last = {}
        for e in log:
            if e.get("event") == "obstacle_explained" and isinstance(e.get("new"), dict):
                last[e.get("target")] = e["new"].get("by")
        for oid, o in obstacles.items():
            if oid in last and last[oid] != o.get("explained_by"):
                problems.append(f"{oid}: logged triage {last[oid]!r} differs from the file's {o.get('explained_by')!r}")
    else:
        events = Counter()

    clicks = [e.get("target") or "" for e in log if e.get("event") == "clicked"]
    return {
        "source": source,
        "id": pid,
        "expertise": study.get("expertise"),
        "car": study.get("car"),
        "build": study.get("build"),
        "signed_at": study.get("signed_at"),
        "minutes": _minutes(study.get("started_at"), study.get("signed_at")),
        # the RQ's counts
        "requirements_refined": len(r_changes_) + len([w for w in own_words if w.strip()]),
        "promise_lines_added": r_changes_,
        "refined_in_own_words": own_words,
        "assumptions_refined": len(d_changes) + sum(assumption_edits[v] for v in ("tighten", "loosen", "drop")),
        "assumption_lines_added": d_changes,
        "assumption_verdicts": dict(assumption_edits),
        "system_changes": s_changes,
        "test_fixes": scope_verdicts.get("in_scope", 0) + scope_verdicts.get("scenario_defect", 0),
        "deferred": sum(1 for o in obstacles.values() if o.get("resolution") == "later"),
        "ratings": dict(Counter(d["rating"] for d in diagnoses if d["rating"])),
        "unhelpful": [d["diagnosis"] for d in diagnoses if d["rating"] == "not_helpful"],
        "diagnoses": diagnoses,
        # how the evidence was used
        "seconds_per_step": {_screen_name(k): v for k, v in _time_per_step(log).items()},
        "evidence": {
            "video_played": events.get("video_played", 0),
            "runs_switched": sum(1 for c in clicks if "Run " in c and "·" in c),
            "obstacles_selected": sum(1 for c in clicks if c.startswith("button: ") and c[8:] in obstacles),
            "typical_runs_opened": sum(1 for c in clicks if "typical run" in c),
            "tours_skipped": sum(1 for e in log if e.get("event") == "tour_closed"
                                 and (e.get("new") or {}).get("skipped")),
        },
        "problems": problems,
    }


# ------------------------------------------------------------------ across participants

def fleiss_kappa(table):
    """Fleiss' kappa for items x categories counts (each row sums to the raters per item)."""
    rows = [r for r in table if sum(r) > 1]
    if len(rows) < 2:
        return None
    n = sum(rows[0])
    if any(sum(r) != n for r in rows):
        return None  # unequal raters per item: not defined here
    N, k = len(rows), len(rows[0])
    p = [sum(r[j] for r in rows) / (N * n) for j in range(k)]
    P = [(sum(c * c for c in r) - n) / (n * (n - 1)) for r in rows]
    pbar, pe = sum(P) / N, sum(x * x for x in p)
    return None if math.isclose(pe, 1.0) else round((pbar - pe) / (1 - pe), 3)


def measured_outcomes(rounds_dir):
    """The study cars' measured results (rounds/Cn/judged_v2), for each participant's chosen car."""
    out = {}
    for car in ("C1", "C2", "C3", "C4"):
        path = os.path.join(rounds_dir, car, "judged_v2", "analysis_report.json")
        if os.path.exists(path):
            with open(path) as f:
                fm = json.load(f)["failure_model"]
            out[car] = {"failures": fm.get("failures"), "encounters": fm.get("n_encounters"),
                        "passes": fm.get("passes")}
    return out


def analyse(folder, rounds_dir):
    loaded = load_sessions(folder)
    sessions = [analyse_session(src, files) for src, files in loaded]
    # one session per participant: the latest signed one; earlier copies are reported, not counted
    by_id = defaultdict(list)
    for s in sessions:
        by_id[s.get("id")].append(s)
    kept, duplicates = [], []
    for pid, group in by_id.items():
        group.sort(key=lambda s: s.get("signed_at") or "")
        kept.append(group[-1])
        duplicates += [(pid, s["source"]) for s in group[:-1]]
    kept = [s for s in kept if s.get("id")]

    # per diagnosis: the decisions and ratings across participants
    per_diag = defaultdict(lambda: {"decisions": Counter(), "ratings": Counter(), "why": []})
    for s in kept:
        for d in s["diagnoses"]:
            pd = per_diag[(d["kind"], d["diagnosis"])]
            pd["decisions"][d["decision"]] += 1
            if d["rating"]:
                pd["ratings"][d["rating"]] += 1
            if d["why"]:
                pd["why"].append(f'{s["id"]}: {d["why"]}')
    obstacle_rows = [[v["decisions"][p] for p in PATHS] for (k, _), v in per_diag.items() if k == "obstacle"]
    outcomes = measured_outcomes(rounds_dir)
    return {
        "participants": kept,
        "duplicates": duplicates,
        "per_diagnosis": {f"{k}:{d}": {"decisions": dict(v["decisions"]), "ratings": dict(v["ratings"]),
                                        "why": v["why"]} for (k, d), v in per_diag.items()},
        "agreement": {"fleiss_kappa_triage": fleiss_kappa(obstacle_rows), "categories": PATHS},
        "outcomes": outcomes,
        "totals": {
            "participants": len(kept),
            "requirements_refined": sum(s["requirements_refined"] for s in kept),
            "assumptions_refined": sum(s["assumptions_refined"] for s in kept),
            "diagnoses_rated": sum(sum(s["ratings"].values()) for s in kept),
            "diagnoses_unhelpful": sum(len(s["unhelpful"]) for s in kept),
            "sessions_with_problems": sum(1 for s in kept if s["problems"]),
        },
    }


# ------------------------------------------------------------------ writing

def _md(result):
    t = result["totals"]
    lines = ["# Study evaluation: what participants refined, and which diagnoses helped", "",
             f"{t['participants']} participant(s). Requirements refined: {t['requirements_refined']}. "
             f"Domain assumptions refined: {t['assumptions_refined']}. Diagnoses rated: "
             f"{t['diagnoses_rated']}, of which not helpful: {t['diagnoses_unhelpful']}.", "",
             "## Per participant", "",
             "| Participant | Expertise | Minutes | Requirements refined | Assumptions refined | "
             "Car fixes | Test fixes | Deferred | Helpful / partly / not | Car | Failures with that car |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for s in result["participants"]:
        r, o = s["ratings"], result["outcomes"].get(s["car"] or "", {})
        out = f"{o['failures']} of {o['encounters']}" if o else "?"
        lines.append(f"| {s['id']} | {s['expertise']} | {s['minutes']} | {s['requirements_refined']} | "
                     f"{s['assumptions_refined']} | {len(s['system_changes'])} | {s['test_fixes']} | "
                     f"{s['deferred']} | {r.get('helpful', 0)} / {r.get('partly', 0)} / "
                     f"{r.get('not_helpful', 0)} | {s['car']} | {out} |")
    lines += ["", "## Per diagnosis", "",
              "| Diagnosis | Decisions | Helpful | Partly | Not helpful | Why not (participants' words) |",
              "|---|---|---|---|---|---|"]
    for did, v in sorted(result["per_diagnosis"].items()):
        dec = ", ".join(f"{k} {n}" for k, n in sorted(v["decisions"].items()))
        r = v["ratings"]
        lines.append(f"| {did} | {dec} | {r.get('helpful', 0)} | {r.get('partly', 0)} | "
                     f"{r.get('not_helpful', 0)} | {'; '.join(v['why']) or '-'} |")
    k = result["agreement"]["fleiss_kappa_triage"]
    lines += ["", "## Agreement", "",
              f"Fleiss' kappa over the obstacles' triage paths ({', '.join(PATHS)}): "
              + (f"{k}" if k is not None else "not defined (fewer than two participants or obstacles)") + ".",
              "", "## The cars participants chose, with their measured results", "",
              "| Car | Chosen by | Failures counted against the car |", "|---|---|---|"]
    chosen = Counter(s["car"] for s in result["participants"])
    for car, o in result["outcomes"].items():
        lines.append(f"| {car} | {chosen.get(car, 0)} | {o['failures']} of {o['encounters']} |")
    lines += ["", "## Data quality", ""]
    issues = [(s["id"], p) for s in result["participants"] for p in s["problems"]]
    if not issues and not result["duplicates"]:
        lines.append("No problem found: every file present and valid, every diagnosis rated.")
    for pid, p in issues:
        lines.append(f"- {pid}: {p}")
    for pid, src in result["duplicates"]:
        lines.append(f"- {pid}: an earlier copy ({src}) is not counted; the latest is")
    return "\n".join(lines) + "\n"


def write(result, out):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "rq.json"), "w") as f:
        json.dump(result, f, indent=1, default=list)
    with open(os.path.join(out, "rq_summary.md"), "w") as f:
        f.write(_md(result))
    cols = ["id", "expertise", "car", "build", "minutes", "requirements_refined", "assumptions_refined",
            "test_fixes", "deferred"]
    with open(os.path.join(out, "participants.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols + ["system_changes", "helpful", "partly", "not_helpful", "problems"])
        for s in result["participants"]:
            r = s["ratings"]
            w.writerow([s.get(c) for c in cols] + ["; ".join(s["system_changes"]), r.get("helpful", 0),
                                                    r.get("partly", 0), r.get("not_helpful", 0),
                                                    "; ".join(s["problems"])])
    with open(os.path.join(out, "diagnoses.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["participant", "kind", "diagnosis", "decision", "rating", "why", "reason"])
        w.writeheader()
        for s in result["participants"]:
            w.writerows(s["diagnoses"])


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    rounds = argv[argv.index("--rounds") + 1] if "--rounds" in argv else "artifacts/study/rounds"
    folder, out = argv[0], argv[1]
    if os.path.abspath(out).startswith(os.path.abspath(folder) + os.sep):
        raise SystemExit("write the results outside the sessions folder")
    result = analyse(folder, rounds)
    write(result, out)
    print(_md(result))


if __name__ == "__main__":
    main(sys.argv[1:])
