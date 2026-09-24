from scripts.evolve.constraints import (
    constrain_population,
    extract_constraints,
    parse_phenotype_params,
    score_phenotype,
)

PHENOTYPE = (
    "A { pedestrian : Adult } wearing a {dress : Light} dress trying to cross road "
    "from { direction : LR } at { distance : Short } distance on a day with "
    "fog density {fog_density : 0}"
)


def test_extract_constraints_keyword_spotting():
    constraints = extract_constraints(
        "An adult pedestrian crossing from the left in fog"
    )
    assert constraints == {"pedestrian": "Adult", "direction": "LR", "fog_density": "50"}


def test_extract_constraints_empty_text():
    assert extract_constraints("") == {}
    assert extract_constraints(None) == {}


def test_parse_phenotype_params():
    params = parse_phenotype_params(PHENOTYPE)
    assert params == {
        "pedestrian": "Adult",
        "dress": "Light",
        "direction": "LR",
        "distance": "Short",
        "fog_density": "0",
    }


def test_score_phenotype():
    assert score_phenotype(PHENOTYPE, {"pedestrian": "Adult"}) == 1
    assert score_phenotype(PHENOTYPE, {"pedestrian": "Child"}) == 0
    assert score_phenotype(PHENOTYPE, {}) == 0


class _FakeIndividual:
    def __init__(self, phenotype):
        self.phenotype = phenotype


def test_constrain_population_biases_toward_matches():
    matching = [_FakeIndividual(PHENOTYPE) for _ in range(20)]
    non_matching = [
        _FakeIndividual(PHENOTYPE.replace("Adult", "Child")) for _ in range(20)
    ]
    population = matching + non_matching

    result = constrain_population(population, {"pedestrian": "Adult"}, pop_size=10)

    assert len(result) == 10
    matches = sum(1 for ind in result if "Adult" in ind.phenotype)
    assert matches >= 6  # biased toward the ~0.7 keep_ratio default


def test_constrain_population_no_constraints_returns_first_pop_size():
    population = [_FakeIndividual(PHENOTYPE) for _ in range(20)]
    result = constrain_population(population, {}, pop_size=10)
    assert result == population[:10]
