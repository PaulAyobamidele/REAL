"""REAL demo: the whole loop on two real rounds, on a laptop, in about a minute.

    python -m scripts.demo                 # writes ./demo_output/<timestamp>/
    python -m scripts.demo --page          # ... then opens the review page on it
    real-demo --out /tmp/real-demo         # the same, as an installed command

No simulator, GPU or network: it starts from rounds 1 and 2 as they were run
on the Narval cluster (examples/demo_runs/, see its README) and runs every
laptop-side step of REAL on a fresh copy:

  1. failure analysis of each round        -> analysis_report.md
  2. round 1 -> round 2 comparison         -> comparison.md
  3. round 2 re-judged against the baseline
     domain assumptions (stated after the run) -> baseline_D0/analysis_report.md
  4. a scripted human review of round 2    -> decisions.json
  5. the proposed next requirement         -> R0.dsl, R1.dsl, requirement_diff.md

The bundled runs are never modified. Everything is written under the output
folder, which is never reused.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(ROOT, "examples", "demo_runs")
ROUND1 = "35acc09e8c224fdc953e3bf82ba57e96"
ROUND2 = "882fb2fe00bf4568bdb480a281db9e8b"
BASELINE = os.path.join(ROOT, "docs", "examples", "R_baseline.dsl")
REVIEWER = "demo (scripted review - change any answer on the review page)"

# Round 1 predates some run_meta fields; these are the values measured at the
# time (Notes.md 8.8), and the one inspected template difference.
ROUND1_META = {"system_under_test.braking_mode": "emergency_braking",
               "system_under_test.yolo_model": "yolov5s",
               "template_sha256": "497527fe36991f675652f5aca5b96c66ec6601ba37b52a2bd82af2ecd89242d9",
               "grammar_sha256": "6b9e9a970c6e79c42a8cd3367ec30f745f15913f0976b489e73a39e9c1b3bec4"}
ALLOW = {"template_sha256": "round-1 template fetched from Narval and diffed: only the "
                            "<ego_behavior> block and the perceive() cache differ"}


def _fresh_dir(out):
    if out is None:
        out = os.path.join(os.getcwd(), "demo_output", datetime.now().strftime("%Y%m%d-%H%M%S"))
    if os.path.exists(out) and os.listdir(out):
        raise SystemExit(f"{out} exists and is not empty - the demo never overwrites; pick another --out")
    os.makedirs(out, exist_ok=True)
    return out


def _baseline_text(run_dir):
    """The requirement the run actually ran with + the baseline's assuming /
    ensuring lines (as for the saved baseline_D0 re-analyses, Notes 8.18)."""
    with open(os.path.join(run_dir, "run_meta.json")) as f:
        as_run = json.load(f)["requirement"]
    tail = [l for l in open(BASELINE) if l.strip().startswith(("assuming", "ensuring"))]
    return as_run.rstrip() + "\n" + "".join(tail)


def run(out=None, say=print):
    from scripts.analysis import compare, refine, report, review

    out = _fresh_dir(out)
    runs = os.path.join(out, "runs")
    r1, r2 = os.path.join(runs, ROUND1), os.path.join(runs, ROUND2)
    for name, dst in ((ROUND1, r1), (ROUND2, r2)):
        shutil.copytree(os.path.join(BUNDLE, name), dst)
    say(f"REAL demo -> {out}\n")

    a1, _ = report.write_report(r1)
    a2, _ = report.write_report(r2)
    for label, a in (("Round 1 (emergency braking)", a1), ("Round 2 (proportional braking)", a2)):
        fm = a["failure_model"]
        say(f"1. {label}: {fm['failures']} of {fm['n_encounters']} encounters failed "
            f"({fm['failure_rate']:.0%}); {fm['passed_stalled']} passes were standoffs")

    compare.write_comparison(r1, r2, ROUND1_META, None, None, ALLOW)
    say("2. Round 1 -> round 2 compared, one change at a time: comparison.md")

    base_out = os.path.join(r2, "baseline_D0")
    b, _ = report.write_report(
        r2, requirement=_baseline_text(r2), out_dir=base_out,
        banner="Assumptions stated AFTER the run (demo): round 2 re-judged against the "
               "baseline assuming/ensuring lines of docs/examples/R_baseline.dsl.")
    for item in b["admissibility"]["assumptions"]:
        if item["kind"] in ("scenario", "run"):
            say(f"3. Assumption `{item['text']}`: held {item['held']}, broken {item['broken']}, "
                f"not measured {item['not_measured']} -> {item.get('verdict')}")

    with open(os.path.join(BUNDLE, "review_answers.json")) as f:
        answers = json.load(f)
    review.run_review(r2, previous=r1, reviewer=REVIEWER, round_no=2, answers=answers,
                      input_fn=lambda prompt: "s", output_fn=lambda line: None)
    say("4. Scripted review of round 2 recorded: decisions.json")

    result = refine.refine(r2)
    say("5. Proposed next requirement: R1.dsl and requirement_diff.md")
    for ch in result["changes"]:
        say(f"     [{ch['kind']}] {ch['text']}")

    say(f"\nRead: {os.path.join(r2, 'analysis_report.md')}")
    say(f"      {os.path.join(r2, 'requirement_diff.md')}")
    return {"out": out, "round1": r1, "round2": r2}


def open_page(round2_dir, round1_dir, port=8501, address="localhost"):
    env = dict(os.environ, REAL_REVIEW_RUN_DIR=round2_dir, REAL_REVIEW_PREVIOUS_DIR=round1_dir)
    page = os.path.join(ROOT, "pages", "4_review.py")
    cmd = [sys.executable, "-m", "streamlit", "run", page, "--server.port", str(port),
           "--server.address", address,
           "--server.headless", "true", "--browser.gatherUsageStats", "false"]
    print(f"\nReview page: http://localhost:{port}  (Ctrl-C to stop)")
    return subprocess.call(cmd, env=env, cwd=ROOT)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--out", default=None, help="output folder (default ./demo_output/<timestamp>)")
    p.add_argument("--page", action="store_true", help="open the review page on the result")
    p.add_argument("--port", type=int, default=8501)
    p.add_argument("--address", default="localhost",
                   help="address the review page listens on (0.0.0.0 inside Docker)")
    args = p.parse_args(argv)
    result = run(args.out)
    if args.page:
        sys.exit(open_page(result["round2"], result["round1"], args.port, args.address))


if __name__ == "__main__":
    main()
