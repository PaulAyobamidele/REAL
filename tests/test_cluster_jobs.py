"""Run Test's cluster side (scripts/redsl/cluster_jobs.py) against a fake
cluster: no ssh, no sbatch, no network."""

import subprocess

import pytest

from scripts.redsl import cluster_jobs as cj


class Done:
    def __init__(self, stdout="", returncode=0, stderr=""):
        self.stdout, self.returncode, self.stderr = stdout, returncode, stderr


@pytest.fixture
def cluster(tmp_path, monkeypatch):
    monkeypatch.setattr(cj, "ROOT", str(tmp_path))
    monkeypatch.setattr(cj, "JOBS_FILE", str(tmp_path / "artifacts" / "jobs.json"))
    monkeypatch.setattr(cj, "RUNS_DIR", str(tmp_path / "artifacts" / "runs"))
    calls = []
    state = {"session": True, "status": "", "copy": "same", "active": "", "checks": []}
    for rel in ("api_app.py", "scripts/redsl/grammar.py", "scripts/scenarios/scratch.temp",
                "scripts/templates/v3/scene_v3.bnf", "Scenic/src/scenic/core.py", "grape/x.py",
                "scripts/mlops/yolov5s.pt", "infra/hpc/run_real_av.slurm"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text(f"# {rel}\n")

    def ssh(command, timeout=60):
        calls.append(("ssh", command))
        if not state["session"]:
            return Done(returncode=255, stderr="Permission denied (keyboard-interactive)")
        if command.startswith("cd ") and "sbatch" in command:
            return Done("4999001\n")
        if "squeue -h -u" in command:
            return Done(state["active"])
        if "squeue" in command:
            return Done(state["status"])
        if "md5sum" in command:
            state["checks"].append(command)
            if state["copy"] == "absent":
                return Done("NOREAL\n")
            files = cj.code_manifest()
            if state["copy"] == "older":
                files["REAL/scripts/scenarios/scratch.temp"] = "0" * 32
            if state["copy"] == "missing":
                files.pop("REAL/scripts/templates/v3/scene_v3.bnf")
            listed = ("NOMANIFEST\n" if state["copy"] == "nomanifest" else
                      "".join(f"{h}  {p}\n" for p, h in files.items() if p.startswith("REAL/")))
            if state["copy"] == "edited":
                files["REAL/api_app.py"] = "f" * 32          # changed on the cluster after the sync
            spot = "".join(f"{h}  {p}\n" for p, h in files.items() if f" {p}" in command
                           or f"'{p}'" in command)
            return Done(listed + "SPOT\n" + spot)
        return Done()

    def copy(local, remote):
        calls.append(("copy", local, remote))
        return Done()

    def pull(remote, local):
        calls.append(("pull", remote, local))
        return Done()

    monkeypatch.setattr(cj, "RUNNER", {"ssh": ssh, "copy": copy, "pull": pull})
    return {"calls": calls, "state": state, "tmp": tmp_path}


TEXT = 'MAINTAIN "G" by "S" using "A" in scenario where "s"\n'


def test_submit_saves_copies_and_submits_with_the_requirement_file(cluster):
    record = cj.submit(TEXT, "R_new.dsl")
    assert record["job_id"] == "4999001" and record["state"] == "PENDING"
    assert (cluster["tmp"] / "requirements" / "R_new.dsl").read_text() == TEXT
    sbatch = [c[1] for c in cluster["calls"] if c[0] == "ssh" and "sbatch" in c[1]]
    assert sbatch and "REAL_REQUIREMENT_FILE=requirements/R_new.dsl" in sbatch[0]
    assert any(c[0] == "copy" and c[2].endswith("/REAL/requirements/R_new.dsl") for c in cluster["calls"])
    assert cj.list_jobs()[0]["job_id"] == "4999001"


def test_without_a_session_nothing_is_submitted_and_the_message_says_what_to_do(cluster):
    cluster["state"]["session"] = False
    with pytest.raises(cj.ClusterError, match="run `ssh"):
        cj.submit(TEXT, "R_new.dsl")
    assert not any("sbatch" in c[1] for c in cluster["calls"] if c[0] == "ssh")


def test_an_existing_requirement_file_is_never_overwritten(cluster):
    cj.save_requirement(TEXT, "R_a.dsl")
    cj.save_requirement(TEXT, "R_a.dsl")            # same content: fine
    with pytest.raises(cj.ClusterError, match="already exists"):
        cj.save_requirement(TEXT + "# changed\n", "R_a.dsl")
    with pytest.raises(cj.ClusterError, match="file name"):
        cj.save_requirement(TEXT, "../escape.dsl")


def test_status_reads_queue_progress_and_run_from_the_log():
    out = ("Q:RUNNING\nA:RUNNING\nP:[grid] scenario 12/32\nR:\nS:\n"
           "M:artifacts/runs/0123456789abcdef0123456789abcdef/run_meta.json\n")
    s = cj.parse_status(out)
    assert s == {"state": "RUNNING", "progress": {"done": 12, "total": 32},
                 "run_id": "0123456789abcdef0123456789abcdef", "ok": None}
    done = cj.parse_status("Q:\nA:COMPLETED \nP:[grid] scenario 32/32\n"
                           "R:'run_id': 'fedcba9876543210fedcba9876543210'\nS:'STATUS': 'OK'\nM:\n")
    assert done["state"] == "COMPLETED" and done["ok"] is True
    assert done["run_id"] == "fedcba9876543210fedcba9876543210"


def test_fetch_pulls_a_completed_run_and_refuses_an_unfinished_one(cluster, monkeypatch):
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = "Q:RUNNING\nA:RUNNING\nP:[grid] scenario 3/32\nR:\nS:\nM:\n"
    with pytest.raises(cj.ClusterError, match="not complete"):
        cj.fetch("4999001")
    run = "fedcba9876543210fedcba9876543210"
    cluster["state"]["status"] = f"Q:\nA:COMPLETED\nP:\nR:'run_id': '{run}'\nS:'STATUS': 'OK'\nM:\n"
    written = []
    from scripts.analysis import cluster_map, report
    monkeypatch.setattr(report, "write_report", lambda d: written.append(("report", d)))
    monkeypatch.setattr(cluster_map, "run", lambda d: written.append(("map", d)))
    record = cj.fetch("4999001")
    assert record["fetched"] and record["run_id"] == run
    assert any(c[0] == "pull" and c[1].endswith(f"/artifacts/runs/{run}") for c in cluster["calls"])
    assert [w[0] for w in written] == ["report", "map"]


def test_a_timeout_is_reported_not_raised_as_a_crash(cluster):
    cj.submit(TEXT, "R_new.dsl")

    def slow(command, timeout=60):
        raise subprocess.TimeoutExpired(command, timeout)

    cluster_runner = dict(cj.RUNNER, ssh=slow)
    cj.RUNNER.update(cluster_runner)
    with pytest.raises(cj.ClusterError, match="did not answer"):
        cj.status("4999001")


def test_older_code_on_the_cluster_refuses_before_anything_is_sent(cluster):
    cluster["state"]["copy"] = "older"
    with pytest.raises(cj.ClusterError, match="differ: REAL/scripts/scenarios/scratch.temp"):
        cj.submit(TEXT, "R_new.dsl")
    assert not any(c[0] == "copy" for c in cluster["calls"])
    assert not any("sbatch" in c[1] or "mkdir" in c[1] for c in cluster["calls"] if c[0] == "ssh")
    assert not (cluster["tmp"] / "requirements" / "R_new.dsl").exists()


def test_a_missing_project_copy_is_never_created(cluster):
    cluster["state"]["copy"] = "absent"
    with pytest.raises(cj.ClusterError, match="no project copy"):
        cj.submit(TEXT, "R_new.dsl")
    assert not any("mkdir" in c[1] or "sbatch" in c[1] for c in cluster["calls"] if c[0] == "ssh")


def test_the_requirements_folder_is_made_only_inside_an_existing_copy(cluster):
    cj.submit(TEXT, "R_new.dsl")
    mkdir = [c[1] for c in cluster["calls"] if c[0] == "ssh" and "mkdir" in c[1]]
    assert mkdir == [f"test -d {cj.REMOTE_DIR}/REAL && mkdir -p {cj.REMOTE_DIR}/REAL/requirements"]


def test_the_manifest_is_every_file_a_job_executes_and_nothing_else(cluster):
    m = cj.code_manifest()
    assert {"REAL/api_app.py", "REAL/scripts/scenarios/scratch.temp", "REAL/scripts/templates/v3/scene_v3.bnf",
            "REAL/Scenic/src/scenic/core.py", "REAL/grape/x.py", "run_real_av.slurm"} <= set(m)
    assert not any(p.endswith(".pt") for p in m)


def test_a_missing_grammar_is_named(cluster):
    cluster["state"]["copy"] = "missing"
    with pytest.raises(cj.ClusterError, match="missing there: REAL/scripts/templates/v3/scene_v3.bnf") as e:
        cj.submit(TEXT, "R_new.dsl")
    assert e.value.kind == "stale_copy" and e.value.details["missing"]


def test_a_stale_copy_with_jobs_running_names_the_jobs_and_says_not_to_sync(cluster):
    cluster["state"]["copy"] = "older"
    cluster["state"]["active"] = "5000001 RUNNING\n5000002 PENDING\n"
    with pytest.raises(cj.ClusterError, match="5000001 \\(running\\), 5000002 \\(pending\\).*do not sync") as e:
        cj.submit(TEXT, "R_new.dsl")
    assert [j["job_id"] for j in e.value.details["blocking_jobs"]] == ["5000001", "5000002"]
    assert not any("sbatch" in c[1] for c in cluster["calls"] if c[0] == "ssh")


def test_a_matching_copy_submits_next_to_running_jobs(cluster):
    cluster["state"]["active"] = "5000001 RUNNING\n"
    assert cj.submit(TEXT, "R_new.dsl")["job_id"] == "4999001"


def test_the_tool_never_cancels_or_syncs(cluster):
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = "Q:RUNNING\nA:RUNNING\nP:\nR:\nS:\nM:\n"
    cj.status("4999001")
    sent = " ".join(c[1] for c in cluster["calls"] if c[0] == "ssh")
    assert "scancel" not in sent and "rsync" not in sent
    assert all(c[0] != "copy" or c[2].endswith(".dsl") for c in cluster["calls"])


def test_a_copy_synced_without_a_manifest_is_refused(cluster):
    cluster["state"]["copy"] = "nomanifest"
    with pytest.raises(cj.ClusterError, match="synced without CODE_MANIFEST.txt"):
        cj.submit(TEXT, "R_new.dsl")


def test_a_file_changed_on_the_cluster_after_the_sync_is_caught(cluster):
    cluster["state"]["copy"] = "edited"
    with pytest.raises(cj.ClusterError, match="changed there after the sync: REAL/api_app.py") as e:
        cj.submit(TEXT, "R_new.dsl")
    assert e.value.details["tampered"] == ["REAL/api_app.py"]


def test_the_check_is_one_short_command_not_every_path(cluster):
    cj.submit(TEXT, "R_new.dsl")
    (check,) = cluster["state"]["checks"]
    assert "CODE_MANIFEST.txt" in check and check.count("REAL/") < 10


def test_write_manifest_lists_the_staging_copy_relative_to_it(cluster, tmp_path):
    (tmp_path / "scripts" / "mlops" / "mlruns" / "0").mkdir(parents=True)
    (tmp_path / "scripts" / "mlops" / "mlruns" / "0" / "meta.yaml").write_text("x")
    n = cj.write_manifest(str(tmp_path))
    text = (tmp_path / "CODE_MANIFEST.txt").read_text()
    assert n == len(text.splitlines()) and "  scripts/scenarios/scratch.temp\n" in text
    assert "REAL/" not in text and "mlruns" not in text and "run_real_av.slurm" not in text
