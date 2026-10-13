"""Per-job ports in the Slurm job script: two jobs never share a port, so
several can run on one node."""

import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "infra", "hpc", "run_real_av.slurm")


def _ports(job_id):
    text = open(SCRIPT).read()
    block = re.search(r"# --- per-job ports -+\n(.*?)# --- end per-job ports", text, re.S).group(1)
    out = subprocess.run(["bash", "-c", block + '\necho "$CARLA_PORT $REDIS_PORT $MLFLOW_PORT $API_PORT"'],
                         env={"SLURM_JOB_ID": str(job_id), "PATH": os.environ["PATH"]},
                         capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
    carla, redis, mlflow, api = map(int, out.split())
    return {carla, carla + 1, carla + 6000, redis, mlflow, api}


def test_consecutive_jobs_never_share_a_port():
    for a, b in ((4972493, 4972494), (1000, 1001), (999, 1000)):
        assert not (_ports(a) & _ports(b))


def test_ports_stay_in_range_and_apart():
    for job in (0, 1, 499, 998, 999, 4972493):
        ports = _ports(job)
        assert len(ports) == 6 and all(1024 < p < 65535 for p in ports)


def test_scene_connects_to_the_jobs_carla_port(monkeypatch):
    import real_config
    from scripts.simulations import util
    monkeypatch.setattr(real_config.settings, "carla_port", 20123)
    code, _ = util.build_scenario("A { pedestrian : Adult } wearing a {dress : Light} dress trying to cross road "
                                  "from { direction : LR } at { distance : Short } distance on a day with fog "
                                  "density {fog_density : 0}")
    assert "param port = 20123" in code


def test_each_job_has_its_own_mlflow_store():
    text = open(SCRIPT).read()
    assert 'MLFLOW_STORE="/artifacts/mlflow/job_${SLURM_JOB_ID:-local}"' in text
    assert '--backend-store-uri "$MLFLOW_STORE/backend"' in text
    assert "/artifacts/mlflow_backend" not in text            # the shared store is gone


def test_mlflow_failure_does_not_stop_a_run(monkeypatch):
    from scripts.simulations import util

    class FakeFalsifier:
        def __init__(self, code):
            pass

        def falsify(self, num_test=5):
            return {"total": num_test, "passed": num_test, "failed": 0, "pct": 100.0}

    def broken_run(*a, **k):
        raise RuntimeError("log-batch: too many 500 error responses")

    monkeypatch.setattr(util, "falsifier", FakeFalsifier)
    monkeypatch.setattr(util.mlflow, "start_run", broken_run)
    monkeypatch.setattr(util, "_publish_yolo_model", lambda name: None)
    phen = ("A { pedestrian : Adult } wearing a {dress : Light} dress trying to cross road from "
            "{ direction : LR } at { distance : Short } distance on a day with fog density {fog_density : 0}")
    fitness = util.evaluate_phenotype(phen, num_test=2, scenario_id="t", log_mlflow=True)
    assert fitness == {"total": 2, "passed": 2, "failed": 0, "pct": 100.0}
