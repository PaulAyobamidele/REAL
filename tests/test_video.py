import os

import cv2
import numpy as np

from scripts.evolve.video import frames_to_mp4


def _write_frame(frames_dir, frame_number, value):
    os.makedirs(frames_dir, exist_ok=True)
    img = np.full((32, 32, 3), value, dtype=np.uint8)
    cv2.imwrite(os.path.join(frames_dir, f"{frame_number}_20260101_000000,000.png"), img)


def test_frames_to_mp4_writes_video_sorted_numerically(tmp_path):
    frames_dir = tmp_path / "front_rgb"
    # Deliberately include a 2-digit frame number to catch lexicographic-sort bugs
    # (a plain string sort would order "10_..." before "2_...").
    for n, value in [(1, 10), (2, 20), (10, 30)]:
        _write_frame(str(frames_dir), n, value)

    output_path = str(tmp_path / "out.mp4")
    result = frames_to_mp4(str(tmp_path), output_path, fps=5)

    assert result == output_path
    assert os.path.exists(output_path)
    assert os.path.getsize(output_path) > 0

    cap = cv2.VideoCapture(output_path)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    assert frame_count == 3


def test_frames_to_mp4_returns_none_when_no_frames(tmp_path):
    result = frames_to_mp4(str(tmp_path), str(tmp_path / "out.mp4"))
    assert result is None
    assert not os.path.exists(str(tmp_path / "out.mp4"))


def test_frames_to_mp4_prefers_a_browser_playable_codec(tmp_path):
    from scripts.evolve import video
    frames_dir = tmp_path / "front_rgb"
    for n in (1, 2):
        _write_frame(str(frames_dir), n, 40)
    out = str(tmp_path / "out.mp4")
    assert frames_to_mp4(str(tmp_path), out, fps=5) == out
    codec = video.video_codec(out)
    assert codec in ("avc1", "mp4v")
    if video.h264_available():
        assert codec == "avc1"
    # an explicit codec list is honoured (the cluster image may only have mp4v)
    out2 = str(tmp_path / "out2.mp4")
    frames_to_mp4(str(tmp_path), out2, fps=5, fourccs=("mp4v",))
    assert video.video_codec(out2) == "mp4v"


def test_restitch_writes_next_to_the_original_and_never_over_it(tmp_path):
    import pytest
    from scripts.evolve import video
    if not video.h264_available():
        pytest.skip("this OpenCV cannot write H.264")
    for n in (1, 2, 3):
        _write_frame(str(tmp_path / "frames" / "front_rgb"), n, 50)
    (tmp_path / "best_scenario.mp4").write_bytes(b"original")
    path = video.restitch(str(tmp_path))
    assert path == str(tmp_path / video.H264_FILENAME)
    assert video.video_codec(path) == "avc1"
    assert (tmp_path / "best_scenario.mp4").read_bytes() == b"original"
    with pytest.raises(SystemExit):
        video.restitch(str(tmp_path))          # refuses to overwrite
    with pytest.raises(SystemExit):
        video.restitch(str(tmp_path / "nowhere"))   # no frames: nothing written
