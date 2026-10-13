"""Failure-trace clustering prototype (scripts/analysis/cluster.py): the event
encoder on hand-made series and the distance on known pairs. No CARLA."""

import numpy as np
import pytest

from scripts.analysis import cluster

E = cluster.EVENT_ID


def make_trace(distance, speed, conf, brakes=()):
    return {"distance_m": list(distance), "ego_speed": list(speed),
            "detections": [{"step": s, "confidence": c} for s, c in enumerate(conf)],
            "brakes": [{"step": s, "brake": 1.0} for s in brakes]}


def as_names(sequence):
    return [cluster.names(s) for s in sequence]


# --- encoder ----------------------------------------------------------------

def test_too_late_series_encodes_in_order_and_ends_at_closest_approach():
    trace = make_trace(distance=[22, 18, 12, 8, 4, 3, 6],
                       speed=[3, 7, 7, 7, 6, 4, 4],
                       conf=[0, 0.4, 0.5, 0.9, 0.9, 0.1, 0.0],
                       brakes=[3, 4])
    seq = cluster.encode_trace(trace, terminal_step=5, frames=1)
    assert as_names(seq) == [   # names come out in event-id order within a step
        ["first detected (>0.30)", "closing to 20-10 m"],
        ["detection reaches 0.85", "braking begins", "closing to 10-5 m"],
        ["safety violated (<5 m)"],
        ["detection lost (<=0.30 after 0.85)", "braking released while moving", "closest approach"],
    ]
    assert cluster.TERMINAL in seq[-1]          # anchored on the terminal event
    assert all(cluster.TERMINAL not in s for s in seq[:-1])


def test_step_is_a_set_not_a_sum():
    # two events in one step stay two names; nothing is added up
    trace = make_trace([22, 21], [3, 3], [0.9, 0.9], brakes=[0, 1])
    (first, last) = cluster.encode_trace(trace, terminal_step=1, frames=1)
    assert isinstance(first, frozenset)
    assert first == {E["first detected (>0.30)"], E["detection reaches 0.85"], E["braking begins"]}
    assert last == {E["closest approach"]}


def test_quiet_steps_emit_nothing_so_duration_does_not_count():
    short = make_trace([22, 15, 4], [3, 7, 7], [0, 0, 0])
    long_ = make_trace([22] * 10 + [15] * 10 + [4], [3] + [7] * 20, [0] * 21)
    assert cluster.encode_trace(short, 2) == cluster.encode_trace(long_, 20)


def test_nothing_after_the_terminal_step_is_encoded():
    trace = make_trace([22, 10, 4, 4, 10, 20], [3, 7, 7, 0.1, 3, 7], [0, 0, 0, 0, 0, 0])
    seq = cluster.encode_trace(trace, terminal_step=2)
    assert cluster.TERMINAL in seq[-1]
    assert E["ego stops"] not in set().union(*seq)


def test_detection_flicker_needs_consecutive_frames():
    # one-frame blips above 0.30 at long range are not a detection; three in a row are
    conf = [0.4, 0, 0.35, 0, 0.5, 0.5, 0.5, 0]
    trace = make_trace([22] * 8, [3] * 8, conf)
    seq = cluster.encode_trace(trace, terminal_step=7, frames=3)
    first = [i for i, s in enumerate(seq) if E["first detected (>0.30)"] in s]
    assert len(first) == 1
    assert cluster.encode_trace(trace, 7, frames=1)[0] >= {E["first detected (>0.30)"]}  # N=1 fires at step 0


def test_detection_lost_needs_consecutive_frames():
    conf = [0.9, 0.0, 0.9, 0.0, 0.0, 0.0, 0.9]
    trace = make_trace([22] * 7, [3] * 7, conf)
    flat = [n for s in as_names(cluster.encode_trace(trace, 6, frames=3)) for n in s]
    assert flat.count("detection lost (<=0.30 after 0.85)") == 1   # the 1-frame gap is not a loss
    assert flat.count("detection reaches 0.85") == 3


def test_lane_entry_and_exit_from_lateral_offset():
    trace = make_trace([22, 18, 12, 8, 6, 4], [3] * 6, [0] * 6)
    trace["ped_lateral_m"] = [-3.0, -2.4, 0.0, 2.4, 3.1, 3.5]   # crosses the lane, ends on the far kerb
    flat = [n for s in as_names(cluster.encode_trace(trace, 5)) for n in s]
    assert flat.index("pedestrian enters the ego's lane") < flat.index("pedestrian leaves the ego's lane")
    assert flat.count("pedestrian enters the ego's lane") == 1


def test_no_lateral_series_means_no_lane_events():
    trace = make_trace([22, 4], [3, 3], [0, 0])
    lane = {E["pedestrian enters the ego's lane"], E["pedestrian leaves the ego's lane"]}
    assert not lane & set().union(*cluster.encode_trace(trace, 1))


def test_stop_and_resume_with_spawn_transient_ignored():
    # speed dips at step 1 (spawn) - not a stop; the real stop is at step 4
    trace = make_trace(distance=[22, 22, 15, 9, 7, 7, 6, 3],
                       speed=[2.0, 0.3, 5, 6, 0.2, 0.6, 1.5, 3],
                       conf=[0, 0, 0, 0.9, 0.9, 0.86, 0.6, 0.9], brakes=[3, 4, 5])
    seq = cluster.encode_trace(trace, terminal_step=7)
    flat = [n for s in as_names(seq) for n in s]
    assert flat.count("ego stops") == 1 and flat.count("ego resumes") == 1
    assert flat.index("ego stops") < flat.index("ego resumes")
    # braking released at step 6 while moving again
    assert "braking released while moving" in flat


def test_distance_bands_use_running_minimum_so_jitter_cannot_repeat():
    trace = make_trace([22, 19.9, 20.1, 19.9, 20.1, 4], [3] * 6, [0] * 6)
    flat = [n for s in as_names(cluster.encode_trace(trace, 5)) for n in s]
    assert flat.count("closing to 20-10 m") == 1


def test_duplicate_detection_rows_keep_one_value():
    trace = make_trace([22, 4], [3, 3], [0, 0])
    trace["detections"].append({"step": 1, "confidence": 0.0})
    assert len(cluster.encode_trace(trace, 1)) == 1


def test_event_names_are_unique_and_every_output_name_is_in_the_map():
    assert len(set(cluster.EVENTS.values())) == len(cluster.EVENTS)
    assert all(name in cluster.EVENT_ID for _, name in cluster.BANDS[1:])


# --- distance ---------------------------------------------------------------

A, B, C = frozenset({1}), frozenset({1, 2}), frozenset({3})


def test_substitution_is_set_difference_not_any_mismatch():
    assert cluster.substitution_cost(A, A) == 0
    assert cluster.substitution_cost(A, B) == pytest.approx(0.5)   # share one of two
    assert cluster.substitution_cost(A, C) == 1


def test_distance_known_pairs():
    assert cluster.sequence_distance([A, C], [A, C]) == 0
    assert cluster.sequence_distance([], []) == 0
    assert cluster.sequence_distance([A], []) == 1
    assert cluster.sequence_distance([A, C], [B, C]) == pytest.approx(0.5 / 2)   # one half-substitution
    assert cluster.sequence_distance([A, C], [A, B, C]) == pytest.approx(1 / 3)  # one insertion
    assert cluster.sequence_distance([A, C], [C, A]) == pytest.approx(1.0)       # order matters


def test_distance_is_symmetric_and_bounded():
    seqs = [[A], [A, B], [C, A, B], [B, B, B, C]]
    for s in seqs:
        for t in seqs:
            d = cluster.sequence_distance(s, t)
            assert 0 <= d <= 1 and d == pytest.approx(cluster.sequence_distance(t, s))


def test_ids_that_sum_alike_stay_apart():
    # DYNASTO's sum encoding makes {1, 2} and {3} the same symbol (1+2 = 3)
    assert cluster.sequence_distance([frozenset({1, 2})], [frozenset({3})]) == 1


def test_cut_is_deterministic_and_separates_obvious_groups():
    d = np.array([[0, .1, .9, .9], [.1, 0, .9, .9], [.9, .9, 0, .1], [.9, .9, .1, 0]])
    a = cluster.cut(d, "average", 0.5)
    assert a[0] == a[1] != a[2] == a[3]
    assert (cluster.cut(d, "average", 0.5) == a).all()
