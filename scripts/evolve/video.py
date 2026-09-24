import glob
import os

import cv2


def _frame_number(path):
    # Scenic writes frames as "<frame_number>_<timestamp>.png" with an
    # unpadded frame_number (Scenic/src/scenic/simulators/carla/sensors.py) -
    # a plain string sort would order "10_..." before "2_...", so sort by
    # the leading integer instead.
    name = os.path.basename(path)
    return int(name.split("_", 1)[0])


def frames_to_mp4(frames_dir, output_path, fps=10, sensor="front_rgb"):
    """Stitch a directory of RecordingMonitor-captured PNG frames
    (<frames_dir>/<sensor>/<frame_number>_<timestamp>.png) into an .mp4.

    Returns output_path if a video was written, or None if no frames were
    found (e.g. recording wasn't enabled for this run).
    """
    sensor_dir = os.path.join(frames_dir, sensor)
    frame_paths = sorted(glob.glob(os.path.join(sensor_dir, "*.png")), key=_frame_number)
    if not frame_paths:
        return None

    first = cv2.imread(frame_paths[0])
    height, width = first.shape[:2]

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    try:
        for frame_path in frame_paths:
            frame = cv2.imread(frame_path)
            if frame is not None:
                writer.write(frame)
    finally:
        writer.release()

    return output_path
