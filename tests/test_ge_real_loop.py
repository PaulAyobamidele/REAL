import scripts.evolve.ge as ge_module
from scripts.evolve.ge import start_ge


def _dummy_evaluate(ind, dummy):
    # Mimics scripts.simulations.util.evaluate's return shape (a 1-tuple
    # fitness) without touching CARLA/VerifAI - exercises the real
    # GRAPE/DEAP loop mechanics (selection, crossover, mutation, elitism)
    # in isolation from the simulator.
    return (len(ind.phenotype) % 10,)


def test_start_ge_sample_true_unchanged(monkeypatch):
    # The sample=True path must stay byte-for-byte identical to before -
    # it's still used by the Streamlit "Generate Sample TestCases" button.
    monkeypatch.setattr(ge_module, "evaluate", _dummy_evaluate)
    testcases = start_ge(sample=True, population_size=5)
    assert isinstance(testcases, list)
    assert len(testcases) == 5
    assert all(isinstance(t, str) for t in testcases)


def test_start_ge_real_loop_with_mocked_evaluate(monkeypatch, tmp_path):
    import real_config

    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))
    monkeypatch.setattr(ge_module, "evaluate", _dummy_evaluate)

    run_id = "test-run"
    result = start_ge(
        sample=False,
        population_size=10,
        max_generations=2,
        run_id=run_id,
        requirement="a pedestrian crossing in fog",
        scenario_text="a pedestrian crossing in fog",
        record_video=False,  # no CARLA server available in this environment
    )

    assert result["run_id"] == run_id
    assert result["best_phenotype"] is not None
    assert "logbook" in result

    out_dir = tmp_path / "runs" / run_id
    assert (out_dir / "run_meta.json").exists()
    assert (out_dir / "generations.csv").exists()
    assert (out_dir / "best_phenotype.txt").exists()
    assert (out_dir / "best_scenario.scenic").exists()


def test_start_ge_real_loop_with_constraints(monkeypatch, tmp_path):
    import real_config

    monkeypatch.setattr(real_config.settings, "artifacts_dir", str(tmp_path))
    monkeypatch.setattr(ge_module, "evaluate", _dummy_evaluate)

    result = start_ge(
        sample=False,
        population_size=10,
        max_generations=1,
        constraints={"pedestrian": "Adult"},
        run_id="constrained-run",
        record_video=False,
    )
    assert result["best_phenotype"] is not None
