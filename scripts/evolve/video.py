"""Stitch the frames Scenic's RecordingMonitor saved into an .mp4.

    python -m scripts.evolve.video artifacts/runs/<run_id>      # re-stitch for the browser

Which codec a video gets depends on how OpenCV was built: H.264 ("avc1")
plays in every browser and is what the review interface needs; MPEG-4 part 2
("mp4v") is what every OpenCV build can write but no browser decodes. The
writer is probed at run time, H.264 first. The command above re-stitches a
finished run's saved frames into `best_scenario_h264.mp4` next to the
original (never over it) on a machine whose OpenCV has H.264 - the cluster
image may not.
"""

import argparse
import glob
import os

import cv2

# Four-character codes, in order of preference (see the module docstring).
PREFERRED_FOURCC = ("avc1", "mp4v")
H264_FILENAME = "best_scenario_h264.mp4"
CODEC_TAGS = ("avc1", "mp4v", "hev1", "hvc1")


def _frame_number(path):
    # Scenic writes frames as "<frame_number>_<timestamp>.png" with an
    # unpadded frame_number (Scenic/src/scenic/simulators/carla/sensors.py) -
    # a plain string sort would order "10_..." before "2_...", so sort by
    # the leading integer instead.
    name = os.path.basename(path)
    return int(name.split("_", 1)[0])


def open_writer(output_path, fps, size, fourccs=PREFERRED_FOURCC):
    """The first VideoWriter among `fourccs` this OpenCV can open, and its
    code. If none opens, the last one is returned anyway (as before: the
    recording step must not kill a run; the file is then empty)."""
    writer, fourcc = None, None
    for fourcc in fourccs:
        writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*fourcc), fps, size)
        if writer.isOpened():
            return writer, fourcc
        writer.release()
    return writer, fourcc


def video_codec(path):
    """The codec tag found in the file's own sample description ('avc1',
    'mp4v', ...), or None. Enough to tell a browser-playable video from one
    that is not, without a media library."""
    with open(path, "rb") as f:
        data = f.read()
    for tag in CODEC_TAGS:
        if tag.encode() in data:
            return tag
    return None


def frames_to_mp4(frames_dir, output_path, fps=10, sensor="front_rgb", fourccs=PREFERRED_FOURCC):
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

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    writer, _ = open_writer(output_path, fps, (width, height), fourccs)
    try:
        for frame_path in frame_paths:
            frame = cv2.imread(frame_path)
            if frame is not None:
                writer.write(frame)
    finally:
        writer.release()

    return output_path


def h264_available():
    """Can this OpenCV write H.264? Probed with a throw-away writer."""
    import tempfile
    path = os.path.join(tempfile.mkdtemp(), "probe.mp4")
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"avc1"), 10, (16, 16))
    ok = writer.isOpened()
    writer.release()
    return ok


def restitch(run_dir, fps=10):
    """Write <run_dir>/best_scenario_h264.mp4 from <run_dir>/frames. Refuses
    to overwrite an existing file and refuses without an H.264 writer, so the
    result is always what its name says."""
    output = os.path.join(run_dir, H264_FILENAME)
    if os.path.exists(output):
        raise SystemExit(f"{output} exists - not overwritten")
    if not h264_available():
        raise SystemExit("this OpenCV cannot write H.264 (avc1); nothing written")
    written = frames_to_mp4(os.path.join(run_dir, "frames"), output, fps=fps, fourccs=("avc1",))
    if written is None:
        raise SystemExit(f"no frames under {os.path.join(run_dir, 'frames')}; nothing written")
    return written


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("run_dir", help="artifacts/runs/<run_id> with a frames/ folder")
    parser.add_argument("--fps", type=int, default=10)
    args = parser.parse_args(argv)
    path = restitch(args.run_dir, args.fps)
    print(f"wrote {path} ({video_codec(path)})")


if __name__ == "__main__":
    main()
