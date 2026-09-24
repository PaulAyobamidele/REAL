# Debt Inventory — REAL pre-refactor

Baseline: `pre-refactor-working` (tag), branched from `main` @ `5b04c78`.
Working branch: `fse-tool`. Fork: https://github.com/PaulAyobamidele/REAL.

## Already addressed on fse-tool
- [x] Hardcoded paths/URIs in `scripts/simulations/util.py` — `1def1ff`
- [x] Committed secrets removed: `infra/credentials.json`, `infra/config.env` — `5c9d3e5`
- [x] Redundant `scenario_runner-0.9.15` copy, duplicate `.pt` files, stale metrics db — `92254bc`
- [x] Dead code annotated: `scripts/evolve/util.py::evaluate()` marked BROKEN/UNUSED — `e21a577`
- [x] Postgres image pinned to `postgres:16` in `infra/docker-compose.yml` — `b86a883`
- [x] Runtime data no longer tracked (`infra/minio_data`, `mlruns`, caches) — `3ef94c3`
- [x] `grape` submodule `__pycache__` ignored — `d5b8815`

## Open — blockers for ICSE "Reusable" badge
- [x] No `pyproject.toml` / `requirements.txt` / `setup.py` — `pyproject.toml` added (uncommitted, 2026-09)
- [x] Remaining hardcoded absolute paths — `real_config.py` settings (uncommitted, 2026-09)
- [ ] `api_app.py`: duplicated `/get_testcases` endpoint — Phase 2.2
- [ ] `scripts/evolve/ge.py` imports `simulations.util` directly (tight coupling) — Phase 2.1
- [x] RecordingMonitor path hardcoded — now injected per run (`build_scenario(frames_dir=...)`)
- [x] No `tests/` directory — 67 tests, no CARLA needed (uncommitted, 2026-09)
- [ ] No CI — Phase 4.4
- [ ] README lacks external install/quickstart — partly done (install, API, analysis); needs a clean-machine walkthrough
- [ ] No `STATUS` file for the ICSE artifact — Phase 5.5
- [ ] No DOI / Zenodo release — Phase 5.6
- [ ] Nothing since `b1fd009` is committed — review + commit the 2026-09-17..23 work
- [ ] `scratch.temp`: `distance` parameter has no effect; random lane choice yields "no encounter" runs — fix geometry
- [ ] Stages 8-9 (decisions file, requirement writer, round comparison) — Notes.md §8.7

## Known runtime-environment debts
- [ ] CARLA 0.9.15 headless setup on compute node — Phase 1.3
- [ ] Dockerfile + docker-compose.yml for one-command bring-up — Phase 1.4
- [ ] sim_env/ still used locally; containerization will replace it — Phase 1.4
