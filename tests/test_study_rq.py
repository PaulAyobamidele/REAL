"""The study's RQ analysis: counts from the participants' own files, gaps reported."""
import io
import json
import zipfile

from scripts.analysis import study_rq

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


def _zip(pid, r1, obstacles, scope=None, rated=True):
    for item in list(obstacles.values()) + list((scope or {}).values()):
        if rated:
            item["helpful"] = {"rating": "not_helpful" if item.get("explained_by") == "world" else "helpful",
                               "why": "no evidence" if item.get("explained_by") == "world" else None}
    doc = {"schema_version": 1, "run_id": "r", "obstacles": obstacles, "scope": scope or {}, "assumptions": {},
           "study": {"participant": pid, "expertise": "RE", "car": "C3", "build": "test",
                     "started_at": "2026-10-21T10:00:00Z", "signed_at": "2026-10-21T10:30:00Z"}}
    log = "\n".join(json.dumps(e) for e in [
        {"time": "2026-10-21T10:00:00Z", "event": "step_entered", "screen": "overview"},
        {"time": "2026-10-21T10:02:00Z", "event": "step_left", "screen": "overview"},
        {"time": "2026-10-21T10:30:00Z", "event": "session_end", "screen": "review/x/5"}])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, text in {"decisions.json": json.dumps(doc), "R0.dsl": R0, "R1.dsl": r1, "log.jsonl": log,
                           "requirement_diff.md": ""}.items():
            z.writestr(f"study_{pid}/{name}", text)
    return buf.getvalue()


def test_counts_refinements_ratings_and_reads_a_zip_of_zips(tmp_path):
    world = {"verdict": "accept", "explained_by": "world", "renamed_to": None, "status": "new",
             "mitigation": {"layer": "requirement", "action": "fog_density <= 30"}}  # in own words (option C)
    refine = {"verdict": "accept", "explained_by": "car", "resolution": "refine", "renamed_to": None, "status": "new",
              "mitigation": {"layer": "requirement", "action": "resume within 10 s"}}
    a = _zip("S-AAAA", R0.replace('"fog_density <= 50"', '"fog_density <= 50" & "fog_density <= 30"'),
             {"PedestrianSizeTooSmall": dict(world), "StandoffUnnecessaryStop": dict(refine)})
    b = _zip("S-BBBB", R0, {"PedestrianSizeTooSmall": dict(refine), "StandoffUnnecessaryStop": dict(refine)}, rated=False)
    (tmp_path / "study_S-AAAA.zip").write_bytes(a)
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w") as z:  # the admin page's "Download all"
        z.writestr("sessions/study_S-BBBB.zip", b)
    (tmp_path / "all.zip").write_bytes(outer.getvalue())

    r = study_rq.analyse(str(tmp_path), str(tmp_path / "no_rounds"))
    by = {s["id"]: s for s in r["participants"]}
    assert set(by) == {"S-AAAA", "S-BBBB"}
    assert by["S-AAAA"]["assumptions_refined"] == 1          # fog_density <= 30 added to R1
    assert by["S-AAAA"]["requirements_refined"] == 1         # refined in own words
    assert by["S-AAAA"]["unhelpful"] == ["PedestrianSizeTooSmall"]
    assert by["S-AAAA"]["minutes"] == 30.0
    assert by["S-AAAA"]["seconds_per_step"] == {"overview": 120}
    assert by["S-AAAA"]["problems"] == []  # incl. R1 = refine's derivation from the decisions
    assert any("no helpfulness rating" in p for p in by["S-BBBB"]["problems"])
    assert r["totals"]["diagnoses_unhelpful"] == 1


def test_fleiss_kappa():
    assert study_rq.fleiss_kappa([[3, 0], [0, 3]]) == 1.0
    assert study_rq.fleiss_kappa([[3, 0]]) is None
