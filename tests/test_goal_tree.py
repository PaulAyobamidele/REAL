"""DSL.get_goal_tree(): the requirement as a goal model, exported for the
review interface so it never needs a second parser."""

import json
import os

from scripts.analysis import obstacles
from scripts.redsl.grammar import DSL
from test_grammar import REQUIREMENT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_goal_tree_of_reference_requirement():
    tree = DSL(REQUIREMENT).get_goal_tree()
    assert tree["temporal"] == "MAINTAIN" and tree["objective"] == "Pedestrian Safety"
    ref = tree["refinement"]
    assert ref["combinator"] == "followed by" and len(ref["goals"]) == 2
    check, brake = ref["goals"]
    assert check["objective"] == "Pedestrian Check" and check["agent"] == "Perception Module"
    assert check["operations"] == [{
        "task": "Detect Pedestrian", "tasks": ["Detect Pedestrian"], "condition": None,
        "module": "yolov5s", "inputs": ["image"],
        "outputs": ["pedestrian detection confidence", "pedestrian detection flag"]}]
    assert brake["objective"] == "braking" and brake["agent"] == "braking module"
    assert brake["operations"][0]["tasks"] == ["Bring down throttle", "Apply Brakes"]
    assert brake["operations"][0]["task"] == "Bring down throttle & Apply Brakes"
    assert brake["operations"][0]["condition"] == "pedestrian detection flag=True"
    assert brake["operations"][0]["module"] == "proportional_braking"
    assert tree["scenario"] == "A pedestrian trying to cross the street in fog."
    assert tree["assumptions"] == [] and tree["soft_goals"] == []
    json.dumps(tree)   # JSON-serialisable, as the report needs it


def test_goal_tree_carries_clauses_and_temporal_op():
    text = REQUIREMENT.replace("MAINTAIN", "ACHIEVE").rstrip() + (
        '\n    assuming "fog_density <= 50" & "daylight"'
        '\n    ensuring "keep moving"\n')
    tree = DSL(text).get_goal_tree()
    assert tree["temporal"] == "ACHIEVE"
    assert tree["assumptions"] == ["fog_density <= 50", "daylight"]
    assert tree["soft_goals"] == ["keep moving"]
    # get_operations still answers the same as before, plus the split tasks
    ops = DSL(text).get_operations()
    assert [o["task"] for o in ops] == ["Detect Pedestrian", "Bring down throttle & Apply Brakes"]
    assert ops[1]["tasks"] == ["Bring down throttle", "Apply Brakes"]


def _goal(objective, agent):
    return f'"{objective}" using "{agent}"'


def test_chain_of_the_same_combinator_is_flattened():
    text = ('MAINTAIN "G" by ' + _goal("A", "a") + " followed by " + _goal("B", "b")
            + " followed by " + _goal("C", "c") + ' in scenario where "s"')
    tree = DSL(text).get_goal_tree()
    assert tree is not None, DSL(text).parse_error
    ref = tree["refinement"]
    assert ref["combinator"] == "followed by"
    assert [g["objective"] for g in ref["goals"]] == ["A", "B", "C"]
    assert all(g["operations"] == [] for g in ref["goals"])


def test_parallel_combinator_is_recovered_from_the_source():
    text = 'MAINTAIN "G" by ' + _goal("A", "a") + " parallely " + _goal("B", "b") + ' in scenario where "s"'
    tree = DSL(text).get_goal_tree()
    assert tree is not None, DSL(text).parse_error
    assert tree["refinement"]["combinator"] == "parallely"
    assert [g["objective"] for g in tree["refinement"]["goals"]] == ["A", "B"]


def test_single_refined_goal_has_no_combinator():
    text = ('MAINTAIN "G" by "A" using "a" operationalized as "Do" performed by "m" '
            'taking input "x" producing output "y" in scenario where "s"')
    tree = DSL(text).get_goal_tree()
    assert tree is not None, DSL(text).parse_error
    assert tree["refinement"] == {"objective": "A", "agent": "a", "operations": [{
        "task": "Do", "tasks": ["Do"], "condition": None, "module": "m",
        "inputs": ["x"], "outputs": ["y"]}]}


def test_unparsed_requirement_has_no_tree():
    assert DSL("a pedestrian crossing in fog").get_goal_tree() is None
    assert DSL(None).get_goal_tree() is None


def test_requirement_context_exports_the_tree():
    ctx = obstacles.requirement_context(REQUIREMENT)
    assert ctx["tree"]["objective"] == "Pedestrian Safety"
    assert ctx["tree"]["refinement"]["goals"][0]["operations"][0]["module"] == ctx["detection_module"]
    assert obstacles.requirement_context("not a requirement") == {"parsed": False}


def test_example_files_have_trees():
    base = DSL(open(os.path.join(ROOT, "docs", "examples", "R_baseline.dsl")).read()).get_goal_tree()
    assert base["temporal"] == "MAINTAIN" and len(base["assumptions"]) == 5 and len(base["soft_goals"]) == 2
    assert base["refinement"]["combinator"] == "followed by"
    full = DSL(open(os.path.join(ROOT, "docs", "examples", "requirement_full_example.dsl")).read()).get_goal_tree()
    assert [g["objective"] for g in full["refinement"]["goals"]] == ["Pedestrian Check", "braking"]
