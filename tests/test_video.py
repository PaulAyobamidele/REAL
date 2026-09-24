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
