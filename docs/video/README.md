# The demo videos

| Video | For | Script | Status |
|---|---|---|---|
| ICSE 2027 tool demonstration, 4:28 | reviewers (YouTube, unlisted; URL at the end of the abstract) | [slides.md](slides.md) (opening slides), then [icse_video.md](icse_video.md) | assembled: `artifacts/video/2026-10-20/elevenlabs/demo.mp4` (+ `demo.srt`); to review and upload |
| Study instructions, ~2 min | participants (the study's Overview page) | to write | on practice data, after the ICSE video |

## Recording the clips

Every shot is recorded the same way every take by `ui/scripts/video/record.mjs`. It
drives the tool and records 1920x1080, with the page at 125% so text reads well. It draws a
visible cursor with a click ripple, keeps the guided tours off, and never submits a run.

1. Start what the shots need (in `ui/`, plus the helper from the repository root):

   ```bash
   VITE_PUBLIC_DIR=study-public npx vite --port 5175 --strictPort   # the normal tool on round C1
   VITE_STUDY=1 npx vite --port 5174 --strictPort                   # the study build (S9)
   sim_env/bin/python -m scripts.redsl.serve                         # the editor's helper (S3)
   ```

   `study-public/` must exist (`npm run study:data`); it holds round C1 with its
   CARLA recording.

2. Record (all shots, or some by id), then convert to MP4 (H.264):

   ```bash
   cd ui
   VIDEO_IMAGE=<docker image> VIDEO_REPO=<repository URL> VIDEO_PAPER=<arXiv id> \
     node scripts/video/record.mjs            # or: … record.mjs S3 S8
   cd .. && sim_env/bin/python ui/scripts/video/to_mp4.py artifacts/video/<date>
   ```

   The three `VIDEO_*` values appear on the terminal shot and the end card. They are
   passed in at recording time, so they never sit in the repository's files.

For the ElevenLabs edit, the clips in playing order with their voice-over are in
`artifacts/video/2026-10-20/elevenlabs/` (see [demo_voiceover.md](demo_voiceover.md)); the whole video, frame by frame with its voice
line, is [edit_plan.md](edit_plan.md).

Output: `artifacts/video/<date>/<shot>.mp4` (the slides P0-P7 and the new end card are in `2026-10-20/`, the other shots in `2026-10-19/`) (and `.webm`), plus check frames
`<shot>_<n>.png`. The folder is not committed: the clips are large, and they can be
recorded again at any time.

| Clip | Shot | Length |
|---|---|---|
| P0 | slide: title | 6 s |
| P1 | slide 1 · the big picture | 15 s |
| P2 | slide 2 · the problem | 17 s |
| P3 | slide 3 · the context | 21 s |
| P4 | slide 4 · the gap we fill | 14 s |
| P5 | slide 5 · how REAL works (a diagram that builds, ★ on what REAL adds) | 21 s |
| P7 | slide: let's see it (the five steps) | 7 s |
| P6 | results slide: before and after (R0 → R1, two labelled changes) | 16 s |
| S1 | (unused since the slides) CARLA camera, test case 6 (the round's best scenario) | 12 s |
| A1 | (unused) animation: hundreds of failures, four places a fix could go | 10 s |
| S2 | (unused) welcome page, expertise typed | 13 s |
| A2 | (unused) animation: D, S ⊨ R; a failure counts only when the assumptions held | 15 s |
| S3 | REAL-DSL editor: completion, a hover marking the goal model, the run panel | 21 s |
| S4 | Test Execution Report: counts, a broken assumption located in the requirement | 17 s |
| S5 | worked example: CARLA's recording and the replay to the closest moment | 23 s |
| S6 | Failure Analysis: an obstacle, its evidence, the pattern map | 17 s |
| S7 | triage: "the world explains it", and the car-side option refused | 21 s |
| S8 | revision: the added line, a remaining failure fixed, signing | 29 s |
| A3 | animation: failures per car fix (22, 6, 349, 335) | 16 s |
| S9 | the study's welcome page | 9 s |
| S10 | the Docker command, then the manual | 16 s |
| E1 | end card | 8 s |

## Assembling (one command)

With one voice-over file of [full_script.txt](full_script.txt) and its word timings
(from any speech-to-text with word timestamps), `ui/scripts/video/assemble.py` builds
the whole video and its captions:

```bash
sim_env/bin/python ui/scripts/video/assemble.py artifacts/video/2026-10-20/elevenlabs \
  <voice.mp3> <words.json> <path to ffmpeg>
```

## Editing by hand (instead)

1. **Voice-over first.** Record the slides' narration ([slides.md](slides.md)), then [icse_video.md](icse_video.md)'s line by line, in
   a quiet room with any decent USB microphone or headset. Leave a short pause between
   lines and re-take any line you stumble on.
2. **Lay out the clips** in the script's order (P0-P5, P7, then S3-S8, P6, A3, S9, S10, E1), against the narration: each clip
   under its lines. Trim the clips' starts and ends (the first second of a page loading,
   the last of a hold).
3. **Zoom where the eye must go.** Zoom 120-150% on the completion list (S3), the
   highlighted requirement line (S4), the replay's moments (S5) and the greyed-out
   option (S7).
4. **Captions.** Add the script's "On screen" text as titles; generate subtitles from the
   voice-over (Descript and YouTube both do this).
5. **Sound.** Leave quiet music under it, or none; the voice must stay clear.
6. **Export** 1080p MP4. Check the length is between 3 and 5 minutes.
7. **Upload** to YouTube as **unlisted**. Paste the URL at the end of the abstract on
   HotCRP.

Participants must not see this video before their session: it shows the results of the
fixes they will choose between. Do not link it from the study.
