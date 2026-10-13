"""Failure-trace clustering (prototype): do event sequences recover the rule-based failure types?

Standalone command, not part of report.py. Method after DYNASTO (arXiv:2603.21427,
Sec. II-D), reimplemented with these departures from its reference code:

- a step is a SET of events (frozenset), never a sum of event ids (sums collide);
- a symbol is emitted only when something happens, not every step, so the
  distance does not measure duration;
- every sequence ends at the terminal event (closest approach); everything after
  it is dropped and there is no fixed window, so failures that end the same way
  line up whatever their length;
- distance is an edit distance over symbols (not over a string of decimals), the
  substitution cost is the Jaccard distance between the two event sets, and the
  result is divided by the longer length;
- one row per scenario (its failing repeats are collapsed to their medoid);
- labels, cut and dendrogram all come from one scipy linkage, and the distance
  threshold and linkage method are swept and scored (adjusted Rand index)
  against the rule-based failure types instead of being fixed.

Also measured: how far apart repeats of one scenario are, over every valid
encounter (passes included) - a check on the five-repeat design, not a
clustering of passes.

Laptop only: reads traces/<scenario>_<sim>.json and simulations.csv of a run,
no Scenic, no CARLA. Writes to <run>/clustering/ (or --out) and refuses to
overwrite it.

    python -m scripts.analysis.cluster artifacts/runs/<run_id> [--safety path --out DIR]
"""

import argparse
import itertools
import json
import os
from collections import Counter

import numpy as np
from scipy.cluster.hierarchy import dendrogram, fcluster, linkage
from scipy.spatial.distance import squareform
from sklearn.metrics import adjusted_rand_score

from scripts.analysis import failure_model, obstacles, trace_measures

# --- the alphabet: the ONLY place event ids and names are defined ----------
EVENTS = {
    1: "first detected (>0.30)",
    2: "detection reaches 0.85",
    3: "detection lost (<=0.30 after 0.85)",
    4: "braking begins",
    5: "braking released while moving",
    6: "ego stops",
    7: "ego resumes",
    8: "closing to 20-10 m",
    9: "closing to 10-5 m",
    10: "safety violated (<5 m)",
    11: "closest approach",
    12: "pedestrian enters the ego's lane",
    13: "pedestrian leaves the ego's lane",
}
EVENT_ID = {name: i for i, name in EVENTS.items()}
TERMINAL = EVENT_ID["closest approach"]

DETECT_CONF = 0.30      # proportional braking acts from here (failure_model.reacted)
CONFIDENT_CONF = 0.85   # the full-detection bar
# Confidence at long range flickers around 0.30 from one frame to the next, so
# "first detected" and "detection lost" need this many consecutive frames
# (0.3 s). The 0.85 crossing stays single-frame: one frame is what triggers
# emergency braking.
DETECTION_FRAMES = 3
MOVING_MPS = failure_model.MOVING_SPEED   # 0.5: below = stopped
RESUME_MPS = 1.0        # must exceed this to count as moving again (hysteresis vs 0.5)
UNDER_WAY_MPS = 2.0     # ignore the spawn transient (speed dips to ~0.3 at step 1)
# The pedestrian is in the ego's lane while within this distance of the lane
# centre - the same half-width the path-aware safety rule uses.
LANE_HALF_WIDTH_M = trace_measures.PATH_HALF_WIDTH_M
# Distance bands, banded on the RUNNING MINIMUM distance so each band is entered
# at most once and jitter at a boundary cannot emit repeated symbols:
#   >20 m   start of the approach (the pair spawns at 20-35 m)
#   20-10 m the stopping distance at the 7.5 m/s approach plus the margin is
#           ~8.5 m (failure_model.stopping_distance), so above 10 m a stop is
#           still possible with room to spare
#   10-5 m  braking now can still stop, but only just; no room for reaction lag
#   <5 m    inside the safety margin: the requirement is violated
BANDS = [(20.0, None), (10.0, "closing to 20-10 m"), (5.0, "closing to 10-5 m"),
         (float("-inf"), "safety violated (<5 m)")]

LINKAGES = ["single", "complete", "average", "weighted"]   # ward/centroid/median need
THRESHOLDS = [round(0.05 * k, 2) for k in range(1, 20)]    # Euclidean input - excluded
REFERENCE_TYPES = ["detected_too_late", "brake_released", "braking_insufficient",
                   "stopped_too_close", "never_detected"]
SETTINGS = ["pedestrian", "dress", "direction", "distance", "fog_density"]
DEFAULT_BANNER = ("Prototype: these clusters are a methodological result, not a finding "
                  "about the vehicle.")


def names(symbol):
    """A symbol (set of event ids) as sorted event names."""
    return [EVENTS[i] for i in sorted(symbol)]


def _band(distance):
    for i, (lower, _) in enumerate(BANDS):
        if distance > lower:
            return i
    return len(BANDS) - 1


# --- 1. trace -> event sequence -------------------------------------------

def encode_trace(trace, terminal_step, frames=DETECTION_FRAMES):
    """List of frozensets of event ids, one per step at which something
    happened, up to and including `terminal_step` (the closest approach).
    Lane events need the scene-v2 `ped_lateral_m` series and are absent without it."""
    distance = trace["distance_m"]
    speed = trace["ego_speed"]
    lateral = trace.get("ped_lateral_m")
    conf = {}
    for row in trace["detections"]:          # rows can repeat a step; keep the last
        conf[row["step"]] = row["confidence"]
    braking = {b["step"] for b in trace["brakes"] if b.get("brake", 0) > 0}

    sequence = []
    detected = confident = held = under_way = stopped = was_braking = False
    in_lane = None
    above = below = 0                        # consecutive frames >0.30 / <=0.30
    band = _band(distance[0])
    for step in range(terminal_step + 1):
        events = set()
        c = conf.get(step, 0.0)
        above, below = (above + 1, 0) if c > DETECT_CONF else (0, below + 1)
        if c >= CONFIDENT_CONF and not confident:
            events.add(EVENT_ID["detection reaches 0.85"])
            held = True
        confident = c >= CONFIDENT_CONF
        if not detected and (above >= frames or confident):
            detected = True
            events.add(EVENT_ID["first detected (>0.30)"])
        if held and below >= frames:
            events.add(EVENT_ID["detection lost (<=0.30 after 0.85)"])
            held = False

        is_braking = step in braking
        v = speed[step]
        if is_braking and not was_braking:
            events.add(EVENT_ID["braking begins"])
        if was_braking and not is_braking and v > MOVING_MPS:
            events.add(EVENT_ID["braking released while moving"])
        was_braking = is_braking

        under_way = under_way or v > UNDER_WAY_MPS
        if under_way and not stopped and v < MOVING_MPS:
            stopped = True
            events.add(EVENT_ID["ego stops"])
        elif stopped and v > RESUME_MPS:
            stopped = False
            events.add(EVENT_ID["ego resumes"])

        if lateral is not None and step < len(lateral) and lateral[step] is not None:
            now = abs(lateral[step]) <= LANE_HALF_WIDTH_M
            if now and not in_lane:
                events.add(EVENT_ID["pedestrian enters the ego's lane"])
            elif in_lane and not now:
                events.add(EVENT_ID["pedestrian leaves the ego's lane"])
            in_lane = now

        new_band = _band(distance[step])
        while band < new_band:               # running minimum: bands only advance
            band += 1
            events.add(EVENT_ID[BANDS[band][1]])

        if step == terminal_step:
            events.add(TERMINAL)
        if events:
            sequence.append(frozenset(events))
    return sequence


# --- 2. distance ----------------------------------------------------------

def substitution_cost(a, b):
    """Jaccard distance between two event sets: 0 if equal, 1 if disjoint."""
    union = a | b
    return len(a ^ b) / len(union) if union else 0.0


def sequence_distance(s, t):
    """Edit distance over symbols (insert/delete 1, substitute = Jaccard
    distance), divided by the longer length. 0 = identical, 1 = nothing shared."""
    n, m = len(s), len(t)
    if max(n, m) == 0:
        return 0.0
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        for j in range(1, m + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1,
                         prev[j - 1] + substitution_cost(s[i - 1], t[j - 1]))
        prev = cur
    return prev[m] / max(n, m)


def distance_matrix(sequences):
    k = len(sequences)
    d = np.zeros((k, k))
    for i, j in itertools.combinations(range(k), 2):
        d[i, j] = d[j, i] = sequence_distance(sequences[i], sequences[j])
    return d


def medoid(indices, d):
    """The member with the smallest summed distance to the others (ties: first)."""
    return min(indices, key=lambda i: (d[i, indices].sum(), i))


# --- 3. per-scenario rows -------------------------------------------------

def load_encounters(run_dir, safety=trace_measures.DEFAULT_SAFETY_RULE, frames=DETECTION_FRAMES):
    """Every valid encounter (failures and passes; test defects dropped) with
    its rule type and event sequence."""
    df = failure_model.load_simulations(run_dir)
    df = trace_measures.add_trace_measures(df, run_dir)
    df = failure_model.add_failure_types(trace_measures.apply_safety_rule(df, safety))
    df = df[df["encounter"]]
    rows = []
    for _, r in df.sort_values(["scenario_id", "sim_index"], key=lambda c: c.astype(int)).iterrows():
        path = os.path.join(run_dir, "traces", f"{r['scenario_id']}_{int(r['sim_index'])}.json")
        with open(path) as f:
            trace = json.load(f)
        rows.append({
            "scenario_id": str(r["scenario_id"]), "sim_index": int(r["sim_index"]),
            "failure_type": r["failure_type"],
            "failed": r["failure_type"] in failure_model.FAILURE_TYPES,
            "settings": {p: str(r[p]) for p in SETTINGS},
            "sequence": encode_trace(trace, int(r["min_distance_step"]), frames),
        })
    return rows


def collapse(sims, d_sims):
    """One row per scenario: its medoid repeat, the majority rule type (ties:
    the medoid's type) and how far apart its repeats are."""
    by_scenario = {}
    for i, s in enumerate(sims):
        by_scenario.setdefault(s["scenario_id"], []).append(i)
    scenarios = []
    for sid in sorted(by_scenario, key=int):
        idx = by_scenario[sid]
        m = medoid(idx, d_sims)
        types = Counter(sims[i]["failure_type"] for i in idx)
        top = max(types.values())
        label = sims[m]["failure_type"] if list(types.values()).count(top) > 1 else types.most_common(1)[0][0]
        spread = max((d_sims[i, j] for i, j in itertools.combinations(idx, 2)), default=0.0)
        scenarios.append({"scenario_id": sid, "members": idx, "medoid_sim": sims[m]["sim_index"],
                          "medoid": m, "label": label, "types": dict(types),
                          "settings": sims[m]["settings"], "max_repeat_distance": float(spread)})
    return scenarios


def repeat_spread(sims, d_sims):
    """Distances between repeats of one scenario vs between different scenarios."""
    within, between = [], []
    for i, j in itertools.combinations(range(len(sims)), 2):
        (within if sims[i]["scenario_id"] == sims[j]["scenario_id"] else between).append(d_sims[i, j])
    summary = lambda xs: ({"pairs": len(xs), "median": float(np.median(xs)), "mean": float(np.mean(xs))}
                          if xs else {"pairs": 0, "median": None, "mean": None})
    return {"simulations": len(sims), "distinct_sequences": len({tuple(s["sequence"]) for s in sims}),
            "within_scenario": summary(within), "between_scenarios": summary(between)}


# --- 4. clustering and calibration ----------------------------------------

def cut(d, method, threshold):
    """Cluster labels (1..k) for one linkage method and distance threshold."""
    if len(d) < 2:
        return np.ones(len(d), dtype=int)
    z = linkage(squareform(d, checks=False), method=method)
    return fcluster(z, t=threshold, criterion="distance")


def sweep(d, labels):
    rows = []
    for method in LINKAGES:
        for t in THRESHOLDS:
            c = cut(d, method, t)
            rows.append({"linkage": method, "threshold": t, "clusters": int(c.max()),
                         "ari": float(adjusted_rand_score(labels, c))})
    return rows


def choose(rows):
    """Highest ARI; ties -> fewer clusters, then the larger threshold (the
    coarsest setting that scores as well), then linkage order."""
    return max(rows, key=lambda r: (round(r["ari"], 9), -r["clusters"], r["threshold"],
                                    -LINKAGES.index(r["linkage"])))


def null_max_ari(d, labels, permutations=200, seed=0):
    """Max-over-the-sweep ARI with the labels shuffled: how high the winner of
    this sweep scores by chance. The seed is for this check only - the
    clustering itself is deterministic."""
    rng = np.random.default_rng(seed)
    cuts = [cut(d, m, t) for m in LINKAGES for t in THRESHOLDS]
    out = []
    for _ in range(permutations):
        shuffled = rng.permutation(labels)
        out.append(max(adjusted_rand_score(shuffled, c) for c in cuts))
    return np.array(out)


# --- 5. outputs -----------------------------------------------------------

def _seq_names(seq):
    return [" + ".join(names(s)) for s in seq]


def _catalogue_match(type_shares):
    top, share = max(type_shares.items(), key=lambda kv: kv[1])
    if share >= 0.6:
        for entry in obstacles.OBSTACLE_CATALOGUE:
            if entry.get("failure_type") == top:
                return {"obstacle": entry["id"], "via": f"{top} ({share:.0%} of failing simulations)"}
    return {"obstacle": None, "via": "no rule type covers 60% of the cluster or no catalogue entry - "
                                     "UNNAMED, for a human to name"}


def describe_clusters(scenarios, sims, d, assignment):
    all_settings = Counter((k, v) for s in scenarios for k, v in s["settings"].items())
    n = len(scenarios)
    clusters = []
    for c in sorted(set(assignment)):
        idx = [i for i, a in enumerate(assignment) if a == c]
        m = medoid(idx, d)
        sim_types = Counter()
        for i in idx:
            sim_types.update(scenarios[i]["types"])
        total = sum(sim_types.values())
        shares = {t: sim_types[t] / total for t in sim_types}
        settings = Counter((k, v) for i in idx for k, v in scenarios[i]["settings"].items())
        over = [{"setting": f"{k}={v}", "in_cluster": settings[(k, v)] / len(idx),
                 "overall": all_settings[(k, v)] / n}
                for (k, v) in settings
                if len(idx) >= 2 and settings[(k, v)] / len(idx) - all_settings[(k, v)] / n >= 0.25]
        clusters.append({
            "cluster": int(c), "size_scenarios": len(idx), "size_simulations": total,
            "scenarios": [scenarios[i]["scenario_id"] for i in idx],
            "medoid_scenario": scenarios[m]["scenario_id"],
            "medoid_sequence": _seq_names(sims[scenarios[m]["medoid"]]["sequence"]),
            "scenario_labels": dict(Counter(scenarios[i]["label"] for i in idx)),
            "simulation_type_shares": {t: round(v, 3) for t, v in sorted(shares.items(), key=lambda kv: -kv[1])},
            "over_represented_settings": sorted(over, key=lambda o: o["overall"] - o["in_cluster"]),
            "catalogue": _catalogue_match(shares),
        })
    return sorted(clusters, key=lambda c: -c["size_scenarios"])


def write_dendrogram(d, scenarios, method, threshold, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(max(6, 0.4 * len(scenarios) + 2), 6))
    labels = [f"{s['scenario_id']} {s['label']}" for s in scenarios]
    if len(scenarios) >= 2:
        z = linkage(squareform(d, checks=False), method=method)
        dendrogram(z, ax=ax, color_threshold=threshold, leaf_rotation=90, leaf_font_size=8, labels=labels)
    ax.axhline(threshold, color="k", linestyle="--", linewidth=1, label=f"cut at {threshold}")
    ax.set_ylabel("normalised event-sequence distance")
    ax.set_title(f"Failing scenarios, {method} linkage")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def _md_table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(out)


def run(run_dir, out_dir=None, safety=trace_measures.DEFAULT_SAFETY_RULE, frames=DETECTION_FRAMES, banner=DEFAULT_BANNER):
    out_dir = out_dir or os.path.join(run_dir, "clustering")
    if os.path.exists(out_dir):
        raise SystemExit(f"{out_dir} exists - results are never overwritten; pass --out")
    encounters = load_encounters(run_dir, safety, frames)
    d_all = distance_matrix([s["sequence"] for s in encounters])
    repeats = {"all_encounters": repeat_spread(encounters, d_all)}
    fail_idx = [i for i, s in enumerate(encounters) if s["failed"]]
    sims = [encounters[i] for i in fail_idx]
    d_sims = d_all[np.ix_(fail_idx, fail_idx)]
    repeats["failures"] = repeat_spread(sims, d_sims)
    if len({s["scenario_id"] for s in sims}) < 2:
        raise SystemExit(f"fewer than two failing scenarios under the {safety!r} rule - nothing to cluster")
    scenarios = collapse(sims, d_sims)
    reps = [s["medoid"] for s in scenarios]
    d = d_sims[np.ix_(reps, reps)]
    labels = [s["label"] for s in scenarios]

    rows = sweep(d, labels)
    best = choose(rows)
    assignment = cut(d, best["linkage"], best["threshold"])
    null = null_max_ari(d, labels)
    clusters = describe_clusters(scenarios, sims, d, assignment)
    params = {"safety_rule": safety, "detection_frames": frames, "lane_half_width_m": LANE_HALF_WIDTH_M}

    os.makedirs(out_dir)
    with open(os.path.join(out_dir, "event_sequences.json"), "w") as f:
        json.dump({
            "parameters": params, "events": EVENTS, "bands_m": [">20", "20-10", "10-5", "<5"],
            "sequences": [{"scenario_id": s["scenario_id"], "sim_index": s["sim_index"],
                           "failure_type": s["failure_type"], "failed": s["failed"],
                           "sequence": _seq_names(s["sequence"])} for s in encounters],
        }, f, indent=1)
    write_dendrogram(d, scenarios, best["linkage"], best["threshold"], os.path.join(out_dir, "dendrogram.png"))
    with open(os.path.join(out_dir, "clusters.json"), "w") as f:
        json.dump({"parameters": params, "setting": best, "repeats": repeats, "clusters": clusters,
                   "scenarios": [dict({k: v for k, v in s.items() if k not in ("members", "medoid")},
                                      cluster=int(a)) for s, a in zip(scenarios, assignment)]}, f, indent=1)
    write_calibration(out_dir, rows, best, labels, assignment, null, params)
    write_report(out_dir, run_dir, sims, scenarios, clusters, best, null, repeats, params, banner)
    return {"best": best, "clusters": clusters, "scenarios": scenarios, "sims": sims, "d": d,
            "d_sims": d_sims, "sweep": rows, "null": null, "repeats": repeats}


def write_calibration(out_dir, rows, best, labels, assignment, null, params):
    present = [t for t in REFERENCE_TYPES if t in labels]
    lines = ["# Calibration: distance threshold x linkage, scored by adjusted Rand index",
             "", f"Safety rule `{params['safety_rule']}`, detection debounce {params['detection_frames']} frames.",
             "", "Reference labels: each failing scenario's majority rule type over its failing "
             "repeats (ties: the type of its medoid repeat). Label counts: "
             + ", ".join(f"{t} {labels.count(t)}" for t in present)
             + ". Types never a scenario majority: "
             + (", ".join(t for t in REFERENCE_TYPES if t not in labels) or "none") + "."
             + (" **Only one label class: ARI cannot measure agreement here.**" if len(present) < 2 else ""),
             "", "Every setting tried is listed. Ward, centroid and median linkage are not tried: "
             "they assume Euclidean distances and ours is an edit distance.", "",
             f"**Chosen:** {best['linkage']} linkage, threshold {best['threshold']} -> "
             f"{best['clusters']} clusters, ARI {best['ari']:.3f}. Rule: highest ARI; ties go to "
             "the fewest clusters, then the larger threshold.", "",
             f"**Chance level of this sweep:** with the labels shuffled 200 times, the best ARI "
             f"over all settings had median {np.median(null):.3f}, 95th percentile "
             f"{np.percentile(null, 95):.3f} (the winner of a sweep is optimistic; compare with this, "
             "not with 0).", "", "## Sweep", ""]
    lines.append(_md_table(["linkage", "threshold", "clusters", "ARI"],
                           [[r["linkage"], r["threshold"], r["clusters"], f"{r['ari']:.3f}"] for r in rows]))
    lines += ["", "## Confusion matrix (chosen setting): clusters x scenario rule type", ""]
    ks = sorted(set(assignment))
    lines.append(_md_table(["cluster"] + present,
                           [[k] + [sum(1 for a, l in zip(assignment, labels) if a == k and l == t)
                                   for t in present] for k in ks]))
    with open(os.path.join(out_dir, "calibration.md"), "w") as f:
        f.write("\n".join(lines) + "\n")


def _spread_line(name, r):
    w, b = r["within_scenario"], r["between_scenarios"]
    fmt = lambda x: "n/a" if x is None else f"{x:.3f}"
    return (f"- {name}: {r['simulations']} simulations, {r['distinct_sequences']} distinct sequences; "
            f"repeats of one scenario median {fmt(w['median'])} ({w['pairs']} pairs), different "
            f"scenarios median {fmt(b['median'])} ({b['pairs']} pairs)")


def write_report(out_dir, run_dir, sims, scenarios, clusters, best, null, repeats, params, banner):
    unstable = [s for s in scenarios if s["max_repeat_distance"] > best["threshold"]]
    lines = [
        "# Failure-trace clustering (prototype)", "", banner, "",
        f"Input: `{os.path.basename(os.path.normpath(run_dir))}`, safety rule `{params['safety_rule']}`, "
        f"detection debounce {params['detection_frames']} frames - {len(sims)} failing simulations in "
        f"{len(scenarios)} failing scenarios. Encoding in `event_sequences.json`, sweep in "
        "`calibration.md`, cut in `dendrogram.png`.", "",
        f"Setting: {best['linkage']} linkage, threshold {best['threshold']}: {best['clusters']} "
        f"clusters, ARI {best['ari']:.3f} against the rule types (chance best-of-sweep: median "
        f"{np.median(null):.3f}, 95th pct {np.percentile(null, 95):.3f}).", "",
        "## Repeats (reproducibility)", "",
        "Normalised distance between event sequences (0 = identical, 1 = nothing shared). If repeats "
        "of one scenario are about as far apart as different scenarios, the scenario settings do not "
        "determine how the run unfolds.", "",
        _spread_line("All valid encounters (passes included)", repeats["all_encounters"]),
        _spread_line("Failures only", repeats["failures"]), "",
        f"{len(unstable)} of {len(scenarios)} failing scenarios have two failing repeats further apart "
        f"than the cut ({best['threshold']})"
        + (": " + ", ".join(f"{s['scenario_id']} ({s['max_repeat_distance']:.2f}, types {s['types']})"
                            for s in unstable) if unstable else "") + ".", "",
        "## Clusters", ""]
    for c in clusters:
        lines += [f"### Cluster {c['cluster']} - {c['size_scenarios']} scenarios, "
                  f"{c['size_simulations']} failing simulations", "",
                  f"Scenarios: {', '.join(c['scenarios'])} (medoid {c['medoid_scenario']})", "",
                  "Medoid sequence:", ""]
        lines += [f"{k + 1}. {sym}" for k, sym in enumerate(c["medoid_sequence"])]
        lines += ["", "Rule types (failing simulations): "
                  + ", ".join(f"{t} {v:.0%}" for t, v in c["simulation_type_shares"].items())
                  + "; scenario labels: " + ", ".join(f"{t} {n}" for t, n in c["scenario_labels"].items()),
                  "", "Over-represented settings (share in cluster vs all failing scenarios, +25 points or "
                  "more): " + (", ".join(f"{o['setting']} {o['in_cluster']:.0%} vs {o['overall']:.0%}"
                                        for o in c["over_represented_settings"]) or "none"),
                  "", "Catalogue: " + (c["catalogue"]["obstacle"] + " via " + c["catalogue"]["via"]
                                       if c["catalogue"]["obstacle"] else c["catalogue"]["via"]), ""]
    lines += ["## Summary", "", "_To be written by hand after reading the clusters above._", ""]
    with open(os.path.join(out_dir, "clustering_report.md"), "w") as f:
        f.write("\n".join(lines))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("run_dir", help="artifacts/runs/<run_id> with simulations.csv and traces/")
    parser.add_argument("--out", default=None, help="output folder (default <run_dir>/clustering, must not exist)")
    parser.add_argument("--safety", default=trace_measures.DEFAULT_SAFETY_RULE, choices=trace_measures.SAFETY_RULES,
                        help="which simulations count as failures (see trace_measures)")
    parser.add_argument("--frames", type=int, default=DETECTION_FRAMES,
                        help="consecutive frames for 'first detected' / 'detection lost'")
    parser.add_argument("--banner", default=DEFAULT_BANNER, help="line shown at the top of the report")
    args = parser.parse_args(argv)
    result = run(args.run_dir, args.out, args.safety, args.frames, args.banner)
    print(json.dumps(result["best"]))


if __name__ == "__main__":
    main()
