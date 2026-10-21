"""The study's goal models: what a participant's R1 adds to R0."""
import json
import zipfile

from scripts.analysis import study_goal_models as gm

R0 = '''MAINTAIN "Safety"
    by
        "Check" using "Perception Module"
            operationalized as
                "Detect Pedestrian" performed by "yolov5s"
                taking input "image" producing output "flag"
    in scenario where
        "A pedestrian crossing."
    assuming "fog_density <= 50"
    ensuring "resume_within_s <= 10"
'''


def _session(folder, pid, r1, own=None):
    obstacles = {}
    if own:
        obstacles["X"] = {"resolution": "refine", "mitigation": {"layer": "requirement", "action": own}}
    doc = {"obstacles": obstacles, "study": {"participant": pid, "expertise": "RE"}}
    with zipfile.ZipFile(folder / f"study_{pid}.zip", "w") as z:
        for name, text in {"R0.dsl": R0, "R1.dsl": r1, "decisions.json": json.dumps(doc)}.items():
            z.writestr(f"study_{pid}/{name}", text)


def test_changes_and_the_combined_counts(tmp_path):
    _session(tmp_path, "A", R0.replace('"yolov5s"', '"yolov5m"'))
    _session(tmp_path, "B", R0.replace('"fog_density <= 50"', '"fog_density <= 50" & "fog_density <= 30"'),
             own="resume within 10 s")
    _session(tmp_path, "C", R0)
    data = gm.build(str(tmp_path))
    by = {p["id"]: p for p in data["participants"]}
    assert by["A"]["changes"] == [{"kind": "S", "task": "Detect Pedestrian", "from": "yolov5s", "text": "yolov5m"}]
    assert by["B"]["changes"] == [{"kind": "D", "text": "fog_density <= 30"}]
    assert by["C"]["changes"] == []
    combined = data["combined"]
    assert combined["of"] == 3 and combined["unchanged"] == 1
    assert "fog_density <= 30" in combined["check"]["tree"]["assumptions"]
    assert {(b["text"], b["count"]) for b in combined["badges"]} == {("yolov5m", 1), ("fog_density <= 30", 1)}
    assert data["own_words"] == [{"participant": "B", "obstacle": "X", "text": "resume within 10 s"}]
