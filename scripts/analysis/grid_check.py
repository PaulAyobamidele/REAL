"""Grid check of a GE run: confirm GE's leads on balanced repeats.

GE breeds scenarios towards failure, so its failure rates, setting effects
and supported obstacles are leads, not findings (report.SAMPLING_TEXT). This
picks GE's worst and safest distinct scenarios, writes them as a list the
Narval job runs equally often (REAL_SEARCH=list), and afterwards compares
the two runs.

    # 1. choose the scenarios (writes <ge_run>/grid_check/scenarios.txt + selection.json)
    python -m scripts.analysis.grid_check artifacts/runs/<ge_run> --top 4 --trials 3

    # 2. on Narval (after rsyncing the staging copy):
    sbatch --export=ALL,REAL_SEARCH=list,REAL_SCENARIOS=artifacts/runs/<ge_run>/grid_check/scenarios.txt,\
REAL_TRIALS=3,REAL_PARENT_RUN_ID=<ge_run>,REAL_REQUIREMENT_FILE=<same as the GE run> run_real_av.slurm

    # 3. compare (writes <check_run>/grid_check_comparison.md)
    python -m scripts.analysis.grid_check artifacts/runs/<ge_run> --compare artifacts/runs/<check_run>

Selection: per distinct scenario over real encounters, the GE failure rate.
Worst = highest rate (ties: more simulations first); safe = lowest rate
among the rest. Scenarios without an encounter are skipped.
"""

import argparse
import json
import os

from scripts.analysis import failure_model, report

DIRNAME = "grid_check"


def per_scenario(run_dir):
    df = failure_model.add_failure_types(failure_model.load_simulations(run_dir))
    enc = df[df["encounter"]]
    if not len(enc):
        return []
    g = enc.groupby("phenotype")["failed"].agg(["mean", "size"]).reset_index()
    return [{"phenotype": r["phenotype"], "ge_failure_rate": float(r["mean"]), "ge_n": int(r["size"])}
            for _, r in g.iterrows()]


def select(rows, top=4):
    worst = sorted(rows, key=lambda r: (-r["ge_failure_rate"], -r["ge_n"], r["phenotype"]))[:top]
    taken = {r["phenotype"] for r in worst}
    rest = [r for r in rows if r["phenotype"] not in taken]
    safe = sorted(rest, key=lambda r: (r["ge_failure_rate"], -r["ge_n"], r["phenotype"]))[:top]
    return ([dict(r, group="worst") for r in worst] + [dict(r, group="safe") for r in safe])


def write_selection(ge_run, top=4, trials=3):
    chosen = select(per_scenario(ge_run), top)
    if not chosen:
        raise ValueError(f"{ge_run}: no scenario with a real encounter to check")
    out = os.path.join(ge_run, DIRNAME)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "scenarios.txt"), "w") as f:
        f.write(f"# grid check of GE run {os.path.basename(os.path.normpath(ge_run))}: "
                f"{sum(c['group'] == 'worst' for c in chosen)} worst + "
                f"{sum(c['group'] == 'safe' for c in chosen)} safe scenarios\n")
        for c in chosen:
            f.write(c["phenotype"] + "\n")
    with open(os.path.join(out, "selection.json"), "w") as f:
        json.dump({"ge_run": os.path.basename(os.path.normpath(ge_run)), "top": top,
                   "trials": trials, "scenarios": chosen}, f, indent=2)
    return out, chosen


def compare(ge_run, check_run):
    """GE rate vs balanced-repeat rate per checked scenario, and whether each
    obstacle GE supported is still supported on the check run."""
    with open(os.path.join(ge_run, DIRNAME, "selection.json")) as f:
        selection = json.load(f)
    repeat = {r["phenotype"]: r for r in per_scenario(check_run)}
    ge_analysis = report.analyse(ge_run)
    check_analysis = report.analyse(check_run)
    check_verdicts = {o["id"]: o["verdict"] for o in check_analysis["obstacles"]}

    L = [f"# Grid check of GE run `{selection['ge_run']}`", "",
         f"> Check run `{check_analysis['run_id']}`: {len(selection['scenarios'])} scenarios GE chose, "
         "each run equally often. GE rates are biased towards failure by design; the check "
         "rates are the ones to quote.", "",
         "## Scenarios", "", "| group | GE rate (n) | check rate (n) | scenario |", "|---|---|---|---|"]
    held = 0
    for s in selection["scenarios"]:
        r = repeat.get(s["phenotype"])
        check = "no encounter" if r is None else f"{r['ge_failure_rate']:.0%} ({r['ge_n']})"
        L.append(f"| {s['group']} | {s['ge_failure_rate']:.0%} ({s['ge_n']}) | {check} | {s['phenotype']} |")
        if r is not None and s["group"] == "worst" and r["ge_failure_rate"] >= 0.5:
            held += 1
    n_worst = sum(s["group"] == "worst" for s in selection["scenarios"])
    L += ["", f"- {held} of {n_worst} worst scenarios still fail at least half the time on repeats.", "",
          "## Obstacles GE supported", "", "| obstacle | on the check run |", "|---|---|"]
    leads = [o["id"] for o in ge_analysis["obstacles"] if o["verdict"] == "supported"]
    for oid in leads:
        L.append(f"| {oid} | {check_verdicts.get(oid, 'not assessed')} |")
    if not leads:
        L.append("| (none) | |")
    L += ["", "A small check run has few simulations per setting, so 'insufficient data' here "
          "means not confirmed yet, not refuted."]
    md = "\n".join(L) + "\n"
    path = os.path.join(check_run, "grid_check_comparison.md")
    with open(path, "w") as f:
        f.write(md)
    return path, md


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("ge_run")
    p.add_argument("--top", type=int, default=4, help="worst and safe scenarios each (default 4)")
    p.add_argument("--trials", type=int, default=3, help="repeats per scenario on the check run (default 3)")
    p.add_argument("--compare", default=None, help="the finished check run to compare against")
    args = p.parse_args(argv)
    if args.compare:
        _, md = compare(args.ge_run, args.compare)
        print(md)
        return
    out, chosen = write_selection(args.ge_run, args.top, args.trials)
    rel = os.path.relpath(os.path.join(out, "scenarios.txt"))
    run = os.path.basename(os.path.normpath(args.ge_run))
    print(f"Wrote {rel} ({len(chosen)} scenarios). Submit with:")
    print(f'  sbatch --export=ALL,REAL_SEARCH=list,REAL_SCENARIOS={rel},REAL_TRIALS={args.trials},'
          f'REAL_PARENT_RUN_ID={run},REAL_REQUIREMENT_FILE=<same as the GE run> run_real_av.slurm')


if __name__ == "__main__":
    main()
