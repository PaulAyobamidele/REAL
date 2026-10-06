# 🚗 REAL - Requirements Engineering for mAchines that Learn (and Fail)

[![Python](https://img.shields.io/badge/Python-84.4%25-blue)](https://www.python.org/)
[![Scenic](https://img.shields.io/badge/Scenic-5.8%25-green)](https://scenic-lang.readthedocs.io/)
[![Java](https://img.shields.io/badge/Java-5.6%25-orange)](https://www.java.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-brightgreen)](LICENSE)

> An intelligent system for automated test case generation and requirement validation in autonomous vehicle scenarios using evolutionary computation and domain-specific languages.

## 🌟 Overview

REAL is a requirements engineering platform for adaptive learning that bridges the gap between natural language requirements and executable test scenarios for autonomous systems. By leveraging grammatical evolution, domain-specific languages (DSL), and simulation environments, REAL automatically generates and validates test cases for complex automotive scenarios to improve their requirements specification.

### 🎯 Key Capabilities

- **🔍 Requirement Parsing**: Natural language requirement analysis using custom DSL grammar
- **🧬 Evolutionary Test Generation**: Automated test case generation using Grammatical Evolution (GE)
- **🚙 Scenario Simulation**: Integration with CARLA simulator for realistic autonomous vehicle testing  
- **🔧 API-Driven Architecture**: RESTful API for seamless integration with external tools
- **📊 MLOps Integration**: Experiment tracking and model management with MLflow
- **🎭 Scenic Integration**: Support for probabilistic programming languages for scenario description

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Requirements  │    │   DSL Parser    │    │  Test Generator │
│   (Natural Lang)│───▶│   (Grammar)     │───▶│   (Evolutionary)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
        ▲                                              │
        │                                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Requirement     │◀───│   Validation    │◀───│   CARLA Sim     │
│ Refinement      │    │   (Fitness)     │    │   (Scenarios)   │
│ (Analyst)       │    └─────────────────┘    └─────────────────┘
└─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Redis Server
- CARLA Simulator (0.9.13)
- Docker (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/DoubleBlinded1/REAL.git
   cd REAL
   ```

2. **Set up the environment**
   ```bash
   chmod +x setup_env.sh
   ./setup_env.sh
   ```

3. **Install dependencies**
   ```bash
   pip install -e .
   cp .env.example .env   # then edit .env if your ports/paths differ
   ```

4. **Start Redis server**
   ```bash
   redis-server
   ```

5. **Launch the API server**
   ```bash
   python api_app.py
   ```

The API will be available at `http://127.0.0.1:7999`

## 💡 Usage Examples

### 1. Verify a Requirement

```bash
curl "http://127.0.0.1:7999/verify_requirement?requirement=The vehicle should maintain safe distance"
```

**Response:**
```json
{
  "parsed_grammar": "...",
  "STATUS": "OK"
}
```

### 2. Generate Test Cases

```bash
curl "http://127.0.0.1:7999/get_testcases?requirement=Emergency braking in urban scenario"
```

**Response:**
```json
{
  "testcases": [
    "{speed: 60, distance: 20, weather: clear}",
    "{speed: 45, distance: 15, weather: rain}"
  ],
  "STATUS": "OK"
}
```

### 3. Validate Test Cases

```bash
curl "http://127.0.0.1:7999/validate?testcase={speed: 50, distance: 25, weather: fog}"
```

### 4. Run every scenario (exhaustive grid) with per-simulation telemetry

```bash
curl "http://127.0.0.1:7999/run_grid?requirement=<KAOS requirement>&trials=5&record_video=true"
```

Runs all 32 scenarios the grammar (`scripts/templates/old/old.bnf`) can express,
`trials` times each, and writes to `artifacts/runs/<run_id>/`:

| file | what |
|---|---|
| `run_meta.json` | inputs, seed, system under test (braking mode, perception model), status |
| `scenarios.csv` | one row per scenario: pass/fail counts |
| `simulations.csv` | one row per simulation: closest distance to the pedestrian, ego speed, when/at what distance the pedestrian was first detected and with what confidence, when braking started, how long it lasted, model inference time, ... |
| `traces/<scenario>_<sim>.json` | full per-step time series (distance, speed, detections, brake events) |
| `best_scenario.scenic`, `best_scenario.mp4` | the most-falsifying scenario and a video of one run of it |

The GE search (`/get_testcases?sample=false`) writes the same `simulations.csv`
plus `generations.csv`. Rows are appended as each simulation ends, so a job that
is killed halfway still leaves usable data.

### 5. Failure analysis (laptop, no simulator needed)

```bash
python -m scripts.analysis.report artifacts/runs/<run_id>
```

Reads `simulations.csv` and writes `analysis_report.md` / `.json` into the run
folder: scope (admissibility) labelling, failure rate per scenario setting and
per scenario, how each simulation ended (`never_detected`, `detected_too_late`,
`brake_released`, `braking_insufficient`, `stopped_too_close`; `passed`;
`passed_stalled` = the safety rule held only because the car stopped short and
never moved again - a standoff, reported separately; `no_encounter` runs where
the car never met the pedestrian are excluded from the rates),
named obstacles with evidence and candidate mitigations per layer
(data / model / system / requirement), and sanity warnings about the data
itself. Scope rules live in `scripts/analysis/admissibility_rules.json` and in
the requirement's own `assuming` clause (below).

## 📝 Requirement language (KAOS-style DSL)

`scripts/redsl/grammar.py` parses requirements such as:

```
MAINTAIN "Pedestrian Safety"
    by
        "Pedestrian Check" using "Perception Module"
            operationalized as
                "Detect Pedestrian" performed by "yolov5s"
                taking input "image" producing output "pedestrian detection flag"
    followed by
        "braking" using "braking module"
            operationalized as
                "Apply Brakes" if "pedestrian detection flag=True" performed by "proportional_braking"
                taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where
        "A pedestrian trying to cross the street in fog."
    assuming "fog_density <= 50" & "pedestrian is on foot, not cycling"
```

- The **scenario** sentence is keyword-matched (`scripts/evolve/constraints.py`)
  to bias the GE population (fog → `fog_density=50`, child → `Child`, ...).
- The modules named after **`performed by`** define the system under test:
  `"Detect Pedestrian" performed by "<yolov5s|yolov5m|fine_tune|few_shot>"`
  selects the perception weights in `model/`; `"Apply Brakes" performed by
  "<emergency_braking|proportional_braking>"` selects the braking behaviour
  (baseline full brake while detected, or the paper's M4 proportional braking
  from 30% confidence). Recorded in `run_meta.json` and every telemetry row.
- The optional **`assuming`** clause states domain assumptions (KAOS domain
  properties / ODD limits). Machine-readable ones (`<setting> <op> <value>`)
  become out-of-scope rules in the analysis - failures outside them are
  reported as *spurious*, not as requirement violations. Anything else is kept
  as free text for the human reviewer. Requirements without the clause parse
  exactly as before. Two rules (design: `docs/design/domain_assumptions.md`):
  an assumption must be about the **world** (pedestrian, weather, road,
  start positions), never about the car under test - otherwise a failure
  could be defined away by narrowing the car's behaviour; and an assumption
  whose quantity is not recorded in a run is reported as **not measured**,
  never as held. Each assumption is checked per simulation (held /
  broken / not measured) and listed with its counts in the report's Scope
  section; only a broken assumption sets a simulation aside as spurious.
  An assumption about the car is listed as rejected. Each also gets a verdict: does breaking it go
  with more failures (load-bearing), not (a candidate for loosening), or was
  it never broken (untested). Soft goals (`ensuring`) are listed in the
  report; measuring them is roadmap M2.5. In the review (CLI or page) each
  assumption gets keep / tighten / loosen / drop, new ones can be added, and
  the requirement writer turns these into `[D]` lines in R1 (loosening an
  assumption that was never broken is flagged as having no evidence).
  **Scene v2** (from 2026-10-01): the pedestrian starts at a kerb and crosses
  (both directions), the car starts on the pedestrian's lane 20 m (Short) or
  35 m (Long) before the crossing point, the pedestrian steps out at once
  (trigger setting, was a fixed 8 m), and each simulation records pedestrian
  speed, braking smoothness (peak deceleration / jerk), time-to-collision and
  whether the car moved on again. Soft goals such as
  `ensuring "resume_within_s <= 10"` are checked per encounter (met / missed);
  runs before scene v2 report them as not measured. `tests/test_scene_compile.py`
  builds the real scenes on a laptop (no CARLA) - run it before any Narval job. GE searches
  `scripts/templates/v2/scene_v2.bnf` (21,120 scenarios: numeric fog, car
  approach distance, pedestrian speed and crossing trigger, deliberately
  beyond the baseline assumptions); the grid keeps `old.bnf` (32). On Narval, `REAL_SEARCH=ge` runs GE
  instead of the grid (infra/hpc/README.md, "GE runs"). Reports on GE runs say
  that GE samples unevenly, count each scenario once alongside the raw rates,
  and mark supported obstacles as leads; `python -m scripts.analysis.grid_check`
  confirms them on balanced repeats.
  `docs/examples/R_baseline.dsl` is the baseline requirement with both slots
  (`assuming` and `ensuring`), used from run 2b on. A finished run can be
  re-judged against another requirement without touching its own report:
  `python -m scripts.analysis.report <run> --requirement FILE --out <run>/<subfolder> --banner "..."`. Note that rounds 1-2 stated no assumptions, so their failure
  rates are rates under no assumptions.
- Two reference files: `docs/examples/requirement_full_example.dsl` shows every
  clause at once; `docs/examples/R0_rounds1_2.dsl` is the requirement rounds 1–2
  actually ran with (no `assuming`, no `ensuring`). Both are parse-checked by the
  test suite. `#` lines are comments. The Narval job reads its requirement from
  such a file (`REAL_REQUIREMENT_FILE`, default `R0_rounds1_2.dsl`) and records
  the path as `requirement_source` in `run_meta.json`. A requirement that does
  not parse is reported with Lark's line/column message by `/verify_requirement`.
- The optional **`ensuring`** clause (after `assuming`) states soft goals -
  quality attributes such as the paper's *SmoothBraking* / making progress:
  `ensuring "vehicle resumes within 10 s once the crossing is clear"`. Added
  when round 2 showed a mitigation satisfying the safety goal by never moving
  again; the requirement had no place to say the car must keep going. Read by
  `DSL.get_soft_goals()`; not yet checked automatically by the executor.

## 📁 Project Structure

```
REAL/
├── 📄 api_app.py              # FastAPI application server
├── 📄 ge.py                   # Grammatical Evolution implementation
├── 🎯 app.py                  # Streamlit web interface
├── 📄 real_config.py          # All environment-dependent settings (pydantic BaseSettings)
├── 📁 scripts/
│   ├── 🧬 evolve/             # GE search (ge.py), exhaustive grid (grid.py), constraints, run persistence, video
│   ├── 🔬 analysis/           # Failure analysis: telemetry, admissibility, failure_model, obstacles, report
│   ├── 🔧 redsl/              # Requirements DSL parser (KAOS-style, Lark)
│   ├── 🎭 templates/          # BNF grammars + legacy Scenic template
│   ├── 🚗 simulations/        # Scenic/VerifAI/CARLA executor, safety monitor, fitness
│   ├── 📊 mlops/              # MLflow integration
│   └── 🏗️ scenarios/          # scratch.temp - the Scenic scenario template the search runs
├── 📁 tests/                  # pytest suite (no CARLA needed)
├── 📁 artifacts/runs/         # Run outputs (see "Run every scenario" above)
├── 📁 infra/hpc/              # Apptainer image definition + Slurm job for Narval (see infra/hpc/README.md)
├── 📁 grammar/                # DSL grammar definitions
│   ├── 📁 example/            # Example grammars
│   └── 📁 kaos/               # KAOS methodology support
├── 📁 Scenic/                 # Scenic language submodule
├── 📁 VerifAI/                # Verification framework
└── 📁 infra/                  # Infrastructure configurations
```

## 🔬 Research Features

### Grammatical Evolution Engine
- **Population-based search** with configurable parameters
- **Multi-objective optimization** for test case quality
- **Grammar-guided evolution** ensuring syntactically valid outputs
- **Diversity preservation** mechanisms

### Domain-Specific Language (DSL)
- **Natural language processing** for requirement extraction
- **Formal grammar definitions** using BNF notation
- **Semantic validation** of requirement specifications
- **Template-based code generation**

### Simulation Integration
- **CARLA simulator** integration for realistic testing
- **Scenic language** support for probabilistic scenarios
- **Multi-process execution** with timeout handling
- **Fitness evaluation** based on simulation outcomes: the safety requirement is
  "the ego stays more than 5 m (centre to centre) from the **pedestrian**"; a
  scenario's fitness is the percentage of its simulations that satisfied it,
  and the search minimises it (i.e. looks for falsifying scenarios)

### Failure Analysis (REAL stages 6-7)
- **Per-simulation telemetry** (`scripts/analysis/telemetry.py`) recorded during the run
- **Admissibility** (valid vs spurious failures) from an editable rules file and the requirement's `assuming` clause
- **Failure model**: rates per setting/scenario, failure types, timing (first-detection distance vs stopping distance), sanity warnings
- **Obstacle model**: the paper's KAOS obstacles (`PedestrianSizeTooSmall`, `PedestrianClothingNotVisible`, `AdverseWeather`) plus behaviour-based ones (`DetectionTooLate`, `BrakingNotLatched`), a soft-goal one (`StandoffUnnecessaryStop`) and unnamed candidates, each with candidate mitigations at the data / model / system / requirement layers for a human to choose from
- **Round comparison** (`python -m scripts.analysis.compare <run_a> <run_b>`): checks that only the system under test differs between two runs, then compares failure rate over true encounters (no-encounter and stalled passes reported separately), failure-type shares, timing and obstacle verdicts
- **Requirement writer** (`python -m scripts.analysis.refine <run_dir>`): turns `decisions.json` into `R0.dsl` (as run), `R1.dsl` (proposed) and `requirement_diff.md`, with every change labelled **[S]** specification (`performed by` swap - flagged if the executor does not implement the module yet), **[R]** requirement (an `assuming` domain assumption or `ensuring` soft goal added) or **[D]** domain/test fix (not requirement text). R1 is parse-checked; nothing is applied. The next round is launched deliberately with `/run_grid?...&parent_run_id=<run>&round=3&requirement_source=<path to R1.dsl>`, which `run_meta.json` records - so a chain of rounds is traceable from files
- **Review page** (`streamlit run app.py`, page "review", or set `REAL_REVIEW_RUN_DIR`/`REAL_REVIEW_PREVIOUS_DIR`): the same review offline, in a browser - header with this round vs the previous one, one card per obstacle (evidence, status, timing, the video) with verdict/reason/mitigation, the scope items, and R0 / R1 side by side with an edit box; Accept writes the same `decisions.json` + `R0.dsl`/`R1.dsl`/`requirement_diff.md` as the CLI. Reads files only: no Redis, API or CARLA
- **Human review** (`python -m scripts.analysis.review <run_dir> --previous <prev_run_dir> --reviewer NAME`): a terminal walk-through, one obstacle at a time (condition, evidence, status vs the previous round - new / persisting / resolved / absent -, timing, a representative trace, the video), asking accept / rename / reject + reason and, for accepted obstacles, a mitigation from the catalogue (data / model / system / requirement / **scenario** - the last for defects of the test itself). Then the scope items (rules that set simulations aside; scenario-artefact candidates such as the 8 m crossing trigger): out of scope / in scope / scenario defect. Writes `decisions.json` into the run folder (schema in `scripts/analysis/decisions.py`). Nothing is applied automatically. `--answers FILE` replays prepared answers

## 🛠️ Configuration

### Environment Variables
All settings are optional - defaults reproduce the previous hardcoded behavior. See `.env.example` and `real_config.py` for the full list.
```bash
export REDIS_HOST="localhost"
export REDIS_PORT="6379"
export MLFLOW_TRACKING_URI="http://127.0.0.1:5000"
export API_HOST="127.0.0.1"
export API_PORT="7999"
export CARLA_HOST="127.0.0.1"
export CARLA_PORT="2000"
export CARLA_ROOT="/opt/carla"
export CARLA_MAP_PATH="/opt/carla/CarlaUE4/Content/Carla/Maps/OpenDrive/Town01.xodr"
export CARLA_MAP_NAME="Town01"
export RANDOM_SEED="42"   # GE search + per-scenario Scenic sampling (CARLA itself is not fully deterministic)
```

### Grammar Configuration
Customize DSL grammars in the `scripts/templates/` directory:
- `old/old.bnf` - Legacy grammar format
- Custom grammar files for domain-specific requirements

## 📊 Monitoring & MLOps

REAL integrates with MLflow for experiment tracking:

1. **Start MLflow server**
   ```bash
   mlflow ui --host 127.0.0.1 --port 5000
   ```

2. **View experiments** at `http://127.0.0.1:5000`

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
python -m pytest tests/

# Format code
black .
isort .
```



## 🔗 Related Projects

- **[Scenic](https://github.com/BerkeleyLearnVerify/Scenic)** - Probabilistic programming language for scenarios
- **[VerifAI](https://github.com/BerkeleyLearnVerify/VerifAI)** - Verification framework for AI systems
- **[CARLA](https://carla.org/)** - Autonomous driving simulator
- **[GRAPE](https://github.com/bdsul/grape)** - Grammatical Evolution library

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Berkeley LearnVerify team for Scenic and VerifAI
- CARLA development team
- GRAPE grammatical evolution library contributors

---

<div align="center">


Made with ❤️ for the Requirements Engineering research community

</div>
