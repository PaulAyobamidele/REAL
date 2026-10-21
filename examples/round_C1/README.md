# Round C1, as bundled with the tool

The round shown in the paper and the demonstration video: the car as tested
(proportional braking, the yolov5s detector) on test scene v2, 288 scenarios x 3
runs, judged against the study requirement (its `analysis_report.json` says so in
its banner). Copied as it was presented to the study's participants, under the
same neutral run id, with the per-run quantities the interface re-judges with and
the camera recording of its best scenario. It is never re-analysed here:
`scripts/demo.py` processes only `examples/demo_runs/` (rounds 1 and 2).

The review image copies this folder next to the two demo rounds and labels each
round in the workspace index (`Dockerfile.review`). This README is not part of
the image.
