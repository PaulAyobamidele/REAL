"""The demo (python -m scripts.demo; the Docker image runs the same): the whole
laptop-side loop on the two bundled rounds, without touching the bundle."""

import hashlib
import os

import pytest

from scripts import demo


def _digest(folder):
    h = hashlib.sha256()
    for root, _, files in sorted(os.walk(folder)):
        for name in sorted(files):
            with open(os.path.join(root, name), "rb") as f:
                h.update(name.encode() + f.read())
    return h.hexdigest()


def test_demo_runs_the_loop_and_leaves_the_bundle_alone(tmp_path):
    before = _digest(demo.BUNDLE)
    lines = []
    out = demo.run(str(tmp_path / "d"), say=lines.append)
    assert _digest(demo.BUNDLE) == before
    r2 = out["round2"]
    for name in ("analysis_report.md", "comparison.md", "decisions.json", "R0.dsl", "R1.dsl",
                 "requirement_diff.md", os.path.join("baseline_D0", "analysis_report.md")):
        assert os.path.exists(os.path.join(r2, name)), name
    text = "\n".join(lines)
    assert "91 of 120 encounters failed (76%)" in text          # round 1 as published
    assert "4 of 128 encounters failed (3%)" in text and "113 passes were standoffs" in text
    assert "[R] ensuring" in text
    assert "scripted review" in open(os.path.join(r2, "decisions.json")).read()


def test_demo_never_overwrites(tmp_path):
    (tmp_path / "x").mkdir()
    (tmp_path / "x" / "f").write_text("keep")
    with pytest.raises(SystemExit):
        demo.run(str(tmp_path / "x"), say=lambda s: None)
