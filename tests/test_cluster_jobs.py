"""Run Test's cluster side (scripts/redsl/cluster_jobs.py) against a fake
cluster: no ssh, no sbatch, no network."""

import json
import os
import shutil
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
        if "md5sum" in command and "CODE_MANIFEST" not in command:     # one scenario list
            return Done(state.get("list_md5", "") + "\n")
        if "md5sum" in command:
            state["checks"].append(command)
            if state["copy"] == "absent":
                return Done("NOREAL\n")
            if state["copy"] == "silent":
                return Done("")
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

    def pull(remote, local, only=None):
        """Copies the fake cluster's run folder (state["remote_run"]), filtered as rsync would."""
        calls.append(("pull", remote, local, only))
        src = state.get("remote_run")
        if src:
            for folder, _, names in os.walk(src):
                for n in names:
                    rel = os.path.relpath(os.path.join(folder, n), src)
                    if only and not (rel in only or rel.startswith("traces" + os.sep)):
                        continue
                    os.makedirs(os.path.dirname(os.path.join(local, rel)), exist_ok=True)
                    shutil.copy(os.path.join(src, rel), os.path.join(local, rel))
        return Done()

    def pull_file(remote, local):
        calls.append(("pull_file", remote, local))
        os.makedirs(os.path.dirname(local), exist_ok=True)
        with open(local, "w") as f:
            f.write("job log\n")
        return Done()

    def preflight(text, options):
        calls.append(("preflight", options))
        return state["laptop"]

    state["laptop"] = {"ok": True, "kind": None, "checked": 4, "how": "every listed scenario",
                       "system_under_test": {"braking_mode": "proportional_braking", "yolo_model": "yolov5s"},
                       "failures": [], "message": None}
    monkeypatch.setattr(cj, "_LAPTOP_CACHE", {})
    monkeypatch.setattr(cj, "RUNNER", {"ssh": ssh, "copy": copy, "pull": pull, "pull_file": pull_file,
                                       "preflight": preflight})
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
    assert {k: s[k] for k in ("state", "progress", "run_id", "ok")} == {
        "state": "RUNNING", "progress": {"done": 12, "total": 32},
        "run_id": "0123456789abcdef0123456789abcdef", "ok": None}
    done = cj.parse_status("Q:\nA:COMPLETED \nP:[grid] scenario 32/32\n"
                           "R:'run_id': 'fedcba9876543210fedcba9876543210'\nS:'STATUS': 'OK'\nM:\n")
    assert done["state"] == "COMPLETED" and done["ok"] is True
    assert done["run_id"] == "fedcba9876543210fedcba9876543210"


def test_fetch_pulls_a_completed_run_and_refuses_an_unfinished_one(cluster, monkeypatch):
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = "Q:RUNNING\nA:RUNNING\nP:[grid] scenario 3/32\nR:\nS:\nM:\n"
    with pytest.raises(cj.ClusterError, match="not ended yet"):
        cj.fetch("4999001")
    run = "fedcba9876543210fedcba9876543210"
    cluster["state"]["status"] = f"Q:\nA:COMPLETED\nP:\nR:'run_id': '{run}'\nS:'STATUS': 'OK'\nM:\n"
    written = []
    from scripts.analysis import cluster_map, report
    monkeypatch.setattr(report, "write_report", lambda d, **k: written.append(("report", d)))
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


def _sbatch(cluster):
    return next(c[1] for c in cluster["calls"] if c[0] == "ssh" and "sbatch" in c[1])


def _list_file(cluster, name="scenarios_v3.txt"):
    path = cluster["tmp"] / "infra" / "hpc" / "smoke" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("A { pedestrian : Adult } scene one\nA { pedestrian : Child } scene two\n")
    return f"infra/hpc/smoke/{name}"


def test_a_default_grid_is_the_job_scripts_defaults(cluster):
    record = cj.submit(TEXT, "R_new.dsl")
    assert _sbatch(cluster).endswith(
        "sbatch --parsable --time=05:00:00 --export=ALL,REAL_REQUIREMENT_FILE=requirements/R_new.dsl,"
        "REAL_SEARCH=grid,REAL_TRIALS=5 run_real_av.slurm")
    assert record["command"] in _sbatch(cluster)
    assert record["options"] == {"search": "grid", "trials": 5, "time": "05:00:00"}
    assert record["laptop_check"]["system_under_test"]["braking_mode"] == "proportional_braking"


def test_a_quick_list_check_copies_the_list_and_names_it(cluster):
    lst = _list_file(cluster)
    record = cj.submit(TEXT, "R_new.dsl", {"search": "list", "trials": 1, "time": cj.QUICK_TIME,
                                           "scenario_file": lst})
    assert ("--time=00:45:00 --export=ALL,REAL_REQUIREMENT_FILE=requirements/R_new.dsl,REAL_SEARCH=list,"
            "REAL_TRIALS=1,REAL_SCENARIOS=requirements/lists/scenarios_v3.txt run_real_av.slurm") in _sbatch(cluster)
    assert (cluster["tmp"] / "requirements" / "lists" / "scenarios_v3.txt").exists()
    assert any(c[0] == "copy" and c[2].endswith("/REAL/requirements/lists/scenarios_v3.txt")
               for c in cluster["calls"])
    assert record["variables"]["REAL_SCENARIOS"] == "requirements/lists/scenarios_v3.txt"


def test_a_ge_search_and_provenance_reach_the_job(cluster):
    run = "0123456789abcdef0123456789abcdef"
    cj.submit(TEXT, "R_new.dsl", {"search": "ge", "grammar": "v3/scene_v3.bnf", "parent_run_id": run, "round": 3})
    assert ("REAL_SEARCH=ge,REAL_TRIALS=2,REAL_POPULATION=16,REAL_GENERATIONS=6,REAL_GRAMMAR=v3/scene_v3.bnf,"
            f"REAL_PARENT_RUN_ID={run},REAL_ROUND=3 run_real_av.slurm") in _sbatch(cluster)


@pytest.mark.parametrize("options, says", [
    ({"time": "06:00:00"}, "at most 05:00:00"),
    ({"time": "45 min"}, "HH:MM:SS"),
    ({"trials": 0}, "at least 1"),
    ({"population": 8}, "only apply to a GE search"),
    ({"search": "ge", "scenario_file": "x.txt"}, "only applies to a list run"),
    ({"search": "list", "scenario_file": "nowhere.txt"}, "exists in the project"),
    ({"search": "ge", "grammar": "../../etc/passwd.bnf"}, "no grammar"),
    ({"search": "walk"}, "search must be one of"),
    ({"budget": 3}, "unknown option"),
    ({"parent_run_id": "abc"}, "32-character"),
])
def test_bad_options_are_refused_before_anything_runs(cluster, options, says):
    with pytest.raises(cj.ClusterError, match=says) as e:
        cj.submit(TEXT, "R_new.dsl", options)
    assert e.value.kind == "options" and cluster["calls"] == []


@pytest.mark.parametrize("kind", ["module", "scene"])
def test_a_failed_laptop_check_never_reaches_the_cluster(cluster, kind):
    cluster["state"]["laptop"] = {"ok": False, "kind": kind, "message": f"a {kind} problem",
                                  "failures": [{"scenario": "s", "error": "e"}] if kind == "scene" else []}
    with pytest.raises(cj.ClusterError, match=f"a {kind} problem. Nothing was submitted") as e:
        cj.submit(TEXT, "R_new.dsl")
    assert e.value.kind == kind
    assert [c[0] for c in cluster["calls"]] == ["preflight"]
    assert not (cluster["tmp"] / "requirements" / "R_new.dsl").exists()


# ---------------------------------------------------------------- following a run
RUN = "fedcba9876543210fedcba9876543210"
# lines as a real job log prints them (ids, node and ports made up)
REAL_LOG_STATUS = (
    "Q:RUNNING\n"
    "A:RUNNING|2026-10-13T08:14:32|00:21:10|nc00001|00:45:00\n"
    "K:Ports: CARLA 23288 (traffic manager 29288), Redis 33822, MLflow 34822, API 35822\n"
    "P:[grid] scenario 3/4\nR:\nS:\nE:\nT:9\nX:4\nW:0\n"
    f"M:artifacts/runs/{RUN}/run_meta.json\n"
    "L:[2026-10-13 08:34:04 -0400] [1795191] [ERROR] Error handling request /api/2.0/mlflow/runs/get\n"
    "L:Traceback (most recent call last):\n"
    "L:[grid] scenario 3/4: A { pedestrian : Adult } wearing a {dress : Light} dress\n"
)


def test_status_reads_what_the_job_is_doing(cluster):
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = REAL_LOG_STATUS
    r = cj.status("4999001")
    assert r["ports"].startswith("CARLA 23288") and r["node"] == "nc00001" and r["elapsed"] == "00:21:10"
    assert r["started_at"] == "2026-10-13T08:14:32" and r["time_limit"] == "00:45:00"
    assert r["progress"] == {"done": 3, "total": 4} and r["run_id"] == RUN
    assert r["tracebacks"] == 9 and r["mlflow_server_errors"] == 4 and len(r["log_tail"]) == 3
    assert r["message"] is None


def test_the_run_id_is_never_guessed_between_two_candidates():
    two = "A:RUNNING|2026-10-13T08:00:00|||\nM:artifacts/runs/" + "a" * 32 + "/run_meta.json\nM:artifacts/runs/" + "b" * 32 + "/run_meta.json\n"
    assert cj.parse_status(two)["run_id"] is None
    assert cj.parse_status(two + f"R:'run_id': '{RUN}'\n")["run_id"] == RUN


def test_the_api_error_and_a_bad_end_are_said_with_the_evidence(cluster):
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = "Q:\nA:COMPLETED|2026-10-13T08:00:00|00:03:00|n|00:45:00\nE:'error': 'unknown braking module x'\n"
    assert cj.status("4999001")["message"] == "the API answered NOT OK: unknown braking module x"
    cluster["state"]["status"] = ("Q:\nA:TIMEOUT|2026-10-13T08:00:00|00:45:00|n|00:45:00\n"
                                  "L:[grid] scenario 3/4: ...\nL:CANCELLED DUE TO TIME LIMIT\n")
    m = cj.status("4999001")["message"]
    assert m.startswith("the job ended timeout after 00:45:00") and "TIME LIMIT" in m


def _remote_run(tmp_path, scenarios_done, total=4):
    src = tmp_path / "remote" / RUN
    (src / "traces").mkdir(parents=True, exist_ok=True)
    (src / "frames").mkdir(exist_ok=True)
    (src / "frames" / "0001.png").write_text("png")
    (src / "best_scenario.mp4").write_text("mp4")
    (src / "run_meta.json").write_text(json.dumps({"run_id": RUN, "mode": "list", "n_scenarios": total}))
    (src / "scenarios.csv").write_text("scenario_id,phenotype\n" + "".join(f"{i},s{i}\n" for i in range(scenarios_done)))
    (src / "simulations.csv").write_text("scenario_id\n" + "".join(f"{i}\n" for i in range(scenarios_done)))
    (src / "traces" / f"{scenarios_done}.json").write_text("{}")
    return src


def test_partial_pulls_bring_light_files_and_keep_every_partial_report(cluster, monkeypatch):
    from scripts.analysis import report
    written = []

    def fake_report(run_dir, out_dir=None, banner=None, **k):
        os.makedirs(out_dir, exist_ok=True)
        open(os.path.join(out_dir, "analysis_report.json"), "w").write(json.dumps({"banner": banner}))
        written.append((out_dir, banner))

    monkeypatch.setattr(report, "write_report", fake_report)
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = REAL_LOG_STATUS
    cluster["state"]["remote_run"] = str(_remote_run(cluster["tmp"], 2))
    r = cj.refresh_partial("4999001")
    local = cluster["tmp"] / "artifacts" / "runs" / RUN
    assert r["partial"] == {"done": 2, "total": 4}
    assert (local / "simulations.csv").exists() and (local / "traces" / "2.json").exists()
    assert not (local / "frames").exists() and not (local / "best_scenario.mp4").exists()
    assert written == [(str(local / "partial" / "after_2_of_4"), "PARTIAL (2 of 4 scenarios) - the job is still running")]
    assert json.loads((local / "partial" / "latest.json").read_text())["folder"] == "partial/after_2_of_4"
    assert not (local / "analysis_report.json").exists()          # the main report is the final one only

    cluster["state"]["remote_run"] = str(_remote_run(cluster["tmp"], 3))
    cj.refresh_partial("4999001")                                  # within 5 minutes: nothing
    assert len(written) == 1
    cj._update("4999001", partial_at="2000-01-01T00:00:00+00:00")
    cj.refresh_partial("4999001")
    assert (local / "partial" / "after_2_of_4").exists() and (local / "partial" / "after_3_of_4").exists()


def test_a_failing_partial_analysis_waits_instead_of_crashing(cluster, monkeypatch):
    from scripts.analysis import report

    def broken(*a, **k):
        raise ValueError("half-written row")

    monkeypatch.setattr(report, "write_report", broken)
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = REAL_LOG_STATUS
    cluster["state"]["remote_run"] = str(_remote_run(cluster["tmp"], 1))
    assert "half-written row" in cj.refresh_partial("4999001")["partial_message"]


def test_a_timed_out_run_is_pulled_whole_with_its_log_and_labelled_incomplete(cluster, monkeypatch):
    from scripts.analysis import cluster_map, report
    banners = []
    monkeypatch.setattr(report, "write_report", lambda d, banner=None, **k: banners.append(banner))
    monkeypatch.setattr(cluster_map, "run", lambda d: None)
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["remote_run"] = str(_remote_run(cluster["tmp"], 3))
    cluster["state"]["status"] = (f"Q:\nA:TIMEOUT|2026-10-13T08:00:00|00:45:00|n|00:45:00\n"
                                  f"M:artifacts/runs/{RUN}/run_meta.json\n")
    r = cj.fetch("4999001")
    local = cluster["tmp"] / "artifacts" / "runs" / RUN
    assert r["fetched"] and r["complete"] is False
    assert (local / "best_scenario.mp4").exists() and (local / "job_log.out").exists()
    assert banners == ["INCOMPLETE (3 of 4 scenarios) - the job ended timeout"]


def test_a_job_that_never_made_a_run_keeps_its_log(cluster):
    cj.submit(TEXT, "R_new.dsl")
    cluster["state"]["status"] = "Q:\nA:FAILED|2026-10-13T08:00:00|00:01:00|n|00:45:00\nL:API process died during start-up\n"
    r = cj.fetch("4999001")
    (pulled,) = [c for c in cluster["calls"] if c[0] == "pull_file"]
    assert r["fetched"] and pulled[2].endswith(os.path.join("job_logs", "R_new.dsl.4999001.out"))
    assert "API process died" in r["message"]


def test_a_list_identical_in_the_cluster_copy_is_named_by_its_own_path(cluster):
    lst = _list_file(cluster)
    cluster["state"]["list_md5"] = cj._md5(str(cluster["tmp"] / lst)) + "  x"
    cj.submit(TEXT, "R_new.dsl", {"search": "list", "trials": 1, "time": cj.QUICK_TIME, "scenario_file": lst})
    assert f"REAL_SCENARIOS={lst} run_real_av.slurm" in _sbatch(cluster)
    assert not any(c[0] == "copy" and "lists" in c[2] for c in cluster["calls"])


def test_the_api_error_is_read_in_either_quote():
    line = "E:{'error': \"API request to http://127.0.0.1:34821/api/2.0/mlflow/runs/log-batch failed\", 'STATUS': 'NOT OK'}\n"
    assert cj.parse_status(line)["api_error"].startswith("API request to")
    assert cj.parse_status("E:{'error': 'unknown braking module x', 'STATUS': 'NOT OK'}\n")["api_error"] == "unknown braking module x"


def test_an_empty_answer_is_a_failed_check_not_every_file_missing(cluster, monkeypatch):
    monkeypatch.setattr(cj.settings, "artifacts_dir", str(cluster["tmp"] / "artifacts"))
    cluster["state"]["copy"] = "silent"
    with pytest.raises(cj.ClusterError, match="did not answer the code check properly") as e:
        cj.submit(TEXT, "R_new.dsl")
    assert e.value.kind == "no_answer"
    (kept,) = list((cluster["tmp"] / "artifacts" / "cluster_checks").glob("*_empty_answer.txt"))
    assert "return code 0" in kept.read_text()
    assert not any("sbatch" in c[1] for c in cluster["calls"] if c[0] == "ssh")


def test_the_laptop_check_is_reused_for_the_same_text_and_options_only(cluster):
    first = cj.check_laptop(TEXT, {"search": "grid"})
    assert first["ok"] and cj.check_laptop(TEXT, {"search": "grid"}) is first
    cj.submit(TEXT, "R_new.dsl", {"search": "grid"})
    assert [c[0] for c in cluster["calls"]].count("preflight") == 1     # Submit reused it
    cj.check_laptop(TEXT + "# changed\n", {"search": "grid"})
    cj.check_laptop(TEXT, {"search": "grid", "trials": 2})
    assert [c[0] for c in cluster["calls"]].count("preflight") == 3


def test_the_cluster_check_says_what_failed_and_how_to_sync(cluster):
    cluster["state"]["session"] = False
    with pytest.raises(cj.ClusterError) as e:
        cj.check_cluster()
    assert e.value.kind == "no_session" and e.value.details["host"] == cj.HOST
    cluster["state"]["session"] = True
    cluster["state"]["copy"] = "older"
    with pytest.raises(cj.ClusterError) as e:
        cj.check_cluster()
    commands = e.value.details["sync_commands"]
    assert len(commands) == 3 and "--manifest" in commands[0] and commands[2].startswith("scp ")
    cluster["state"]["copy"] = "same"
    assert cj.check_cluster()["ok"]
