"""A scenario short of its requested repeats is retried longer and, if still
short, reported (study pilot: two scenarios ended at 2 of 3, unflagged)."""
import csv
import json
import types

import pandas as pd

from scripts.analysis.report import short_of_repeats
from scripts.simulations import util


def _falsifier_returning(rhos):
    f = object.__new__(util.falsifier)
    seq = iter(rhos)
    server = types.SimpleNamespace(run_server=lambda: (None, next(seq), None))
    f.falsifier = types.SimpleNamespace(server=server)
    return f


def test_retries_up_to_ten_times_the_trials_and_counts_attempts():
    # 7 attempts with no result, then 3 good ones: 3*trials (9) would stop at 2
    rhos = [1.0, None, None, None, None, None, None, None, 2.0, -1.0]
    fitness = _falsifier_returning(rhos).falsify(num_test=3)
    assert (fitness["total"], fitness["passed"], fitness["failed"]) == (3, 2, 1)
    assert fitness["attempts"] == 10


def test_a_scenario_that_never_runs_stops_at_the_cap(capsys):
    fitness = _falsifier_returning([None] * 100).falsify(num_test=3)
    assert fitness["total"] == 0 and fitness["attempts"] == 30
    assert "0 of 3 simulations after 30 attempts" in capsys.readouterr().out


def test_report_lists_scenarios_short_of_their_repeats(tmp_path):
    with open(tmp_path / "scenarios.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["scenario_id", "pedestrian", "dress", "direction", "fog_density"])
        w.writeheader()
        for sid in ("41", "42", "43"):
            w.writerow({"scenario_id": sid, "pedestrian": "Adult", "dress": "Light", "direction": "RL", "fog_density": "0"})
    df = pd.DataFrame({"scenario_id": ["41", "41", "42", "42", "42", "best_video"]})
    out = short_of_repeats(str(tmp_path), df, {"trials_per_scenario": 3})
    assert [(s["scenario_id"], s["simulated"], s["requested"]) for s in out] == [("41", 2, 3)]
    # 43 has no simulation at all: that is not_simulated's job, not listed twice
    assert short_of_repeats(str(tmp_path), df, {}) == []


def test_the_falsifier_uses_the_server_that_says_why():
    import inspect
    assert issubclass(util.ScenicServerSayingWhy, util.ScenicServer)
    assert "server_class=ScenicServerSayingWhy" in inspect.getsource(util.falsifier.__init__)
