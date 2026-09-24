"""Smoke test of the offline review page with Streamlit's AppTest."""

import os

import pytest

from test_analysis import write_synthetic_run
from test_grammar import REQUIREMENT

pytest.importorskip("streamlit")
from streamlit.testing.v1 import AppTest  # noqa: E402

PAGE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pages", "4_review.py")


def test_review_page_renders_and_derives_r1(tmp_path, monkeypatch):
    ra, rb = tmp_path / "a", tmp_path / "b"
    write_synthetic_run(str(ra), trials=2, child_fail_rate=0.8, adult_fail_rate=0.8,
                        adult_kind="detected_too_late", requirement=REQUIREMENT)
    write_synthetic_run(str(rb), trials=2, child_fail_rate=0.2, adult_fail_rate=0.2,
                        adult_kind="brake_released", requirement=REQUIREMENT)
    monkeypatch.setenv("REAL_REVIEW_RUN_DIR", str(rb))
    monkeypatch.setenv("REAL_REVIEW_PREVIOUS_DIR", str(ra))

    at = AppTest.from_file(PAGE, default_timeout=60).run()
    assert not at.exception, at.exception
    text = (" ".join(m.value for m in at.markdown) + " ".join(h.value for h in at.header)
            + " ".join(s.value for s in at.subheader))
    assert "Obstacles" in text and "Proposed requirement" in text
    assert "DetectionTooLate" in text and "StandoffUnnecessaryStop" in text
    # R0 shown; R1 text area pre-filled with R0 (no decisions yet -> no change)
    assert any("Pedestrian Safety" in c.value for c in at.code)
    assert "Pedestrian Safety" in at.text_area[0].value
    # Accept is disabled until the review is complete
    assert at.button[0].disabled is True
