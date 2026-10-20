"""Convert the recorded demo clips (.webm, VP8) to .mp4 (H.264), which every
video editor opens, next to the originals (never over them), scaled to 1920x1080
(the recorder captures the page at its 1536x864 viewport).

    sim_env/bin/python ui/scripts/video/to_mp4.py artifacts/video/<date>

Uses the project's OpenCV (as scripts/evolve/video.py does for CARLA's frames);
H.264 needs an OpenCV built with it, which the laptop's is.
"""
import glob
import os
import sys

import cv2

OUT = (1920, 1080)


def convert(src, dst):
    reader = cv2.VideoCapture(src)
    fps = reader.get(cv2.CAP_PROP_FPS) or 25
    # webm from the recorder can report a bogus rate; it records at 25
    if fps > 120 or fps < 1:
        fps = 25
    w, h = OUT
    writer = cv2.VideoWriter(dst, cv2.VideoWriter_fourcc(*"avc1"), fps, (w, h))
    if not writer.isOpened():
        raise SystemExit("this OpenCV cannot write H.264 (avc1)")
    frames = 0
    while True:
        ok, frame = reader.read()
        if not ok:
            break
        if frame.shape[1] != w or frame.shape[0] != h:
            frame = cv2.resize(frame, (w, h), interpolation=cv2.INTER_CUBIC)
        writer.write(frame)
        frames += 1
    writer.release()
    reader.release()
    return frames, fps


def main(folder):
    for src in sorted(glob.glob(os.path.join(folder, "*.webm"))):
        dst = src[: -len(".webm")] + ".mp4"
        frames, fps = convert(src, dst)
        print(f"{os.path.basename(dst)}: {frames} frames, {frames / fps:.1f} s")


if __name__ == "__main__":
    main(sys.argv[1])
