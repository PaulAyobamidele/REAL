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
overlay the job mounts) must exist and its parser, API and job script must be
byte-identical to this project's (`MUST_MATCH`); otherwise nothing is sent and
the message says to sync first. Each
submission is recorded in artifacts/jobs.json. Every remote command goes
through `RUNNER`, which the tests replace.
"""

import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone

from real_config import settings

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOST = os.environ.get("REAL_CLUSTER_HOST", "narval")
REMOTE_DIR = os.environ.get("REAL_CLUSTER_DIR", "scratch/real_project")
REQUIREMENTS = "requirements"
JOBS_FILE = os.path.join(settings.artifacts_dir, "jobs.json")
RUNS_DIR = os.path.join(settings.artifacts_dir, "runs")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\.dsl$")
SCENARIOS_IN_GRID = 32
# this project's file -> the cluster's copy (relative to REMOTE_DIR); a job
# runs the cluster's copies, so they must say what this project says
MUST_MATCH = {
    "scripts/redsl/grammar.py": "REAL/scripts/redsl/grammar.py",   # the parser and its grammar
    "api_app.py": "REAL/api_app.py",                                 # the grid endpoint, `performed by` modules
    "infra/hpc/run_real_av.slurm": "run_real_av.slurm",             # the job itself
}
SYNC_HINT = "sync it first (infra/hpc/README.md, section 4b, and scp the job script), then press Run Test again"
NO_SESSION = (f"no open ssh session to {HOST}: open a terminal, run `ssh {HOST}` once "
              "(with your second factor), then press Run Test again")


class ClusterError(Exception):
    pass


def _run(args, timeout=60):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def _ssh(command, timeout=60):
    return _run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", HOST, command], timeout)


def _copy(local, remote):
    return _run(["scp", "-o", "BatchMode=yes", "-q", local, f"{HOST}:{remote}"], 120)


def _pull(remote_dir, local_dir):
    os.makedirs(local_dir, exist_ok=True)
    return _run(["rsync", "-a", "-e", "ssh -o BatchMode=yes", f"{HOST}:{remote_dir}/", f"{local_dir}/"], 1800)


RUNNER = {"ssh": _ssh, "copy": _copy, "pull": _pull}


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


def _check_name(name):
    if not NAME_RE.match(name or ""):
        raise ClusterError("the file name must end in .dsl and use letters, digits, '.', '_' or '-'")


def _md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def check_cluster_copy():
    """Refuse (ClusterError) unless the cluster's project copy exists and matches MUST_MATCH."""
    script = (f"cd {REMOTE_DIR} 2>/dev/null || {{ echo NODIR; exit 0; }}; "
              "test -d REAL || { echo NOREAL; exit 0; }; "
              f"md5sum {' '.join(MUST_MATCH.values())} 2>/dev/null; exit 0")
    try:
        r = RUNNER["ssh"](script, 40)
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
                           "Nothing was submitted")
    remote = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 2 and re.fullmatch(r"[0-9a-f]{32}", parts[0]):
            remote[parts[1]] = parts[0]
    differ = [os.path.basename(local) for local, there in MUST_MATCH.items()
              if remote.get(there) != _md5(os.path.join(ROOT, local))]
    if differ:
        raise ClusterError(f"the code on {HOST} differs from this project in {', '.join(differ)}: "
                           f"{SYNC_HINT}. Nothing was submitted")


def save_requirement(text, name):
    """requirements/<name> in the project; an existing file with other content is never overwritten."""
    _check_name(name)
    folder = os.path.join(ROOT, REQUIREMENTS)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    if os.path.exists(path):
        with open(path) as f:
            if f.read() != text:
                raise ClusterError(f"{REQUIREMENTS}/{name} already exists with other content: "
                                   "choose another file name")
    else:
        with open(path, "w") as f:
            f.write(text)
    return path


def submit(text, name):
    """Check, save, copy and submit; returns the job record. The caller has checked that the text parses."""
    _check_name(name)
    if not connected():
        raise ClusterError(NO_SESSION)
    check_cluster_copy()
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
    r = RUNNER["ssh"](f"cd {REMOTE_DIR} && sbatch --parsable "
                      f"--export=ALL,REAL_REQUIREMENT_FILE={REQUIREMENTS}/{name} run_real_av.slurm")
    m = re.match(r"\s*(\d+)", r.stdout or "")
    if r.returncode or not m:
        raise ClusterError(f"sbatch refused the job: {(r.stderr or r.stdout).strip()[:300]}")
    record = {"job_id": m.group(1), "requirement": f"{REQUIREMENTS}/{name}",
              "submitted_at": datetime.now(timezone.utc).isoformat(), "state": "PENDING",
              "progress": None, "run_id": None, "fetched": False, "message": None}
    _save_jobs(_jobs() + [record])
    return record


STATUS_SCRIPT = (
    "cd {dir}; log=real-av-carla-{job}.out; "
    "echo \"Q:$(squeue -h -j {job} -o %T 2>/dev/null)\"; "
    "echo \"A:$(sacct -X -n -j {job} -o State 2>/dev/null | head -1)\"; "
    "echo \"P:$(grep -o '\\[grid\\] scenario [0-9]*/[0-9]*' $log 2>/dev/null | tail -1)\"; "
    "echo \"R:$(grep -o \"'run_id': '[0-9a-f]*'\" $log 2>/dev/null | tail -1)\"; "
    "echo \"S:$(grep -o \"'STATUS': '[A-Z ]*'\" $log 2>/dev/null | tail -1)\"; "
    "echo \"M:$(grep -l '\"requirement_source\": \"{req}\"' artifacts/runs/*/run_meta.json 2>/dev/null | tail -1)\""
)


def parse_status(out):
    """The status script's output -> {state, progress, run_id, ok}."""
    fields = dict(line.split(":", 1) for line in out.splitlines() if re.match(r"^[QAPRSM]:", line))
    queue = fields.get("Q", "").strip()
    acct = fields.get("A", "").strip().split(" ")[0]
    state = queue or acct.rstrip("+") or "UNKNOWN"
    prog = re.search(r"(\d+)/(\d+)", fields.get("P", ""))
    run = re.search(r"'([0-9a-f]{32})'", fields.get("R", ""))
    meta = re.search(r"runs/([0-9a-f]{32})/run_meta\.json", fields.get("M", ""))
    status = re.search(r"'STATUS': '([A-Z ]+)'", fields.get("S", ""))
    return {
        "state": state,
        "progress": {"done": int(prog.group(1)), "total": int(prog.group(2))} if prog else None,
        "run_id": run.group(1) if run else (meta.group(1) if meta else None),
        "ok": status.group(1) == "OK" if status else None,
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
        raise ClusterError(NO_SESSION if "denied" in r.stderr or "Permission" in r.stderr
                           else f"{HOST}: {r.stderr.strip()[:200]}")
    s = parse_status(r.stdout)
    message = None
    if s["state"] in ("FAILED", "CANCELLED", "TIMEOUT", "OUT_OF_MEMORY", "NODE_FAIL"):
        message = f"the job ended {s['state'].lower()}; its log is real-av-carla-{job_id}.out on {HOST}"
    elif s["state"] == "COMPLETED" and s["ok"] is False:
        message = "the job completed but the run did not report STATUS OK; see its log"
    return _update(job_id, state=s["state"], progress=s["progress"],
                   run_id=s["run_id"] or record.get("run_id"), message=message)


def fetch(job_id):
    """Pull a completed run and analyse it with the project's defaults; returns the record."""
    from scripts.analysis import cluster_map, report   # heavy; only when a run comes back

    record = status(job_id)
    if record.get("fetched"):
        return record
    if record["state"] != "COMPLETED" or not record.get("run_id"):
        raise ClusterError(f"job {job_id} is {record['state'].lower()}, not complete yet")
    run_id = record["run_id"]
    local = os.path.join(RUNS_DIR, run_id)
    r = RUNNER["pull"](f"{REMOTE_DIR}/artifacts/runs/{run_id}", local)
    if r.returncode:
        raise ClusterError(f"could not pull run {run_id}: {r.stderr.strip()[:200]}")
    if not os.path.exists(os.path.join(local, "analysis_report.json")):
        report.write_report(local)
    if not os.path.exists(os.path.join(local, cluster_map.FILENAME)):
        try:
            cluster_map.run(local)
        except SystemExit:
            pass                                   # too few encounters to map: the report stands
    return _update(job_id, fetched=True, message=None)
