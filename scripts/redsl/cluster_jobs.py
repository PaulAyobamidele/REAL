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
                           "Nothing was submitted", kind="no_copy")
    if "NOMANIFEST" in out:
        raise ClusterError(f"the copy on {HOST} was synced without {MANIFEST}: {SYNC_HINT}. "
                           "Nothing was submitted", kind="stale_copy", differ=[], missing=[MANIFEST],
                           tampered=[], blocking_jobs=active_jobs())
    listed_text, _, spot_text = out.partition("SPOT")
    listed = _md5_lines(listed_text)                # what the copy was synced with
    actual = _md5_lines(spot_text)                  # what is really there now
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
                           differ=differ, missing=missing, tampered=tampered, blocking_jobs=blocking)


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


if __name__ == "__main__":     # python -m scripts.redsl.cluster_jobs --manifest <staging copy>
    import argparse
    parser = argparse.ArgumentParser(description=f"write {MANIFEST} into a staging copy before syncing it")
    parser.add_argument("--manifest", required=True, metavar="STAGING_DIR")
    print(f"{write_manifest(os.path.expanduser(parser.parse_args().manifest))} files listed in {MANIFEST}")
