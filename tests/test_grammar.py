from scripts.redsl.grammar import DSL

# The reference requirement from infra/hpc/run_real_av.slurm / job 3564897.
REQUIREMENT = """
MAINTAIN "Pedestrian Safety"
    by
        "Pedestrian Check" using "Perception Module"
            operationalized as
                "Detect Pedestrian" performed by "yolov5s"
                taking input "image" producing output "pedestrian detection confidence" & "pedestrian detection flag"
    followed by
        "braking" using "braking module"
            operationalized as
                "Bring down throttle" & "Apply Brakes" if "pedestrian detection flag=True" performed by "proportional_braking"
                taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where
        "A pedestrian trying to cross the street in fog."
"""


def test_reference_requirement_parses():
    dsl = DSL(REQUIREMENT)
    assert dsl.parse_tree is not None
    assert dsl.get_scenario() == "A pedestrian trying to cross the street in fog."


def test_get_operations_lists_both_modules():
    ops = DSL(REQUIREMENT).get_operations()
    assert len(ops) == 2
    detect, brake = ops
    assert detect["task"] == "Detect Pedestrian"
    assert detect["module"] == "yolov5s"
    assert detect["inputs"] == ["image"]
    assert detect["outputs"] == ["pedestrian detection confidence", "pedestrian detection flag"]
    assert detect["condition"] is None
    assert brake["task"] == "Bring down throttle & Apply Brakes"
    assert brake["condition"] == "pedestrian detection flag=True"
    assert brake["module"] == "proportional_braking"
    assert brake["outputs"] == ["Braking Status Flag"]


def test_get_perception_model_returns_detector():
    dsl = DSL(REQUIREMENT)
    assert dsl.get_perception_model() == "yolov5s"
    assert dsl.get_module_for("Apply Brakes") == "proportional_braking"
    assert dsl.get_module_for("Bring down throttle") == "proportional_braking"
    assert dsl.get_module_for("Fly") is None


def test_assuming_clause_is_optional_and_parsed():
    # Without the clause: unchanged behaviour.
    assert DSL(REQUIREMENT).get_assumptions() == []

    with_clause = REQUIREMENT.rstrip() + '\n    assuming "fog_density <= 50" & "pedestrian is on foot, not cycling"\n'
    dsl = DSL(with_clause)
    assert dsl.parse_tree is not None
    assert dsl.get_assumptions() == ["fog_density <= 50", "pedestrian is on foot, not cycling"]
    # everything else still reads the same
    assert dsl.get_scenario() == "A pedestrian trying to cross the street in fog."
    assert dsl.get_perception_model() == "yolov5s"
    assert len(dsl.get_operations()) == 2


def test_ensuring_clause_soft_goals():
    assert DSL(REQUIREMENT).get_soft_goals() == []
    both = REQUIREMENT.rstrip() + ('\n    assuming "fog_density <= 50"'
                                   '\n    ensuring "vehicle resumes within 10 s once the crossing is clear" & "no braking above 0.5 g"\n')
    dsl = DSL(both)
    assert dsl.parse_tree is not None
    assert dsl.get_assumptions() == ["fog_density <= 50"]
    assert dsl.get_soft_goals() == ["vehicle resumes within 10 s once the crossing is clear", "no braking above 0.5 g"]
    only_ensuring = REQUIREMENT.rstrip() + '\n    ensuring "keep moving"\n'
    assert DSL(only_ensuring).get_soft_goals() == ["keep moving"]
    # order is fixed: assuming before ensuring
    wrong_order = REQUIREMENT.rstrip() + '\n    ensuring "x"\n    assuming "y"\n'
    assert DSL(wrong_order).parse_tree is None


def test_assuming_clause_needs_quoted_strings():
    bad = REQUIREMENT.rstrip() + "\n    assuming fog_density <= 50\n"
    assert DSL(bad).parse_tree is None


def test_unparseable_requirement_is_safe():
    dsl = DSL("a pedestrian crossing in fog")
    assert dsl.parse_tree is None
    assert dsl.get_operations() == []
    assert dsl.get_perception_model() is None
    assert dsl.get_scenario() is None                       # used to raise AttributeError
    assert dsl.parse_error and "line 1" in dsl.parse_error  # Lark says where it stopped
    assert DSL(None).parse_error == "no requirement text given"
    good = DSL(REQUIREMENT)
    assert good.parse_error is None


def test_comment_lines_are_ignored():
    commented = "# what we ran\n" + REQUIREMENT.rstrip() + "\n# trailing note\n"
    dsl = DSL(commented)
    assert dsl.parse_tree is not None and dsl.get_perception_model() == "yolov5s"


def test_example_files_parse():
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    full = DSL(open(os.path.join(root, "docs", "examples", "requirement_full_example.dsl")).read())
    assert full.parse_tree is not None
    assert full.get_module_for("Apply Brakes") == "proportional_braking"
    assert full.get_assumptions() == ["fog_density <= 50", "pedestrian is on foot, not cycling"]
    assert full.get_soft_goals() == ["vehicle resumes within 10 s once the crossing is clear"]
    r0 = DSL(open(os.path.join(root, "docs", "examples", "R0_rounds1_2.dsl")).read())
    assert r0.parse_tree is not None
    assert r0.get_assumptions() == [] and r0.get_soft_goals() == []
    base = DSL(open(os.path.join(root, "docs", "examples", "R_baseline.dsl")).read())
    assert base.parse_tree is not None
    assert base.get_module_for("Apply Brakes") == "proportional_braking"
    assert base.get_assumptions() == ["fog_density <= 50", "initial_separation_m >= 15",
                                      "pedestrian_speed_mps <= 3", "daylight, dry road",
                                      "pedestrian on foot"]
    assert len(base.get_soft_goals()) == 2
    assert r0.get_module_for("Apply Brakes") == "proportional_braking"
    assert r0.get_scenario() == "A pedestrian trying to cross the street in fog."
