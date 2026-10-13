"""A map of every valid encounter of a run, for the review interface: where
each simulation sits among the others, and which neighbourhood it belongs to.

Standalone command, next to cluster.py and reusing its event encoding and
distance unchanged (an edit distance over event sets, 0 = identical, 1 =
nothing shared). Where cluster.py clusters the failing scenarios and checks
the clusters against the rule types, this places ALL valid encounters -
passes included, one point per simulation - so the patterns behind a
pass-outcome obstacle (e.g. the stalls of StandoffUnnecessaryStop) are
visible too.

- Positions: classical multidimensional scaling of the distance matrix,
  two axes. Deterministic (the sign of each axis is fixed). How faithful the
  picture is, is measured and written out: the share of variance the two
  axes carry and the rank correlation between map distance and true distance.
- Clusters: hierarchical (average and complete linkage - single linkage
  chains on a continuum), swept over distance thresholds. For every number
  of clusters 2..max_clusters the cut with the highest silhouette is kept,
  so the interface can show a coarser or finer reading; the default is the
  highest silhouette overall (which tends to the fewest clusters). Each cut
  carries its silhouette with the usual reading (Kaufman & Rousseeuw): below
  0.25 there is no substantial cluster structure and the clusters are only
  neighbourhoods on the map, never types.

The interface joins points to its own rows by (scenario_id, sim_index), so
outcome, set-aside reasons and obstacle membership come from the analysis
report as everywhere else; this file adds positions, clusters and the event
sequences only.

Laptop only: reads traces/ and simulations.csv. Writes <run>/cluster_map.json
(or --out) and refuses to overwrite it.

    python -m scripts.analysis.cluster_map artifacts/runs/<run_id> [--safety path --out FILE]
"""

import argparse
import json
import os
from collections import Counter

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import pdist, squareform
from scipy.stats import spearmanr
from sklearn.metrics import silhouette_score

from scripts.analysis import cluster, trace_measures

FILENAME = "cluster_map.json"
SCHEMA_VERSION = 1
LINKAGES = ["average", "complete"]
THRESHOLDS = cluster.THRESHOLDS
MAX_CLUSTERS = 12
OVER_REPRESENTED = 0.25     # share in cluster minus share overall, as in cluster.py
MIN_SIZE_FOR_SETTINGS = 3


def embed(d):
    """Classical MDS to two axes. Returns (points n x 2, quality dict)."""
    n = len(d)
    if n < 3:
        return np.zeros((n, 2)), {"variance_2d": None, "rank_correlation": None}
    j = np.eye(n) - 1.0 / n
    b = -0.5 * j @ (d ** 2) @ j
    w, v = np.linalg.eigh(b)
    order = np.argsort(w)[::-1]
    w, v = w[order], v[:, order]
    top = np.clip(w[:2], 0, None)
    points = v[:, :2] * np.sqrt(top)
    for axis in range(2):                     # eigenvectors have no sign: fix one
        if points[np.argmax(np.abs(points[:, axis])), axis] < 0:
            points[:, axis] *= -1
    positive = w[w > 0].sum()
    rho = spearmanr(pdist(points), squareform(d, checks=False)).correlation
    return points, {"variance_2d": float(top.sum() / positive) if positive else None,
                    "rank_correlation": None if np.isnan(rho) else float(rho)}


def structure_words(silhouette):
    """The usual reading of an average silhouette width."""
    if silhouette is None:
        return "not measured"
    if silhouette > 0.70:
        return "strong structure"
    if silhouette > 0.50:
        return "reasonable structure"
    if silhouette > 0.25:
        return "weak structure - clusters may be artificial"
    return "no substantial structure - read clusters as neighbourhoods on the map, not as types"


def choose_cut(d, max_clusters=MAX_CLUSTERS):
    """Sweep linkage x threshold; keep cuts with 2..max_clusters clusters and
    take the highest silhouette (ties: fewer clusters, then the larger
    threshold, then linkage order). Returns (best row or None, assignment, rows)."""
    n = len(d)
    rows = []
    if n < 3:
        return None, np.ones(n, dtype=int), rows
    condensed = squareform(d, checks=False)
    trees = {m: linkage(condensed, method=m) for m in LINKAGES}
    for m in LINKAGES:
        for t in THRESHOLDS:
            labels = fcluster(trees[m], t=t, criterion="distance")
            k = int(labels.max())
            s = float(silhouette_score(d, labels, metric="precomputed")) if 2 <= k <= n - 1 else None
            rows.append({"linkage": m, "threshold": t, "clusters": k, "silhouette": s})
    allowed = [r for r in rows if r["silhouette"] is not None and 2 <= r["clusters"] <= max_clusters]
    if not allowed:
        return None, np.ones(n, dtype=int), rows
    best = max(allowed, key=lambda r: (round(r["silhouette"], 9), -r["clusters"], r["threshold"],
                                       -LINKAGES.index(r["linkage"])))
    return best, fcluster(trees[best["linkage"]], t=best["threshold"], criterion="distance"), rows


def renumber_by_size(assignment):
    """Cluster ids 1..k, 1 the largest (ties: the one whose first member comes first)."""
    counts = Counter(assignment.tolist())
    first = {c: assignment.tolist().index(c) for c in counts}
    order = sorted(counts, key=lambda c: (-counts[c], first[c]))
    mapping = {old: new for new, old in enumerate(order, 1)}
    return np.array([mapping[a] for a in assignment.tolist()])


def describe(encounters, d, assignment):
    n = len(encounters)
    overall = Counter((k, v) for e in encounters for k, v in e["settings"].items())
    clusters = []
    for c in sorted(set(assignment.tolist())):
        idx = [i for i, a in enumerate(assignment.tolist()) if a == c]
        m = cluster.medoid(idx, d)
        within = d[np.ix_(idx, idx)][np.triu_indices(len(idx), 1)]
        settings = Counter((k, v) for i in idx for k, v in encounters[i]["settings"].items())
        over = []
        if len(idx) >= MIN_SIZE_FOR_SETTINGS:
            for (k, v), count in settings.items():
                share, base = count / len(idx), overall[(k, v)] / n
                if share - base >= OVER_REPRESENTED:
                    over.append({"setting": k, "value": v, "in_cluster": round(share, 3),
                                 "overall": round(base, 3)})
        clusters.append({
            "cluster": int(c),
            "size": len(idx),
            "medoid": {"scenario_id": encounters[m]["scenario_id"],
                       "sim_index": encounters[m]["sim_index"]},
            "medoid_sequence": [cluster.names(s) for s in encounters[m]["sequence"]],
            "outcomes": dict(Counter(encounters[i]["failure_type"] for i in idx).most_common()),
            "failed": sum(1 for i in idx if encounters[i]["failed"]),
            "scenarios": sorted({encounters[i]["scenario_id"] for i in idx}, key=int),
            "within_median": float(np.median(within)) if len(within) else 0.0,
            "over_represented_settings": sorted(over, key=lambda o: o["overall"] - o["in_cluster"]),
        })
    return clusters


def cuts_by_count(rows, max_clusters=MAX_CLUSTERS):
    """The best sweep row (highest silhouette; ties as in choose_cut) for each
    reachable number of clusters 2..max_clusters, in increasing order."""
    best = {}
    for r in rows:
        if r["silhouette"] is None or not 2 <= r["clusters"] <= max_clusters:
            continue
        key = (round(r["silhouette"], 9), r["threshold"], -LINKAGES.index(r["linkage"]))
        if r["clusters"] not in best or key > best[r["clusters"]][0]:
            best[r["clusters"]] = (key, r)
    return [best[k][1] for k in sorted(best)]


def build(encounters, params, max_clusters=MAX_CLUSTERS):
    """The cluster_map.json document for a list of encounters (cluster.load_encounters)."""
    d = cluster.distance_matrix([e["sequence"] for e in encounters])
    points, quality = embed(d)
    best, _, sweep = choose_cut(d, max_clusters)
    cuts = []
    if len(encounters) >= 3:
        condensed = squareform(d, checks=False)
        trees = {m: linkage(condensed, method=m) for m in LINKAGES}
        for row in cuts_by_count(sweep, max_clusters):
            labels = renumber_by_size(fcluster(trees[row["linkage"]], t=row["threshold"], criterion="distance"))
            cuts.append(dict(row, structure=structure_words(row["silhouette"]),
                             assignment=[int(a) for a in labels.tolist()],
                             groups=describe(encounters, d, labels)))
    default = next((i for i, c in enumerate(cuts) if best and c["clusters"] == best["clusters"]), None)
    return {
        "schema_version": SCHEMA_VERSION,
        "parameters": dict(params, max_clusters=max_clusters),
        "map": dict(quality, method="classical multidimensional scaling of the event-sequence distance"),
        "events": cluster.EVENTS,
        "points": [{"scenario_id": e["scenario_id"], "sim_index": e["sim_index"],
                    "x": round(float(p[0]), 4), "y": round(float(p[1]), 4),
                    "failure_type": e["failure_type"], "failed": bool(e["failed"]),
                    "sequence": [cluster.names(s) for s in e["sequence"]]}
                   for e, p in zip(encounters, points)],
        "default_cut": default,
        "cuts": cuts,
        "sweep": sweep,
    }


def run(run_dir, out=None, safety=trace_measures.DEFAULT_SAFETY_RULE, frames=cluster.DETECTION_FRAMES,
        max_clusters=MAX_CLUSTERS):
    out = out or os.path.join(run_dir, FILENAME)
    if os.path.exists(out):
        raise SystemExit(f"{out} exists - results are never overwritten; pass --out")
    encounters = cluster.load_encounters(run_dir, safety, frames)
    params = {"run_id": os.path.basename(os.path.normpath(run_dir)), "safety_rule": safety,
              "detection_frames": frames, "lane_half_width_m": cluster.LANE_HALF_WIDTH_M}
    doc = build(encounters, params, max_clusters)
    with open(out, "w") as f:
        json.dump(doc, f, indent=1)
    return doc


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("run_dir", help="artifacts/runs/<run_id> with simulations.csv and traces/")
    parser.add_argument("--out", default=None, help=f"output file (default <run_dir>/{FILENAME}, must not exist)")
    parser.add_argument("--safety", default=trace_measures.DEFAULT_SAFETY_RULE, choices=trace_measures.SAFETY_RULES,
                        help="which simulations count as failures (see trace_measures)")
    parser.add_argument("--frames", type=int, default=cluster.DETECTION_FRAMES,
                        help="consecutive frames for 'first detected' / 'detection lost'")
    parser.add_argument("--max-clusters", type=int, default=MAX_CLUSTERS,
                        help="largest number of clusters a cut may give")
    args = parser.parse_args(argv)
    doc = run(args.run_dir, args.out, args.safety, args.frames, args.max_clusters)
    print(json.dumps({"points": len(doc["points"]), **doc["map"],
                      "cuts": {c["clusters"]: round(c["silhouette"], 3) for c in doc["cuts"]},
                      "default": doc["cuts"][doc["default_cut"]]["clusters"] if doc["cuts"] else None}))


if __name__ == "__main__":
    main()
