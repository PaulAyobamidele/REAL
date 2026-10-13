"""The simulator's monitor (pass/fail and GE's fitness) and the analysis use
the same safety rule, so a search cannot optimise a rule the analysis does
not use."""

import random

import pandas as pd

from scripts.analysis import trace_measures as tm


def _rho(values):
    return min(values)


def test_path_rule_ignores_a_pedestrian_on_the_pavement():
    distances = [20.0, 12.0, 8.0, 3.5]
    laterals = [-2.8, -1.0, 2.0, 3.6]                 # last step: on the far pavement
    assert _rho(tm.safe_values(distances, laterals, "anywhere")) < 0
    assert _rho(tm.safe_values(distances, laterals, "path")) > 0


def test_path_rule_still_fails_a_close_call_in_the_lane():
    assert _rho(tm.safe_values([20.0, 9.0, 3.0], [-2.8, -1.0, 0.3], "path")) < 0


def test_no_lateral_series_falls_back_to_anywhere():
    assert tm.safe_values([6.0, 4.0], None, "path") == tm.safe_values([6.0, 4.0], None, "anywhere")


def test_monitor_and_analysis_agree_on_random_traces():
    rng = random.Random(3)
    for _ in range(200):
        n = rng.randint(2, 40)
        distances = [rng.uniform(0.5, 30) for _ in range(n)]
        laterals = [rng.uniform(-5, 5) for _ in range(n)]
        monitor_pass = _rho(tm.safe_values(distances, laterals, "path")) > 0
        pmd = tm.path_min_distance(distances, laterals)
        analysis_pass = pmd is None or pmd > tm.SAFETY_MARGIN_M
        assert monitor_pass == analysis_pass


def test_anywhere_verdict_comes_from_rho_anywhere_when_recorded():
    # a newer run: the monitor's `passed` follows the path rule; rho_anywhere is negative
    df = pd.DataFrame({"passed": [True], "rho_anywhere": ["-1.5"], "path_min_distance_m": [9.0],
                       "crossed": [True]})
    out = tm.apply_safety_rule(df, "anywhere")
    assert out.loc[0, "passed"] == False and out.loc[0, "passed_anywhere"] == False  # noqa: E712
    out = tm.apply_safety_rule(df, "path")
    assert out.loc[0, "passed"] == True and out.loc[0, "passed_anywhere"] == False  # noqa: E712
    # an older run: no rho_anywhere, the monitor's verdict is the anywhere rule
    old = pd.DataFrame({"passed": [False]})
    assert tm.apply_safety_rule(old, "anywhere").loc[0, "passed"] == False            # noqa: E712
