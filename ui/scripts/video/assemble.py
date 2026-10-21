"""Assemble the ICSE demo video from the slide frames, the tool clips and one
voice-over file (docs/video/edit_plan.md gives the order and each piece's line).

    sim_env/bin/python ui/scripts/video/assemble.py <folder> <voice.mp3> <words.json> <ffmpeg>

<folder> holds frames/fNN.png, the numbered clips and segments.txt (id <TAB> line,
in playing order). <words.json> is the voice's word timings ([{w, s, e}], from a
speech-to-text pass), used to find where each piece's line starts and ends.

Each piece's audio runs from the midpoint of the pause before its line to the
midpoint of the pause after. A frame stays up exactly that long. A clip is sped
up (at most MAX_SPEED) to fit its line; when it is still longer, the extra time is
spread over the pauses between the line's sentences, so the voice keeps pace with
the screen. Writes demo.mp4 and demo.srt (captions with the script's own words).
"""
import difflib
import json
import os
import re
import subprocess
import sys

import cv2
import numpy as np

FPS = 25
SIZE = (1920, 1080)
RATE = 44100
MAX_SPEED = 1.35
FAST = {"a09": 2.0}  # the terminal typing and the manual: fine to play faster
CLIPS = {
    "a00": "00_cold_open",
    "a01": "01_write_requirement",
    "a02": "02_worked_example",
    "a03": "03_test_execution_report",
    "a04": "04_failure_analysis",
    "a05": "05_obstacle_triage",
    "a06": "06_requirement_revision",
    "a07": "07_results_chart",
    "a08": "08_welcome",
    "a09": "09_try_it",
}


def norm(text):
    text = text.lower().replace("-", " ")
    return re.sub(r"[^a-z0-9' ]", " ", text).split()


def align(segments, words):
    """For each piece, the transcript words it covers (first, last index)."""
    script, owner = [], []
    for i, (_, line) in enumerate(segments):
        for w in norm(line):
            script.append(w)
            owner.append(i)
    toks, tw = [], []
    for j, x in enumerate(words):
        for w in norm(x["w"]):
            toks.append(w)
            tw.append(j)
    m = {}
    for a, b, n in difflib.SequenceMatcher(None, script, toks, autojunk=False).get_matching_blocks():
        for d in range(n):
            m[a + d] = tw[b + d]
    spans = []
    for i in range(len(segments)):
        hit = [m[s] for s, o in enumerate(owner) if o == i and s in m]
        spans.append((min(hit), max(hit)))
    return spans


def read_audio(path, ffmpeg):
    raw = subprocess.run(
        [ffmpeg, "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32)


def sentence_cuts(words, first, last):
    """Times inside a piece where a sentence ends (midway to the next word)."""
    cuts = []
    for j in range(first, last):
        if words[j]["w"].rstrip().endswith((".", "?", "!", ":", ";")):
            cuts.append((words[j]["e"] + words[j + 1]["s"]) / 2)
    return cuts


def frames_of_clip(path):
    cap = cv2.VideoCapture(path)
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(f if (f.shape[1], f.shape[0]) == SIZE else cv2.resize(f, SIZE))
    # a recording can open on a frame or two before the page has drawn: a blank flash, dropped
    while len(out) > 1 and out[0][60:1000:40, 100:1800:40].std() < 3:
        out.pop(0)
    return out, cap.get(cv2.CAP_PROP_FPS) or FPS


def main(folder, voice_path, words_path, ffmpeg):
    segments = [l.rstrip("\n").split("\t") for l in open(os.path.join(folder, "segments.txt"))]
    words = json.load(open(words_path))
    spans = align(segments, words)
    voice = read_audio(voice_path, ffmpeg)
    end_of_voice = len(voice) / RATE
    # piece boundaries: midway through each pause
    bounds = [0.0]
    for i in range(len(spans) - 1):
        bounds.append((words[spans[i][1]]["e"] + words[spans[i + 1][0]]["s"]) / 2)
    bounds.append(min(end_of_voice, words[spans[-1][1]]["e"] + 0.8))

    writer = cv2.VideoWriter(os.path.join(folder, "_video.mp4"), cv2.VideoWriter_fourcc(*"avc1"), FPS, SIZE)
    track, captions, t = [], [], 0.0
    report = []
    for i, (sid, line) in enumerate(segments):
        key = sid.split(".")[0]
        a, b = bounds[i], bounds[i + 1]
        piece = voice[int(a * RATE): int(b * RATE)]
        dur = len(piece) / RATE
        cuts = [c - a for c in sentence_cuts(words, *spans[i])]
        if key in CLIPS:
            frames, fps = frames_of_clip(os.path.join(folder, CLIPS[key] + ".mp4"))
            length = len(frames) / fps
            speed = min(max(length / dur, 1.0), FAST.get(key, MAX_SPEED))
            show = max(dur, length / speed)
            # the extra time (if any) spread over the pauses between sentences, and the end
            extra = show - dur
            gaps = cuts + [dur]
            parts, last = [], 0.0
            for c in gaps:
                parts.append(piece[int(last * RATE): int(c * RATE)])
                parts.append(np.zeros(int(extra / len(gaps) * RATE), np.float32))
                last = c
            audio = np.concatenate(parts)
            n = int(round(show * FPS))
            for k in range(n):
                src = min(int((k / FPS) * speed * fps), len(frames) - 1)  # the last frame held
                writer.write(frames[src])
            report.append(f"{key}: clip {length:.1f}s x{speed:.2f}, voice {dur:.1f}s, shown {show:.1f}s")
            # caption times shift with the inserted pauses
            shift = lambda x: x + extra / len(gaps) * sum(1 for c in gaps if c <= x)  # noqa: E731
        else:
            img = cv2.imread(os.path.join(folder, "frames", key + ".png"))
            img = img if (img.shape[1], img.shape[0]) == SIZE else cv2.resize(img, SIZE)
            audio, show = piece, dur
            for _ in range(int(round(show * FPS))):
                writer.write(img)
            shift = lambda x: x  # noqa: E731
        # the audio is cut to the frame count, so sound and picture stay in step
        n_samples = int(round(show * FPS)) * RATE // FPS
        audio = np.pad(audio, (0, max(0, n_samples - len(audio))))[:n_samples]
        track.append(audio)
        # captions: the script's sentences, timed by the voice
        sents = [s.strip() for s in re.split(r"(?<=[.?!])\s+", line) if s.strip()]
        starts = [words[spans[i][0]]["s"] - a] + cuts
        ends = cuts + [words[spans[i][1]]["e"] - a]
        if len(starts) != len(sents):  # the sentence split disagrees: one caption for the line
            sents, starts, ends = [line], [starts[0]], [ends[-1]]
        for s, x, y in zip(sents, starts, ends):
            captions.append((t + shift(max(x, 0)), t + shift(y) + 0.2, s))
        t += int(round(show * FPS)) / FPS
    writer.release()

    pcm = np.clip(np.concatenate(track), -32768, 32767).astype(np.int16)
    wav = os.path.join(folder, "_audio.raw")
    pcm.tofile(wav)
    out = os.path.join(folder, "demo.mp4")
    subprocess.run(
        [ffmpeg, "-v", "error", "-y", "-i", os.path.join(folder, "_video.mp4"),
         "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", wav,
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-shortest", out],
        check=True,
    )
    os.remove(wav)
    os.remove(os.path.join(folder, "_video.mp4"))

    def ts(x):
        h, r = divmod(x, 3600)
        m, s = divmod(r, 60)
        return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", ",")

    # no caption starts before the previous one ends
    for k in range(1, len(captions)):
        x, y, txt = captions[k]
        prev = captions[k - 1][1]
        if x < prev:
            captions[k] = (prev, max(y, prev + 0.5), txt)
    with open(os.path.join(folder, "demo.srt"), "w") as f:
        for n, (x, y, s) in enumerate(captions, 1):
            f.write(f"{n}\n{ts(x)} --> {ts(y)}\n{s}\n\n")
    print("\n".join(report))
    print(f"demo.mp4: {t:.1f} s ({int(t // 60)}:{t % 60:04.1f})")


if __name__ == "__main__":
    main(*sys.argv[1:5])
