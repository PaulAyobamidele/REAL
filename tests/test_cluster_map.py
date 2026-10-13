"""The encounter map for the review interface (scripts/analysis/cluster_map.py):
positions, cut and document shape on hand-made sequences. No CARLA, no run folder."""

import numpy as np
import pytest

from scripts.analysis import cluster, cluster_map

E = cluster.EVENT_ID


def seq(*steps):
    return [frozenset(E[name] for name in step) for step in steps]


STALL = seq(["closing to 20-10 m"], ["braking begins"], ["ego stops"], ["closest approach"])
STALL_LATE = seq(["closing to 20-10 m"], ["first detected (>0.30)"], ["braking begins"], ["ego stops"],
                 ["closest approach"])
RELEASE = seq(["closing to 20-10 m"], ["braking begins"], ["braking released while moving"],
              ["closing to 10-5 m"], ["safety violated (<5 m)"], ["closest approach"])
RELEASE_2 = seq(["closing to 20-10 m"], ["braking begins", "first detected (>0.30)"],
                ["braking released while moving"], ["closing to 10-5 m"], ["safety violated (<5 m)"],
                ["closest approach"])


def encounter(i, sequence, ftype, **settings):
    return {"scenario_id": str(i // 2), "sim_index": i % 2, "failure_type": ftype,
            "failed": ftype in ("brake_released", "detected_too_late"),
            "settings": {"pedestrian": "Adult", "dress": "Light", "direction": "LR",
                         "distance": "Short", "fog_density": "0", **settings},
            "sequence": sequence}


def two_groups():
    stalls = [encounter(i, STALL if i % 2 else STALL_LATE, "passed_stalled") for i in range(6)]
    releases = [encounter(6 + i, RELEASE if i % 2 else RELEASE_2, "brake_released", dress="Dark")
                for i in range(4)]
    return stalls + releases


def test_embedding_keeps_identical_sequences_together_and_is_deterministic():
    d = cluster.distance_matrix([e["sequence"] for e in two_groups()])
    a, quality = cluster_map.embed(d)
    b, _ = cluster_map.embed(d)
    assert np.allclose(a, b)
    assert np.allclose(a[1], a[3]) and np.allclose(a[7], a[9])     # same sequence, same place
    near = np.linalg.norm(a[1] - a[3])
    far = np.linalg.norm(a[1] - a[7])
    assert far > near
    assert 0 < quality["variance_2d"] <= 1
    assert quality["rank_correlation"] > 0.8


def default(doc):
    cut = doc["cuts"][doc["default_cut"]]
    return cut, {(p["scenario_id"], p["sim_index"]): a for p, a in zip(doc["points"], cut["assignment"])}


def test_cut_separates_the_two_patterns_and_numbers_clusters_by_size():
    encounters = two_groups()
    doc = cluster_map.build(encounters, {"run_id": "x"}, max_clusters=2)
    cut, _ = default(doc)
    by_cluster = {}
    for p, a in zip(doc["points"], cut["assignment"]):
        by_cluster.setdefault(a, set()).add(p["failure_type"])
    assert sorted(len(v) for v in by_cluster.values()) == [1, 1]   # each cluster one pattern
    sizes = [c["size"] for c in cut["groups"]]
    assert sizes == sorted(sizes, reverse=True) and cut["groups"][0]["cluster"] == 1
    assert cut["silhouette"] > 0.5


def test_one_cut_per_cluster_count_and_the_default_is_the_best():
    doc = cluster_map.build(two_groups(), {"run_id": "x"})
    counts = [c["clusters"] for c in doc["cuts"]]
    assert counts == sorted(set(counts)) and all(2 <= k <= cluster_map.MAX_CLUSTERS for k in counts)
    best = max(c["silhouette"] for c in doc["cuts"])
    assert doc["cuts"][doc["default_cut"]]["silhouette"] == best
    assert all(len(c["assignment"]) == len(doc["points"]) for c in doc["cuts"])


def test_cluster_cards_carry_medoid_outcomes_and_over_represented_settings():
    cut, _ = default(cluster_map.build(two_groups(), {"run_id": "x"}, max_clusters=2))
    release = next(c for c in cut["groups"] if "brake_released" in c["outcomes"])
    assert release["failed"] == release["size"] == 4
    assert release["medoid_sequence"][-1] == ["closest approach"]
    assert {"setting": "dress", "value": "Dark", "in_cluster": 1.0, "overall": 0.4} \
        in release["over_represented_settings"]
    stall = next(c for c in cut["groups"] if "passed_stalled" in c["outcomes"])
    assert stall["failed"] == 0


def test_points_join_by_scenario_and_sim_index():
    doc = cluster_map.build(two_groups(), {"run_id": "x"})
    keys = [(p["scenario_id"], p["sim_index"]) for p in doc["points"]]
    assert len(keys) == len(set(keys)) == 10
    assert all(isinstance(p["x"], float) and isinstance(p["y"], float) for p in doc["points"])


def test_cut_takes_the_highest_silhouette_within_the_cluster_cap():
    d = cluster.distance_matrix([e["sequence"] for e in two_groups()])
    best, assignment, rows = cluster_map.choose_cut(d)          # four identical pairs: 4 tight clusters
    assert best["clusters"] == 4 and best["silhouette"] == pytest.approx(1.0)
    capped, _, _ = cluster_map.choose_cut(d, max_clusters=2)
    assert capped["clusters"] == 2
    assert capped["silhouette"] == max(r["silhouette"] for r in rows
                                       if r["silhouette"] is not None and r["clusters"] == 2)


@pytest.mark.parametrize("s, words", [(0.8, "strong"), (0.6, "reasonable"), (0.3, "weak"),
                                      (0.2, "no substantial"), (None, "not measured")])
def test_structure_words_follow_the_usual_reading(s, words):
    assert cluster_map.structure_words(s).startswith(words)


def test_refuses_to_overwrite(tmp_path):
    out = tmp_path / cluster_map.FILENAME
    out.write_text("{}")
    with pytest.raises(SystemExit):
        cluster_map.run(str(tmp_path), str(out))
