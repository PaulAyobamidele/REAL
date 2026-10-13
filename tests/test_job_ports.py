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
