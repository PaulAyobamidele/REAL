"""Running a written requirement on the cluster, for the review interface's
"Run Test": submit, follow, and bring the run back analysed.

The requirement is saved under `requirements/<name>.dsl` (in the project and
in the cluster's copy of it), submitted with the existing job script
(`sbatch --export=ALL,REAL_REQUIREMENT_FILE=requirements/<name> run_real_av.slurm`),
followed through the queue and the job log (`[grid] scenario n/32`), and,
once complete, pulled to `artifacts/runs/<run_id>/` and analysed with the
project's defaults (the path-aware safety rule) - the same steps a person
runs by hand (infra/hpc/README.md).

Everything goes over the reviewer's own ssh session to the cluster
(ControlMaster): nothing here stores a password or starts an interactive
login. Without a live session every call says how to open one. Before
anything is copied or submitted, the cluster's project copy (the source
overlay the job mounts) must exist and every file a job executes from it
(`code_manifest`) must be byte-identical to this project's; otherwise nothing
is sent and the message lists the differing files and the jobs that make a
sync unsafe right now. This module never syncs code and never cancels a job
(no scancel): it shows the command instead. Each
submission is recorded in artifacts/jobs.json. Every remote command goes
through `RUNNER`, which the tests replace.
"""

import hashlib
import json
import os
import random
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone

from real_config import settings

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOST = os.environ.get("REAL_CLUSTER_HOST", "narval")
REMOTE_DIR = os.environ.get("REAL_CLUSTER_DIR", "scratch/real_project")
REQUIREMENTS = "requirements"
JOBS_FILE = os.path.join(settings.artifacts_dir, "jobs.json")
RUNS_DIR = os.path.join(settings.artifacts_dir, "runs")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\.dsl$")
# What a job executes from the cluster's project copy (mounted over the image's
# /opt/real-av/REAL): the project's top-level modules, scripts/ (code, grammars,
# scene templates incl. scratch.temp) and the three packages the image installs
# from that copy in editable mode (infra/hpc/carla.def). Weights, notebooks and
# caches are not code and are not compared.
CODE_DIRS = ("scripts", "Scenic", "VerifAI", "grape")
CODE_SUFFIXES = (".py", ".bnf", ".scenic", ".temp", ".template", ".yaml", ".lark")
JOB_SCRIPT = "infra/hpc/run_real_av.slurm"          # sbatch runs REMOTE_DIR/run_real_av.slurm
JOB_NAME = "real-av-carla"                          # the job script's --job-name
SHOWN = 12                                          # files named in a message; the rest counted
# Hashing every file on the cluster's scratch takes ~10 min (about one file a
# second, measured 2026-10-13), so the copy carries the list it was synced
# with (written by write_manifest before the sync) and only a few real files
# are hashed on each check, to catch a file changed there after the sync.
MANIFEST = "CODE_MANIFEST.txt"
ALWAYS_SPOT = ("REAL/scripts/scenarios/scratch.temp", "REAL/scripts/redsl/grammar.py", "REAL/api_app.py")
SPOT_RANDOM = 2
LISTS = f"{REQUIREMENTS}/lists"                     # scenario lists for list mode, saved like requirements
LIST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\.txt$")
SEARCHES = ("grid", "ge", "list")
DEFAULT_TRIALS = {"grid": 5, "list": 3, "ge": 2}   # the job script's own defaults
DEFAULT_TIME, QUICK_TIME = "05:00:00", "00:45:00"
MAX_SECONDS = 5 * 3600                              # the job's request gives up at 17,400 s
TIME_RE = re.compile(r"^(\d{1,2}):([0-5]\d):([0-5]\d)$")
SAFE_VALUE = re.compile(r"^[A-Za-z0-9_./-]+$")      # no commas: sbatch --export separates on them
PARTIAL_EVERY_S = 300                               # at most one partial pull every 5 minutes
PARTIAL_FILES = ("run_meta.json", "scenarios.csv", "simulations.csv", "generations.csv")
LOG_IN_RUN = "job_log.out"                          # the job's console log, in its run folder (git-ignored)
LOGS_DIR = os.path.join(settings.artifacts_dir, "job_logs")   # logs of jobs that never made a run
ENDED = ("COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "OUT_OF_MEMORY", "NODE_FAIL", "BOOT_FAIL", "DEADLINE")
SYNC_HINT = ("sync it (infra/hpc/README.md, section 4b, and scp the job script) once no job is "
             "queued or running, then press Run Test again")
NO_SESSION = (f"no open ssh session to {HOST}: open a terminal, run `ssh {HOST}` once "
              "(with your second factor), then press Run Test again")


class ClusterError(Exception):
    """A refusal or failure in plain words; `kind` and `details` give the
    interface the lists behind it (files, jobs)."""

    def __init__(self, message, kind="error", **details):
        super().__init__(message)
        self.kind, self.details = kind, details


def _run(args, timeout=60):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def _ssh(command, timeout=60):
    return _run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", HOST, command], timeout)


def _copy(local, remote):
    return _run(["scp", "-o", "BatchMode=yes", "-q", local, f"{HOST}:{remote}"], 120)


def _pull(remote_dir, local_dir, only=None):
    """rsync a run folder down; `only`: just these files plus traces/ (a partial pull)."""
    os.makedirs(local_dir, exist_ok=True)
    filters = ([f"--include={f}" for f in only] + ["--include=traces/", "--include=traces/**", "--exclude=*"]
               if only else [])
    return _run(["rsync", "-a", *filters, "-e", "ssh -o BatchMode=yes",
                 f"{HOST}:{remote_dir}/", f"{local_dir}/"], 1800)


def _pull_file(remote_path, local_path):
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    return _run(["rsync", "-a", "-e", "ssh -o BatchMode=yes", f"{HOST}:{remote_path}", local_path], 300)


def _preflight(text, options):
    args = [sys.executable, "-m", "scripts.redsl.preflight", "--search", options["search"]]
    if options.get("grammar"):
        args += ["--grammar", options["grammar"]]
    if options.get("scenario_file"):
        args += ["--scenarios", os.path.join(ROOT, options["scenario_file"])]
    r = subprocess.run(args, input=text, capture_output=True, text=True, timeout=900, cwd=ROOT)
    line = next((l for l in reversed(r.stdout.splitlines()) if l.startswith("PREFLIGHT ")), None)
    if line is None:
        raise ClusterError("the laptop check did not finish: " + (r.stderr or r.stdout).strip()[-400:],
                           kind="preflight")
    return json.loads(line[len("PREFLIGHT "):])


RUNNER = {"ssh": _ssh, "copy": _copy, "pull": _pull, "pull_file": _pull_file, "preflight": _preflight}


# ------------------------------------------------------------------ registry

def _jobs():
    try:
        with open(JOBS_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def _save_jobs(jobs):
    os.makedirs(os.path.dirname(JOBS_FILE), exist_ok=True)
    with open(JOBS_FILE, "w") as f:
        json.dump(jobs, f, indent=1)


def _record(job_id):
    return next((j for j in _jobs() if j["job_id"] == str(job_id)), None)


def _update(job_id, **fields):
    jobs = _jobs()
    for j in jobs:
        if j["job_id"] == str(job_id):
            j.update(fields)
    _save_jobs(jobs)
    return _record(job_id)


def list_jobs():
    return list(reversed(_jobs()))


# ------------------------------------------------------------------ steps

def connected():
    try:
        return RUNNER["ssh"]("true", 20).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def sync_commands():
    """The section 4b commands (after rebuilding the staging copy, section 2), for this
    machine and cluster, so the interface can offer them to copy."""
    return [f"sim_env/bin/python -m scripts.redsl.cluster_jobs --manifest ~/real-av-build/REAL",
            f"rsync -avP --partial --delete --exclude='ui' --exclude='artifacts' "
            f"~/real-av-build/REAL/ {HOST}:{REMOTE_DIR}/REAL/",
            f"scp infra/hpc/run_real_av.slurm {HOST}:{REMOTE_DIR}/run_real_av.slurm"]


def _check_name(name):
    if not NAME_RE.match(name or ""):
        raise ClusterError("the file name must end in .dsl and use letters, digits, '.', '_' or '-'")


def _positive(raw, key, default):
    value = raw.get(key)
    if value in (None, ""):
        return default
    try:
        value = int(value)
    except (TypeError, ValueError):
        value = 0
    if value < 1:
        raise ClusterError(f"{key} must be a whole number of at least 1", kind="options")
    return value


def options_from(raw):
    """Submit options -> checked values, one per job script variable (and --time).
    Unknown options, and options that do not belong to the chosen search, are refused."""
    raw = {k: v for k, v in dict(raw or {}).items() if v not in (None, "")}
    unknown = set(raw) - {"search", "trials", "population", "generations", "grammar",
                          "scenario_file", "time", "parent_run_id", "round"}
    if unknown:
        raise ClusterError(f"unknown option(s): {', '.join(sorted(unknown))}", kind="options")
    search = raw.get("search", "grid")
    if search not in SEARCHES:
        raise ClusterError(f"search must be one of {', '.join(SEARCHES)}", kind="options")
    o = {"search": search, "trials": _positive(raw, "trials", DEFAULT_TRIALS[search]),
         "time": raw.get("time", DEFAULT_TIME)}
    m = TIME_RE.match(str(o["time"]))
    seconds = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)) if m else 0
    if not 0 < seconds <= MAX_SECONDS:
        raise ClusterError(f"time must be HH:MM:SS, at most {DEFAULT_TIME}", kind="options")
    ge_only = [k for k in ("population", "generations", "grammar") if k in raw]
    if search == "ge":
        o.update(population=_positive(raw, "population", 16), generations=_positive(raw, "generations", 6),
                 grammar=raw.get("grammar", "v2/scene_v2.bnf"))
        if (not SAFE_VALUE.match(o["grammar"]) or ".." in o["grammar"] or not o["grammar"].endswith(".bnf")
                or not os.path.isfile(os.path.join(settings.grammar_base_dir, o["grammar"]))):
            raise ClusterError(f"no grammar {o['grammar']} under scripts/templates", kind="options")
    elif ge_only:
        raise ClusterError(f"{', '.join(ge_only)} only apply to a GE search", kind="options")
    if search == "list":
        path = raw.get("scenario_file")
        full = path and (path if os.path.isabs(path) else os.path.join(ROOT, path))
        if not full or not os.path.isfile(full):
            raise ClusterError("a list run needs a scenario file that exists in the project", kind="options")
        if not LIST_RE.match(os.path.basename(full)):
            raise ClusterError("the scenario file name must end in .txt and use letters, digits, "
                               "'.', '_' or '-'", kind="options")
        o["scenario_file"] = os.path.relpath(full, ROOT)
    elif "scenario_file" in raw:
        raise ClusterError("a scenario file only applies to a list run", kind="options")
    if "parent_run_id" in raw:
        if not re.fullmatch(r"[0-9a-f]{32}", str(raw["parent_run_id"])):
            raise ClusterError("parent run id must be a 32-character run id", kind="options")
        o["parent_run_id"] = raw["parent_run_id"]
    if "round" in raw:
        o["round"] = _positive(raw, "round", None)
    return o


def job_variables(o, requirement, scenarios=None):
    """The job script's environment variables for these options (infra/hpc/run_real_av.slurm)."""
    v = {"REAL_REQUIREMENT_FILE": requirement, "REAL_SEARCH": o["search"], "REAL_TRIALS": o["trials"]}
    if o["search"] == "ge":
        v.update(REAL_POPULATION=o["population"], REAL_GENERATIONS=o["generations"], REAL_GRAMMAR=o["grammar"])
    if o["search"] == "list":
        v["REAL_SCENARIOS"] = scenarios
    if "parent_run_id" in o:
        v["REAL_PARENT_RUN_ID"] = o["parent_run_id"]
    if "round" in o:
        v["REAL_ROUND"] = o["round"]
    return v


def _md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def code_manifest(root=None):
    """{path under REMOTE_DIR: md5 of this project's file} for every file a job executes."""
    root = root or ROOT
    files = {f"REAL/{n}": os.path.join(root, n) for n in sorted(os.listdir(root)) if n.endswith(".py")}
    for top in CODE_DIRS:
        for folder, dirs, names in os.walk(os.path.join(root, top)):
            # mlruns: MLflow records, excluded by the sync (infra/hpc/README.md, section 2)
            dirs[:] = sorted(d for d in dirs if d not in ("__pycache__", "mlruns") and not d.startswith("."))
            for n in sorted(names):
                if n.endswith(CODE_SUFFIXES):
                    full = os.path.join(folder, n)
                    files["REAL/" + os.path.relpath(full, root)] = full
    files["run_real_av.slurm"] = os.path.join(root, JOB_SCRIPT)
    return {there: _md5(local) for there, local in files.items()}


def write_manifest(staging):
    """CODE_MANIFEST.txt in a staging copy (md5sum format, paths relative to the copy),
    written before it is synced; the cluster check reads this one file."""
    lines = [f"{h}  {p[len('REAL/'):]}" for p, h in code_manifest(staging).items() if p.startswith("REAL/")]
    with open(os.path.join(staging, MANIFEST), "w") as f:
        f.write("\n".join(lines) + "\n")
    return len(lines)


def _md5_lines(text):
    out = {}
    for line in text.splitlines():
        parts = line.split(None, 1)
        if len(parts) == 2 and re.fullmatch(r"[0-9a-f]{32}", parts[0]):
            out[parts[1].strip()] = parts[0]
    return out


def active_jobs():
    """This user's queued or running jobs of the job script: [{job_id, state}]. They
    run from the cluster's project copy, so it must not change under them."""
    r = RUNNER["ssh"](f"squeue -h -u $USER -t PENDING,RUNNING -n {JOB_NAME} -o '%i %T'", 40)
    if r.returncode:
        raise ClusterError(f"could not list the jobs on {HOST}: {r.stderr.strip()[:200]}")
    return [{"job_id": p[0], "state": p[1]} for p in (l.split() for l in r.stdout.splitlines()) if len(p) == 2]


def _named(paths):
    return ", ".join(paths[:SHOWN]) + (f" and {len(paths) - SHOWN} more" if len(paths) > SHOWN else "")


def check_cluster_copy():
    """Refuse (ClusterError) unless the cluster's project copy exists and every file in
    code_manifest() is identical there - read from the copy's CODE_MANIFEST.txt, with a
    few real files hashed as a spot check; the refusal lists the files and any blocking jobs."""
    expected = code_manifest()
    spot = list(ALWAYS_SPOT) + random.sample(
        sorted(p for p in expected if p.startswith("REAL/") and p not in ALWAYS_SPOT), SPOT_RANDOM)
    spot.append("run_real_av.slurm")
    script = (f"cd {REMOTE_DIR} 2>/dev/null || {{ echo NODIR; exit 0; }}; "
              "test -d REAL || { echo NOREAL; exit 0; }; "
              f"test -f REAL/{MANIFEST} || echo NOMANIFEST; "
              f"sed 's|  |  REAL/|' REAL/{MANIFEST} 2>/dev/null; "
              f"echo SPOT; md5sum -- {' '.join(shlex.quote(p) for p in spot)} 2>/dev/null; exit 0")
    try:
        r = RUNNER["ssh"](script, 120)
    except subprocess.TimeoutExpired:
        raise ClusterError(f"{HOST} did not answer in time; nothing was submitted")
    if r.returncode:
        raise ClusterError(f"could not check the project copy on {HOST}: {r.stderr.strip()[:200]}")
    out = r.stdout or ""
    if "NODIR" in out:
        raise ClusterError(f"{HOST} has no {REMOTE_DIR}; nothing was submitted")
    if "NOREAL" in out:
        raise ClusterError(f"{HOST} has no project copy at {REMOTE_DIR}/REAL (the job would run the image's "
                           f"built-in code, which cannot see a new requirement): {SYNC_HINT}. "
                           "Nothing was submitted", kind="no_copy", host=HOST, sync_commands=sync_commands())
    if "NOMANIFEST" in out:
        raise ClusterError(f"the copy on {HOST} was synced without {MANIFEST}: {SYNC_HINT}. "
                           "Nothing was submitted", kind="stale_copy", differ=[], missing=[MANIFEST],
                           tampered=[], blocking_jobs=active_jobs(), host=HOST,
                           sync_commands=sync_commands())
    listed_text, _, spot_text = out.partition("SPOT")
    listed = _md5_lines(listed_text)                # what the copy was synced with
    actual = _md5_lines(spot_text)                  # what is really there now
    if not listed and not actual:
        # an answer without a single file line is a failed answer, not "every file missing"
        # (seen once from the helper, 2026-10-14); the raw answer is kept to find out why
        folder = os.path.join(settings.artifacts_dir, "cluster_checks")
        os.makedirs(folder, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
        with open(os.path.join(folder, f"{stamp}_empty_answer.txt"), "w") as f:
            f.write(f"return code {r.returncode}\n--- stdout ---\n{out}\n--- stderr ---\n{r.stderr}\n")
        raise ClusterError(f"{HOST} did not answer the code check properly; nothing was submitted - "
                           "try again", kind="no_answer")
    tampered = sorted(p for p in actual if p in listed and listed[p] != actual[p])
    remote = {**listed, **actual}                   # a real file outranks the list
    differ = sorted(p for p, h in expected.items() if p in remote and remote[p] != h)
    missing = sorted(p for p in expected if p not in remote)
    if differ or missing or tampered:
        blocking = active_jobs()
        parts = []
        if differ:
            parts.append(f"{len(differ)} file(s) differ: {_named(differ)}")
        if missing:
            parts.append(f"{len(missing)} missing there: {_named(missing)}")
        if tampered:
            parts.append(f"changed there after the sync: {_named(tampered)}")
        wait = (f" Jobs {', '.join(j['job_id'] + ' (' + j['state'].lower() + ')' for j in blocking)} "
                "run from that copy: do not sync until they end." if blocking else "")
        raise ClusterError(f"the code on {HOST} is not this project's - {'; '.join(parts)}. "
                           f"{SYNC_HINT}.{wait} Nothing was submitted", kind="stale_copy",
                           differ=differ, missing=missing, tampered=tampered, blocking_jobs=blocking,
                           host=HOST, sync_commands=sync_commands())


def save_requirement(text, name, folder_rel=REQUIREMENTS):
    """<folder>/<name> in the project; an existing file with other content is never overwritten."""
    if folder_rel == REQUIREMENTS:
        _check_name(name)
    folder = os.path.join(ROOT, folder_rel)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    if os.path.exists(path):
        with open(path) as f:
            if f.read() != text:
                raise ClusterError(f"{folder_rel}/{name} already exists with other content: "
                                   "choose another file name")
    else:
        with open(path, "w") as f:
            f.write(text)
    return path


_LAPTOP_CACHE = {}          # (text, options) -> (time, result): Submit reuses a check made < 10 min ago
LAPTOP_CACHE_S = 600


def check_laptop(text, options):
    """The checks on this machine (options, modules, scenes): preflight's result,
    reused for the same text and options within LAPTOP_CACHE_S. Bad options raise."""
    o = options_from(options)
    key = (text, json.dumps(o, sort_keys=True))
    hit = _LAPTOP_CACHE.get(key)
    if hit and time.time() - hit[0] < LAPTOP_CACHE_S:
        return hit[1]
    laptop = RUNNER["preflight"](text, o)
    _LAPTOP_CACHE[key] = (time.time(), laptop)
    return laptop


def check_cluster():
    """The checks over ssh: a session, then the cluster's code. Raises ClusterError."""
    if not connected():
        raise ClusterError(NO_SESSION, kind="no_session", host=HOST)
    check_cluster_copy()
    return {"ok": True, "host": HOST}


def submit(text, name, options=None):
    """Check on the laptop, check the cluster copy, save, copy and submit; returns the job record.
    Nothing touches the cluster until the laptop check has passed."""
    _check_name(name)
    o = options_from(options)
    laptop = check_laptop(text, o)                  # reused if the interface just checked it
    if not laptop["ok"]:
        raise ClusterError(laptop["message"] + ". Nothing was submitted", kind=laptop["kind"],
                           failures=laptop.get("failures", []))
    check_cluster()
    path = save_requirement(text, name)
    remote_req = f"{REMOTE_DIR}/REAL/{REQUIREMENTS}"
    # only the requirements folder inside the existing copy: never the copy itself,
    # which the job would then mount, nearly empty, over the image's code
    r = RUNNER["ssh"](f"test -d {REMOTE_DIR}/REAL && mkdir -p {remote_req}")
    if r.returncode:
        raise ClusterError(f"could not prepare the folder on {HOST}: {r.stderr.strip()[:200]}")
    r = RUNNER["copy"](path, f"{remote_req}/{name}")
    if r.returncode:
        raise ClusterError(f"could not copy the requirement to {HOST}: {r.stderr.strip()[:200]}")
    scenarios = None
    if o["search"] == "list":
        here = os.path.join(ROOT, o["scenario_file"])
        there = RUNNER["ssh"](f"md5sum -- {shlex.quote(REMOTE_DIR + '/REAL/' + o['scenario_file'])} 2>/dev/null")
        if (there.stdout or "").split()[:1] == [_md5(here)]:
            scenarios = o["scenario_file"]          # the same file a hand run names
        else:
            list_name = os.path.basename(o["scenario_file"])
            with open(here) as f:
                list_path = save_requirement(f.read(), list_name, LISTS)
            r = RUNNER["ssh"](f"test -d {REMOTE_DIR}/REAL && mkdir -p {REMOTE_DIR}/REAL/{LISTS}")
            r = r if r.returncode else RUNNER["copy"](list_path, f"{REMOTE_DIR}/REAL/{LISTS}/{list_name}")
            if r.returncode:
                raise ClusterError(f"could not copy the scenario list to {HOST}: {r.stderr.strip()[:200]}")
            scenarios = f"{LISTS}/{list_name}"
    variables = job_variables(o, f"{REQUIREMENTS}/{name}", scenarios)
    command = (f"sbatch --parsable --time={o['time']} --export=ALL,"
               + ",".join(f"{k}={v}" for k, v in variables.items()) + " run_real_av.slurm")
    r = RUNNER["ssh"](f"cd {REMOTE_DIR} && {command}")
    m = re.match(r"\s*(\d+)", r.stdout or "")
    if r.returncode or not m:
        raise ClusterError(f"sbatch refused the job: {(r.stderr or r.stdout).strip()[:300]}")
    record = {"job_id": m.group(1), "requirement": f"{REQUIREMENTS}/{name}",
              "options": o, "variables": variables, "command": command,
              "laptop_check": {k: laptop.get(k) for k in ("checked", "how", "system_under_test")},
              "submitted_at": datetime.now(timezone.utc).isoformat(), "state": "PENDING",
              "progress": None, "run_id": None, "fetched": False, "message": None}
    _save_jobs(_jobs() + [record])
    return record


STATUS_SCRIPT = (
    "cd {dir}; log=real-av-carla-{job}.out; "
    "echo \"Q:$(squeue -h -j {job} -o %T 2>/dev/null)\"; "
    "echo \"A:$(sacct -X -n -P -j {job} -o State,Start,Elapsed,NodeList,Timelimit 2>/dev/null | head -1)\"; "
    "echo \"K:$(grep -m1 '^Ports:' $log 2>/dev/null)\"; "
    "echo \"P:$(grep -o '\\[grid\\] scenario [0-9]*/[0-9]*' $log 2>/dev/null | tail -1)\"; "
    "echo \"R:$(grep -o \"'run_id': '[0-9a-f]*'\" $log 2>/dev/null | tail -1)\"; "
    "echo \"S:$(grep -o \"'STATUS': '[A-Z ]*'\" $log 2>/dev/null | tail -1)\"; "
    "echo \"E:$(grep -o \"'error': .*\" $log 2>/dev/null | tail -1)\"; "
    "echo \"T:$(grep -c '^Traceback' $log 2>/dev/null)\"; "
    "echo \"X:$(grep -c 'Error handling request' $log 2>/dev/null)\"; "
    "echo \"W:$(grep -c 'no simulation could be created' $log 2>/dev/null)\"; "
    # a run of this job was created after it started (not the newest name, not an older run)
    "start=$(sacct -X -n -P -j {job} -o Start 2>/dev/null | head -1); "
    "case \"$start\" in 20*) find artifacts/runs -maxdepth 2 -name run_meta.json -newermt \"$start\" 2>/dev/null "
    "| xargs -r grep -l '\"requirement_source\": \"{req}\"' | sed 's/^/M:/';; esac; "
    "tail -n 15 $log 2>/dev/null | sed 's/^/L:/'"
)


def parse_status(out):
    """The status script's output -> what the job is doing, in fields the interface shows."""
    fields, runs, tail = {}, [], []
    for line in out.splitlines():
        key, _, value = line.partition(":")
        if key == "M":
            runs += re.findall(r"runs/([0-9a-f]{32})/run_meta\.json", value)
        elif key == "L":
            tail.append(value)
        elif len(key) == 1 and key in "QAKPRSETXW":
            fields[key] = value
    acct = (fields.get("A", "").strip().split("|") + [""] * 5)[:5]
    state = fields.get("Q", "").strip() or acct[0].split(" ")[0].rstrip("+") or "UNKNOWN"
    prog = re.search(r"(\d+)/(\d+)", fields.get("P", ""))
    run = re.search(r"'([0-9a-f]{32})'", fields.get("R", ""))
    ok = re.search(r"'STATUS': '([A-Z ]+)'", fields.get("S", ""))
    # Python prints the API's dict with either quote, whichever the message does not contain
    err = re.search(r"'error': (?:'([^']*)'|\"([^\"]*)\")", fields.get("E", ""))

    def count(k):
        value = fields.get(k, "").strip()
        return int(value) if value.isdigit() else 0

    return {
        "state": state,
        "started_at": acct[1] if acct[1].startswith("20") else None,
        "elapsed": acct[2] or None, "node": acct[3] or None, "time_limit": acct[4] or None,
        "ports": fields.get("K", "").replace("Ports:", "").strip() or None,
        "progress": {"done": int(prog.group(1)), "total": int(prog.group(2))} if prog else None,
        # the log names the run at the end; before that, the one folder made after the job started
        "run_id": run.group(1) if run else (runs[0] if len(set(runs)) == 1 else None),
        "ok": ok.group(1) == "OK" if ok else None,
        "api_error": (err.group(1) or err.group(2)) if err else None,
        "tracebacks": count("T"), "mlflow_server_errors": count("X"), "not_created": count("W"),
        "log_tail": tail,
    }


def status(job_id):
    record = _record(job_id)
    if not record:
        raise ClusterError(f"no job {job_id} was submitted from here")
    if record.get("fetched"):
        return record
    try:
        r = RUNNER["ssh"](STATUS_SCRIPT.format(dir=REMOTE_DIR, job=job_id, req=record["requirement"]), 40)
    except subprocess.TimeoutExpired:
        raise ClusterError(f"{HOST} did not answer in time")
    if r.returncode:
        if "denied" in r.stderr or "Permission" in r.stderr:
            raise ClusterError(NO_SESSION, kind="no_session", host=HOST)
        raise ClusterError(f"{HOST}: {r.stderr.strip()[:200]}")
    s = parse_status(r.stdout)
    message = None
    last = " | ".join(line.strip() for line in s["log_tail"][-5:] if line.strip())
    if s["api_error"]:
        message = f"the API answered NOT OK: {s['api_error']}"
    elif s["state"] in ENDED and s["state"] != "COMPLETED":
        message = (f"the job ended {s['state'].lower()} after {s['elapsed'] or '?'}"
                   + (f"; last lines of its log: {last}" if last else ""))
    elif s["state"] == "COMPLETED" and s["ok"] is not True:
        message = "the job completed but the run did not report STATUS OK" + (f"; last lines: {last}" if last else "")
    s["run_id"] = s["run_id"] or record.get("run_id")
    return _update(job_id, message=message, **s)


def _rows(path):
    try:
        with open(path) as f:
            return max(0, sum(1 for line in f if line.strip()) - 1)
    except OSError:
        return None


def _scenarios_done(local, record):
    """(scenarios finished, scenarios in the run): grid/list from scenarios.csv and
    run_meta.json; GE from generations.csv (total = the generations asked for).
    Falls back to the log's progress; None where nothing says."""
    progress = record.get("progress") or {}
    if (record.get("options") or {}).get("search") == "ge":
        return _rows(os.path.join(local, "generations.csv")), record["options"].get("generations")
    try:
        with open(os.path.join(local, "run_meta.json")) as f:
            total = json.load(f).get("n_scenarios")
    except (OSError, ValueError):
        total = None
    done = _rows(os.path.join(local, "scenarios.csv"))
    return (done if done is not None else progress.get("done"),
            total if total is not None else progress.get("total"))


def refresh_partial(job_id):
    """While a job runs: pull its results so far (no frames or video) and analyse them
    into <run>/partial/after_<n>_of_<N>/, labelled PARTIAL. Earlier partial reports are
    kept; partial/latest.json points at the newest. At most once every PARTIAL_EVERY_S."""
    from scripts.analysis import report     # heavy; only when results arrive

    record = status(job_id)
    run_id = record.get("run_id")
    last = record.get("partial_at")
    if not run_id or record["state"] in ENDED or (
            last and (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() < PARTIAL_EVERY_S):
        return record
    local = os.path.join(RUNS_DIR, run_id)
    r = RUNNER["pull"](f"{REMOTE_DIR}/artifacts/runs/{run_id}", local, only=PARTIAL_FILES)
    if r.returncode:
        return _update(job_id, partial_message=f"could not pull the results so far: {r.stderr.strip()[:200]}")
    done, total = _scenarios_done(local, record)
    folder = os.path.join(local, "partial", f"after_{done}_of_{total}")
    when = datetime.now(timezone.utc).isoformat()
    if not os.path.exists(os.path.join(folder, "analysis_report.json")):
        try:
            report.write_report(local, out_dir=folder,
                                banner=f"PARTIAL ({done} of {total} scenarios) - the job is still running")
        except Exception as e:     # a row half-written at the moment of the pull: try again next time
            return _update(job_id, partial_at=when, partial_message=f"partial analysis waits: {e}")
        with open(os.path.join(local, "partial", "latest.json"), "w") as f:
            json.dump({"folder": os.path.relpath(folder, local), "done": done, "total": total, "at": when}, f)
    return _update(job_id, partial_at=when, partial={"done": done, "total": total}, partial_message=None)


def fetch(job_id):
    """When the job has ended: pull everything (traces, frames, video), the job's log, and
    analyse with the project's defaults. A run that did not finish is pulled and analysed
    too, labelled INCOMPLETE; a job that never made a run keeps its log in artifacts/job_logs/."""
    from scripts.analysis import cluster_map, report   # heavy; only when a run comes back

    record = status(job_id)
    if record.get("fetched"):
        return record
    if record["state"] not in ENDED:
        raise ClusterError(f"job {job_id} is {record['state'].lower()}, not ended yet", kind="not_ended")
    log = f"{REMOTE_DIR}/real-av-carla-{job_id}.out"
    run_id = record.get("run_id")
    if not run_id:
        RUNNER["pull_file"](log, os.path.join(LOGS_DIR, f"{os.path.basename(record['requirement'])}.{job_id}.out"))
        return _update(job_id, fetched=True)
    local = os.path.join(RUNS_DIR, run_id)
    r = RUNNER["pull"](f"{REMOTE_DIR}/artifacts/runs/{run_id}", local)
    if r.returncode:
        raise ClusterError(f"could not pull run {run_id}: {r.stderr.strip()[:200]}")
    RUNNER["pull_file"](log, os.path.join(local, LOG_IN_RUN))
    done, total = _scenarios_done(local, record)
    finished = bool(record["state"] == "COMPLETED" and record.get("ok") and (total is None or done == total))
    banner = None if finished else (f"INCOMPLETE ({done} of {total} scenarios) - the job ended "
                                    f"{record['state'].lower()}")
    if not os.path.exists(os.path.join(local, "analysis_report.json")):
        report.write_report(local, banner=banner)
    if not os.path.exists(os.path.join(local, cluster_map.FILENAME)):
        try:
            cluster_map.run(local)
        except SystemExit:
            pass                                   # too few encounters to map: the report stands
    return _update(job_id, fetched=True, complete=finished, message=None if finished else record.get("message"))


if __name__ == "__main__":     # python -m scripts.redsl.cluster_jobs --manifest <staging copy>
    import argparse
    parser = argparse.ArgumentParser(description=f"write {MANIFEST} into a staging copy before syncing it")
    parser.add_argument("--manifest", required=True, metavar="STAGING_DIR")
    print(f"{write_manifest(os.path.expanduser(parser.parse_args().manifest))} files listed in {MANIFEST}")
