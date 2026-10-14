"""Authoring helper for the review interface: the project's own parser and
the lists the requirement form offers, over a tiny local HTTP service.

The review screens read files and need no server; writing a requirement
does, because the gate is the Python parser (scripts/redsl/grammar.py) and
the valid choices live in the code. Nothing here is a second parser or a
second list - every value is read from where the pipeline reads it:

    temporal operators   the grammar's `temporal_op` rule (grammar.py)
    perception modules   the weights files in settings.model_dir (*.pt),
                         as util.resolve_yolo_model resolves them
    braking modules      the keys of util.BRAKING_BEHAVIOURS
    roles                which task names the executor looks the modules up
                         by (grammar.get_perception_model, api_app.py)
    assumption quantities  admissibility.QUANTITIES (no `ego*`: an assumption
                         is about the world, never the car)
    soft-goal quantities soft_goals.QUANTITIES
    comparison operators admissibility.ASSUMPTION_RE
    scenario vocabulary  constraints.CONTROLLED_VOCAB (the words that steer
                         which scenarios are generated)
    examples             docs/examples/R_baseline.dsl, parsed

util.py is read as source (ast), not imported: importing it loads Scenic,
VerifAI and MLflow, which an authoring form must not need.

Endpoints (JSON, localhost only):
    GET  /authoring/catalog
    POST /authoring/check   {"text": "<dsl>"} -> parse result with line and
                            column on failure, the goal tree, every assumption
                            and soft goal classified, the scenario words that
                            will steer generation, and the modules resolved.
    POST /authoring/match   {"text": "<dsl>"} -> the runs in artifacts/runs that
                            ran exactly this requirement (equal goal trees,
                            so comments and layout do not count), with their
                            headline numbers.
    POST /authoring/run     {"text", "name", "options"} -> Run Test: the text must parse;
                            options: search, trials, population, generations,
                            grammar, scenario_file, time, parent_run_id, round
                            (cluster_jobs.options_from); checked on the laptop
                            first (scripts/redsl/preflight.py);
                            saved as requirements/<name>, submitted to the
                            cluster over the reviewer's ssh session
                            (scripts/redsl/cluster_jobs.py)
    GET  /authoring/jobs[/<id>]  submitted jobs; one job's state and progress
    GET  /authoring/lists   scenario lists a list run can use (Run Test's options)
    POST /authoring/run/check-laptop  {"text", "options"} -> Run Test's checks on this
                            machine (options, modules, scenes); reused by /run
                            for 10 minutes
    POST /authoring/run/check-cluster  -> Run Test's checks over ssh (session, code)
    POST /authoring/jobs/<id>/fetch  pull an ended job's run (all of it) and analyse it
    POST /authoring/jobs/<id>/partial  pull a running job's results so far, analyse them (PARTIAL)
    GET  /authoring/runs/index.json and /authoring/runs/<run>/<file>
                            (a run without a final report serves its newest
                            partial one, labelled PARTIAL inside)
                            artifacts/runs served read-only as a workspace
                            (the layout ui/scripts/make-workspace-index.mjs
                            writes), so a browser without a folder picker can
                            open the project's runs.

    python -m scripts.redsl.serve [--port 8765]
"""

import argparse
import ast
import json
import os
import re
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from lark.exceptions import UnexpectedInput

from real_config import settings
from scripts.analysis import admissibility, soft_goals
from scripts.evolve.constraints import CONTROLLED_VOCAB, extract_constraints
from scripts.redsl import cluster_jobs
from scripts.redsl.grammar import DSL

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UTIL = os.path.join(ROOT, "scripts", "simulations", "util.py")
EXAMPLE = os.path.join(ROOT, "docs", "examples", "R_baseline.dsl")
DEFAULT_PORT = 8765

# The executor finds each module by a task name (grammar.get_perception_model,
# api_app.py): a module on any other task is never run.
PERCEPTION_TASK = "Detect Pedestrian"
BRAKING_TASKS = ("Apply Brakes", "Brake")

NOT_COVERED = [
    "several top-level goals in one file",
    '"parallely" between sub-goals (the form writes "followed by")',
    '"triggering" between operations',
    "a sub-goal refined into further sub-goals",
    '"&" between objectives',
    '"|" in a condition',
]


def _util_constants():
    """BRAKING_BEHAVIOURS keys and the two defaults, read from util.py's source."""
    with open(UTIL) as f:
        tree = ast.parse(f.read())
    out = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name == "BRAKING_BEHAVIOURS" and isinstance(node.value, ast.Dict):
                out[name] = [k.value for k in node.value.keys if isinstance(k, ast.Constant)]
            elif name in ("DEFAULT_BRAKING_MODE", "DEFAULT_YOLO_MODEL") and isinstance(node.value, ast.Constant):
                out[name] = node.value.value
    return out


def _temporal_ops():
    rule = re.search(r"!?temporal_op\s*:(.*?)\n\s*\n", DSL(None).grammar, re.S)
    return re.findall(r'"([A-Z]+)"', rule.group(1)) if rule else []


def _operators():
    group = re.search(r"\(([^()]*<=[^()]*)\)", admissibility.ASSUMPTION_RE.pattern)
    return group.group(1).split("|") if group else []


def _rel(path):
    """A path as shown to the author: relative to the repository when inside it."""
    path = os.path.abspath(path)
    return os.path.relpath(path, ROOT) if path.startswith(ROOT + os.sep) else os.path.basename(path)


def _perception_modules():
    model_dir = settings.model_dir
    if not os.path.isdir(model_dir):
        return []
    return sorted(f[:-3] for f in os.listdir(model_dir) if f.endswith(".pt"))


def _example_fields():
    with open(EXAMPLE) as f:
        dsl = DSL(f.read())
    tree = dsl.get_goal_tree() or {}
    goals = (tree.get("refinement") or {}).get("goals") or []
    ops = [op for g in goals for op in g.get("operations") or []]
    with_condition = next((op for op in ops if op.get("condition")), {})
    free_assumption = next((a["text"] for a in admissibility.parse_assumptions(tree.get("assumptions"))
                            if a["kind"] == "free_text"), None)
    free_soft_goal = next((s["text"] for s in map(soft_goals.parse_soft_goal, tree.get("soft_goals") or [])
                           if s["kind"] == "free_text"), None)
    first = goals[0] if goals else {}
    first_op = (first.get("operations") or [{}])[0]

    def role_of(op):
        tasks = op.get("tasks") or []
        return "perception" if PERCEPTION_TASK in tasks else "braking" if set(tasks) & set(BRAKING_TASKS) else None

    by_role = {}
    for g in goals:
        for op in g.get("operations") or []:
            role = role_of(op)
            if role and role not in by_role:
                key = PERCEPTION_TASK if role == "perception" else BRAKING_TASKS[0]
                by_role[role] = {
                    "sub_goal": g.get("objective"), "agent": g.get("agent"),
                    "extra_task": next((t for t in op.get("tasks") or [] if t != key), None),
                    "condition": op.get("condition"),
                    "input": (op.get("inputs") or [None])[0], "output": (op.get("outputs") or [None])[0],
                }
    return {
        "source": os.path.relpath(EXAMPLE, ROOT),
        "goal": tree.get("objective"),
        "sub_goal": first.get("objective"),
        "agent": first.get("agent"),
        "task": (first_op.get("tasks") or [None])[0],
        "extra_task": next((t for op in ops for t in op.get("tasks") or []
                            if t not in (PERCEPTION_TASK,) + BRAKING_TASKS), None),
        "condition": with_condition.get("condition"),
        "input": (first_op.get("inputs") or [None])[0],
        "output": (first_op.get("outputs") or [None])[0],
        "scenario": tree.get("scenario"),
        "free_assumption": free_assumption,
        "free_soft_goal": free_soft_goal,
        "by_role": by_role,
    }


EXAMPLES_DIR = os.path.join(ROOT, "docs", "examples")


def _suggestions():
    """What the requirements in docs/examples/ already say, gathered for the
    editor's suggestions: real wording, never invented. Per role where the
    executor distinguishes them."""
    out = {"goal": [], "scenario": [], "free_assumption": [], "free_soft_goal": [],
           "perception": {"sub_goal": [], "agent": [], "input": [], "output": [], "condition": [], "task": []},
           "braking": {"sub_goal": [], "agent": [], "input": [], "output": [], "condition": [], "task": []}}

    def add(bucket, value):
        if value and value not in bucket:
            bucket.append(value)

    for name in sorted(os.listdir(EXAMPLES_DIR)) if os.path.isdir(EXAMPLES_DIR) else []:
        if not name.endswith(".dsl"):
            continue
        with open(os.path.join(EXAMPLES_DIR, name)) as f:
            dsl = DSL(f.read())
        if dsl.parse_tree is None:
            continue
        tree = dsl.get_goal_tree() or {}
        add(out["goal"], tree.get("objective"))
        add(out["scenario"], tree.get("scenario"))
        for a in admissibility.parse_assumptions(tree.get("assumptions")):
            if a["kind"] == "free_text":
                add(out["free_assumption"], a["text"])
        for sg in map(soft_goals.parse_soft_goal, tree.get("soft_goals") or []):
            if sg["kind"] == "free_text":
                add(out["free_soft_goal"], sg["text"])
        for g in (tree.get("refinement") or {}).get("goals") or []:
            for op in g.get("operations") or []:
                tasks = op.get("tasks") or []
                role = "perception" if PERCEPTION_TASK in tasks else "braking" if set(tasks) & set(BRAKING_TASKS) else None
                if not role:
                    continue
                r = out[role]
                add(r["sub_goal"], g.get("objective"))
                add(r["agent"], g.get("agent"))
                add(r["condition"], op.get("condition"))
                for t in tasks:
                    if t != PERCEPTION_TASK and t not in BRAKING_TASKS:
                        add(r["task"], t)
                for x in op.get("inputs") or []:
                    add(r["input"], x)
                for x in op.get("outputs") or []:
                    add(r["output"], x)
    return out


def catalog():
    util = _util_constants()
    quantities = [
        dict(name=name, level=q["level"], unit=q["unit"], source=q["source"], available=q["available"])
        for name, q in admissibility.QUANTITIES.items() if not name.startswith("ego")
    ]
    return {
        "temporal_ops": _temporal_ops(),
        "operators": _operators(),
        "roles": {
            "perception": {"task": PERCEPTION_TASK, "modules": _perception_modules(),
                           "default": util.get("DEFAULT_YOLO_MODEL"),
                           "source": f"weights in {_rel(settings.model_dir)}/"},
            "braking": {"task": BRAKING_TASKS[0], "modules": util.get("BRAKING_BEHAVIOURS", []),
                        "default": util.get("DEFAULT_BRAKING_MODE"),
                        "source": "BRAKING_BEHAVIOURS in scripts/simulations/util.py"},
        },
        "assumption_quantities": quantities,
        "soft_goal_quantities": [{"name": k, "meaning": v} for k, v in soft_goals.QUANTITIES.items()],
        "scenario_vocab": CONTROLLED_VOCAB,
        "examples": _example_fields(),
        "suggestions": _suggestions(),
        "not_covered": NOT_COVERED,
    }


RUNS_DIR = os.path.join(settings.artifacts_dir, "runs")
# The files the review interface reads; kept equal to TOP_LEVEL in
# ui/scripts/make-workspace-index.mjs.
TOP_LEVEL = ["run_meta.json", "analysis_report.json", "analysis_report.md", "cluster_map.json",
             "simulations.csv", "scenarios.csv", "decisions.json", "R0.dsl", "R1.dsl",
             "requirement_diff.md", "best_scenario_h264.mp4", "best_scenario.mp4"]
CONTENT_TYPES = {".json": "application/json", ".csv": "text/csv", ".md": "text/markdown",
                 ".dsl": "text/plain", ".mp4": "video/mp4", ".png": "image/png"}


def _partial_folder(run_dir):
    """partial/after_<n>_of_<N> named by partial/latest.json, while the run has no final report."""
    try:
        with open(os.path.join(run_dir, "partial", "latest.json")) as f:
            folder = os.path.join(run_dir, json.load(f)["folder"])
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return folder if os.path.isfile(os.path.join(folder, "analysis_report.json")) else None


# scenario lists a list run can use (Run Test's options): folders searched, and
# what a line must look like to count as a scenario
LIST_FOLDERS = ("infra/hpc/smoke", "requirements/lists", "docs/examples")


def scenario_lists(root=None):
    """The .txt files under LIST_FOLDERS whose lines are scenarios (comments aside)."""
    root = root or ROOT
    out = []
    for folder in LIST_FOLDERS:
        d = os.path.join(root, folder)
        for name in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if not name.endswith(".txt"):
                continue
            with open(os.path.join(d, name)) as f:
                lines = [l.strip() for l in f if l.strip() and not l.startswith("#")]
            if lines and all("{ pedestrian" in l or "{pedestrian" in l for l in lines):
                out.append({"path": f"{folder}/{name}", "scenarios": len(lines)})
    return out


def _round_files(run_dir):
    files = [f for f in TOP_LEVEL if os.path.isfile(os.path.join(run_dir, f))]
    if "analysis_report.json" not in files and _partial_folder(run_dir):
        files += ["analysis_report.json", "analysis_report.md"]     # served from the newest partial
    traces = os.path.join(run_dir, "traces")
    if os.path.isdir(traces):
        files += [f"traces/{t}" for t in os.listdir(traces) if t.endswith(".json")]
    frames = os.path.join(run_dir, "frames")
    if os.path.isdir(frames):
        for sensor in os.listdir(frames):
            d = os.path.join(frames, sensor)
            if os.path.isdir(d):
                files += [f"frames/{sensor}/{f}" for f in os.listdir(d) if f.endswith(".png")]
    return sorted(files)


def runs_index(runs_dir=None):
    """artifacts/runs as a workspace index (schema of make-workspace-index.mjs)."""
    runs_dir = runs_dir or RUNS_DIR
    rounds, ignored = [], []
    for name in sorted(os.listdir(runs_dir)) if os.path.isdir(runs_dir) else []:
        d = os.path.join(runs_dir, name)
        if not os.path.isdir(d):
            continue
        if os.path.isfile(os.path.join(d, "run_meta.json")):
            rounds.append({"dir": name, "files": _round_files(d)})
        else:
            ignored.append(name)
    return {"schema_version": 1, "label": f"Project runs ({_rel(runs_dir)})", "example": False,
            "rounds": rounds, "ignored": ignored}


_TREE_CACHE = {}


def _tree_of(text):
    if text not in _TREE_CACHE:
        dsl = DSL(text)
        _TREE_CACHE[text] = json.dumps(dsl.get_goal_tree(), sort_keys=True) if dsl.parse_tree else None
    return _TREE_CACHE[text]


def match(text, runs_dir=None):
    """The runs whose requirement parses to the same goal tree as `text`."""
    runs_dir = runs_dir or RUNS_DIR
    target = _tree_of(text)
    out, searched = [], 0
    if target is None or not os.path.isdir(runs_dir):
        return {"ok": target is not None, "searched": 0, "matches": []}
    for name in sorted(os.listdir(runs_dir)):
        meta_path = os.path.join(runs_dir, name, "run_meta.json")
        if not os.path.isfile(meta_path):
            continue
        searched += 1
        try:
            with open(meta_path) as f:
                meta = json.load(f)
        except (OSError, ValueError):
            continue
        requirement = meta.get("requirement")
        if not requirement or _tree_of(requirement) != target:
            continue
        fm = {}
        report = os.path.join(runs_dir, name, "analysis_report.json")
        if os.path.isfile(report):
            try:
                with open(report) as f:
                    fm = json.load(f).get("failure_model") or {}
            except (OSError, ValueError):
                pass
        out.append({"run_id": name, "mode": meta.get("mode"), "created_at": meta.get("created_at"),
                    "status": meta.get("status"), "system_under_test": meta.get("system_under_test"),
                    "analysed": bool(fm),
                    "simulations": fm.get("n_simulations"), "failures": fm.get("failures"),
                    "failure_rate": fm.get("failure_rate"), "stalled": fm.get("passed_stalled")})
    out.sort(key=lambda m: m.get("created_at") or "")
    return {"ok": True, "searched": searched, "matches": out}


def check(text):
    """The parser's verdict on `text` and what the pipeline will make of it."""
    dsl = DSL(text)
    if dsl.parse_tree is None:
        error = {"message": dsl.parse_error or "does not parse", "line": None, "column": None}
        try:
            dsl.parser.parse(text or "")
        except UnexpectedInput as e:
            error.update(line=e.line, column=e.column)
        except Exception:
            pass
        return {"ok": False, "error": error}
    tree = dsl.get_goal_tree()
    util = _util_constants()
    perception = dsl.get_perception_model()
    braking = next((m for t in BRAKING_TASKS for m in [dsl.get_module_for(t)] if m), None)
    modules = {
        "perception": {"module": perception, "task": PERCEPTION_TASK,
                       "runs": perception in _perception_modules(), "default": util.get("DEFAULT_YOLO_MODEL")},
        "braking": {"module": braking, "task": BRAKING_TASKS[0],
                    "runs": braking in util.get("BRAKING_BEHAVIOURS", []),
                    "default": util.get("DEFAULT_BRAKING_MODE")},
    }
    return {
        "ok": True,
        "tree": tree,
        "covered": coverage(text, tree),
        "assumptions": admissibility.parse_assumptions(tree.get("assumptions")),
        "soft_goals": [soft_goals.parse_soft_goal(s) for s in tree.get("soft_goals") or []],
        "scenario_constraints": extract_constraints(tree.get("scenario")),
        "modules": modules,
    }


def coverage(text, tree):
    """None when the form can hold this requirement exactly; else why not."""
    body = re.sub(r"#[^\n]*", "", text or "")
    if len(re.findall(r"\b(?:MAINTAIN|ACHIEVE)\b", body)) > 1:
        return NOT_COVERED[0]
    if re.search(r'"\s*parallely\b', body):
        return NOT_COVERED[1]
    if re.search(r'"\s*triggering\b', body):
        return NOT_COVERED[2]
    refinement = (tree or {}).get("refinement") or {}
    goals = refinement.get("goals") or []
    if any(g.get("refinement") for g in goals):
        return NOT_COVERED[3]
    if "&" in (tree or {}).get("objective", "") or any("&" in (g.get("objective") or "") for g in goals):
        return NOT_COVERED[4]
    if re.search(r'if\s+"[^"]*"\s*\|', body):
        return NOT_COVERED[5]
    if not goals:
        return "no sub-goal with an operation"
    return None


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin") or ""
        if re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        path = urllib.parse.unquote(self.path.split("?")[0])
        if path.rstrip("/") == "/authoring/catalog":
            self._send(200, catalog())
        elif path.rstrip("/") == "/authoring/lists":
            self._send(200, {"lists": scenario_lists()})
        elif path.rstrip("/") == "/authoring/jobs":
            self._send(200, {"jobs": cluster_jobs.list_jobs()})
        elif re.match(r"^/authoring/jobs/\d+$", path):
            self._cluster(lambda: cluster_jobs.status(path.rsplit("/", 1)[1]))
        elif path == "/authoring/runs/index.json":
            self._send(200, runs_index())
        elif path.startswith("/authoring/runs/"):
            self._send_file(path[len("/authoring/runs/"):])
        else:
            self._send(404, {"error": "not found"})

    def _send_file(self, rel):
        root = os.path.realpath(RUNS_DIR)
        full = os.path.realpath(os.path.join(root, rel))
        run, _, name = rel.partition("/")
        if name in ("analysis_report.json", "analysis_report.md") and not os.path.isfile(full):
            # no final report yet: the newest partial one (its banner says PARTIAL)
            partial = _partial_folder(os.path.join(root, run))
            full = os.path.realpath(os.path.join(partial, name)) if partial else full
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            self._send(404, {"error": "not found"})
            return
        size = os.path.getsize(full)
        start, end, status = 0, size - 1, 200
        rng = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range") or "")
        if rng and size:                      # Safari plays video only with byte ranges
            start = int(rng.group(1)) if rng.group(1) else max(0, size - int(rng.group(2) or 0))
            end = min(int(rng.group(2)), size - 1) if rng.group(1) and rng.group(2) else size - 1
            status = 206
        with open(full, "rb") as f:
            f.seek(start)
            body = f.read(end - start + 1)
        self.send_response(status)
        self.send_header("Content-Type", CONTENT_TYPES.get(os.path.splitext(full)[1], "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        origin = self.headers.get("Origin") or ""
        if re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        self.wfile.write(body)

    def _cluster(self, call):
        try:
            self._send(200, call())
        except cluster_jobs.ClusterError as e:
            self._send(409, {"error": str(e), "kind": e.kind, **e.details})

    def do_POST(self):
        route = self.path.rstrip("/")
        fetch = re.match(r"^/authoring/jobs/(\d+)/fetch$", route)
        partial = re.match(r"^/authoring/jobs/(\d+)/partial$", route)
        if partial:
            self._cluster(lambda: cluster_jobs.refresh_partial(partial.group(1)))
            return
        if fetch:
            self._cluster(lambda: cluster_jobs.fetch(fetch.group(1)))
            return
        if route == "/authoring/run/check-cluster":
            self._cluster(cluster_jobs.check_cluster)
            return
        if route not in ("/authoring/check", "/authoring/match", "/authoring/run",
                         "/authoring/run/check-laptop"):
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            text = body.get("text", "")
        except (ValueError, AttributeError):
            self._send(400, {"error": "expected JSON {\"text\": \"...\"}"})
            return
        if route == "/authoring/run/check-laptop":
            if not check(text)["ok"]:
                self._send(400, {"error": "the requirement does not parse", "kind": "parse"})
                return
            self._cluster(lambda: cluster_jobs.check_laptop(text, body.get("options")))
            return
        if route == "/authoring/run":
            # the parser is the gate here too: nothing reaches the cluster unless it parses
            if not check(text)["ok"]:
                self._send(400, {"error": "the requirement does not parse"})
                return
            self._cluster(lambda: cluster_jobs.submit(text, body.get("name", ""), body.get("options")))
            return
        self._send(200, check(text) if route == "/authoring/check" else match(text))

    def log_message(self, *args):
        pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args(argv)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"authoring helper on http://127.0.0.1:{args.port}/authoring/catalog")
    server.serve_forever()


if __name__ == "__main__":
    main()
