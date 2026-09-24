import csv
import json
import os

from scripts.evolve.run_output import new_run_id, persist_run, run_dir

PHENOTYPE = (
    "A { pedestrian : Adult } wearing a {dress : Light} dress trying to cross road "
    "from { direction : LR } at { distance : Short } distance on a day with "
    "fog density {fog_density : 0}"
)


class _FakeIndividual:
    def __init__(self, phenotype):
        self.phenotype = phenotype


class _FakeHof(list):
    pass


def test_new_run_id_is_unique():
    assert new_run_id() != new_run_id()


def test_run_dir_creates_directory(tmp_path, monkeypatch):
    import real_config

    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))
    run_id = new_run_id()
    path = run_dir(run_id)
    assert os.path.isdir(path)
    assert path == str(tmp_path / "runs" / run_id)


def test_persist_run_writes_expected_files(tmp_path, monkeypatch):
    import real_config

    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))

    run_id = new_run_id()
    logbook = [
        {"gen": 0, "avg": 1.5, "min": 0.5, "max": 2.5},
        {"gen": 1, "avg": 1.0, "min": 0.2, "max": 2.0},
    ]
    hof = _FakeHof([_FakeIndividual(PHENOTYPE)])

    out_dir = persist_run(
        run_id,
        logbook,
        hof,
        requirement="a pedestrian crossing in fog",
        scenario_text="a pedestrian crossing in fog",
        constraints={"pedestrian": "Adult"},
        record_video=False,  # no CARLA available in this environment
    )

    assert out_dir == run_dir(run_id)

    with open(os.path.join(out_dir, "run_meta.json")) as f:
        meta = json.load(f)
    assert meta["run_id"] == run_id
    assert meta["best_phenotype"] == PHENOTYPE
    assert meta["constraints"] == {"pedestrian": "Adult"}

    with open(os.path.join(out_dir, "generations.csv")) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 2
    assert rows[0]["gen"] == "0"

    with open(os.path.join(out_dir, "best_phenotype.txt")) as f:
        assert f.read() == PHENOTYPE

    scenic_path = os.path.join(out_dir, "best_scenario.scenic")
    assert os.path.exists(scenic_path)
    with open(scenic_path) as f:
        code = f.read()
    # Faithfully reflects what the real GE search actually ran (scratch.temp
    # via scripts/simulations/util.py), including the config-driven map path
    # and the resolved CARLA walker blueprint (not the raw "Adult" phenotype
    # value - see the fix in scripts/simulations/util.py::evaluate()).
    assert "walker.pedestrian." in code
    assert "<" not in code  # no leftover unresolved template placeholders


def test_persist_run_handles_empty_hof(tmp_path, monkeypatch):
    import real_config

    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))

    run_id = new_run_id()
    out_dir = persist_run(run_id, [], _FakeHof(), record_video=False)

    with open(os.path.join(out_dir, "best_phenotype.txt")) as f:
        assert f.read() == ""
    assert os.path.exists(os.path.join(out_dir, "best_scenario.scenic"))
