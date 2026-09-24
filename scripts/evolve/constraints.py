import random
import re

# old.bnf's terminal categories (scripts/templates/old/old.bnf):
#   direction    ::= LR | RL
#   distance     ::= Short | Long
#   fog_density  ::= 0 | 50
#   pedestrian   ::= Adult | Child
#   dress        ::= Light | Dark
CONTROLLED_VOCAB = {
    "pedestrian": {"adult": "Adult", "child": "Child", "kid": "Child"},
    "dress": {"light": "Light", "bright": "Light", "dark": "Dark"},
    "direction": {"left": "LR", "right": "RL"},
    "distance": {
        "close": "Short", "near": "Short", "short": "Short",
        "far": "Long", "long": "Long",
    },
    "fog_density": {"fog": "50", "foggy": "50", "clear": "0"},
}

PHENOTYPE_PARAM_RE = re.compile(r"\{\s*(\w+)\s*:\s*([\w.\d]+)\s*\}")


def extract_constraints(scenario_text):
    """Keyword-spot a small controlled vocabulary in free-text scenario
    description onto old.bnf's terminal categories. First match per
    category wins; no inference chains."""
    if not scenario_text:
        return {}

    text = scenario_text.lower()
    constraints = {}
    for category, keywords in CONTROLLED_VOCAB.items():
        for keyword, value in keywords.items():
            if keyword in text:
                constraints[category] = value
                break
    return constraints


def parse_phenotype_params(phenotype):
    """Extract the {key: value} pairs embedded in a GE phenotype string.
    Shared implementation for the regex duplicated across api_app.py,
    scripts/simulations/util.py, and pages/2_evolution.py."""
    matches = PHENOTYPE_PARAM_RE.findall(phenotype)
    return {key.strip(): value.strip() for key, value in matches}


def score_phenotype(phenotype, constraints):
    """Count how many extracted params match the constraint dict."""
    if not constraints:
        return 0
    params = parse_phenotype_params(phenotype)
    return sum(1 for key, value in constraints.items() if params.get(key) == value)


def constrain_population(population, constraints, pop_size, keep_ratio=0.7):
    """Given an oversampled `population` (e.g. 3x pop_size individuals from
    grape's existing sensible_initialisation), bias the returned population
    of exactly pop_size individuals toward those matching `constraints`,
    while keeping some non-matching individuals for diversity.

    Pure post-filter/resample around grape/DEAP's existing machinery -
    no changes to grammar structure, mutation, or fitness required.
    """
    if not constraints:
        return population[:pop_size]

    scored = [(score_phenotype(ind.phenotype, constraints), ind) for ind in population]
    scored.sort(key=lambda pair: pair[0], reverse=True)

    matches = [ind for score, ind in scored if score > 0]
    non_matches = [ind for score, ind in scored if score == 0]

    n_from_matches = min(len(matches), round(keep_ratio * pop_size))
    selected = matches[:n_from_matches]

    remaining = pop_size - len(selected)
    if remaining > 0:
        pool = non_matches if non_matches else matches[n_from_matches:]
        if pool:
            selected += random.sample(pool, min(remaining, len(pool)))

    # Backfill if still short (small/duplicate-heavy oversampled populations).
    if len(selected) < pop_size:
        rest = [ind for ind in population if ind not in selected]
        selected += rest[: pop_size - len(selected)]

    return selected[:pop_size]
