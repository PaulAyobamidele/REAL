# REAL-DSL(5)

## NAME

real-dsl - requirement language of the REAL tool

## SYNOPSIS

```real-dsl
MAINTAIN "<goal>"
    by "<sub-goal>" using "<agent>"
        operationalized as "<task>" if "<condition>" performed by "<module>"
        taking input "<input>" & "<input>" producing output "<output>" & "<output>"
    followed by "<sub-goal>" using "<agent>"
        operationalized as "<task>" performed by "<module>"
        taking input "<input>" producing output "<output>"
    in scenario where "<scenario description>"
    assuming "<assumption>" & "<assumption>"
    ensuring "<soft goal>" & "<soft goal>"
```

`ACHIEVE` may replace `MAINTAIN`. Required: the temporal operator, the goal, `by`, at least one sub-goal with `using`, and `in scenario where`. Optional: `operationalized as` and what follows it, `if`, further sub-goals (`followed by` or `parallely`), `assuming`, `ensuring`. Each `&` list may hold one item or more.

## DESCRIPTION

A REAL-DSL file states one requirement for the system under test, here an automated car that must not hit a pedestrian. It names the goal, splits it into sub-goals, and says which module performs each task. It then describes the scenario to test, the conditions under which a failure counts (the assumptions), and the qualities the car must keep (the soft goals). The tool parses the file, generates simulator scenarios from it, runs the named modules, and reports each failure.

The language follows KAOS goal models. A requirement has three parts, used as in the entailment *D, S |= R*:

| Part | Clause | Meaning |
|---|---|---|
| System *S* | `performed by` | the modules the simulator runs |
| Domain assumptions *D* | `assuming` | the conditions under which the system is held to the goal |
| Soft goals | `ensuring` | qualities measured on every run, beyond safety |

A failure counts against the system only when the assumptions held during that run. Such a failure is *valid*. A failure in a run that broke an assumption is *spurious*. With no `assuming` clause, every failure counts against the system.

Assumptions are checked after the run, on the recorded settings and measurements. They are never imposed on the simulator.

## SYNTAX

### Grammar

The grammar is the Lark grammar of `scripts/redsl/grammar.py` (class `DSL`). The parser starts at rule `goal`.

```
goal         : temporal_op objective "by" refined_goal "in scenario where" scenario
               ("assuming" assumption ("&" assumption)*)?
               ("ensuring" soft_goal ("&" soft_goal)*)?
refined_goal : objective "using" agent ("operationalized as" operation)?
             | (refined_goal "followed by" refined_goal)*
             | (refined_goal "parallely" refined_goal)*
operation    : task ("if" condition)? "performed by" module
               "taking input" input ("&" input)* "producing output" output ("&" output)*
             | (operation "triggering" operation)*
temporal_op  : "ACHIEVE" | "MAINTAIN"
objective    : STRING | objective ("&" objective)*
condition    : STRING | condition ("&" condition)* | condition ("|" condition)*
task         : STRING | task ("&" task)*
agent, module, scenario, input, output, assumption, soft_goal : STRING
STRING       : a double-quoted string with backslash escapes (Lark ESCAPED_STRING)
```

Whitespace and line breaks are free. Every name is a double-quoted string. Keywords are case-sensitive and are never quoted.

### Goal

```real-dsl
ACHIEVE "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module"
        operationalized as "Detect Pedestrian" performed by "yolov5s"
        taking input "image" producing output "pedestrian detection flag"
    in scenario where "A child crossing the street at night."
```

A file holds exactly one goal. `MAINTAIN` or `ACHIEVE` comes first, then the goal name, then `by` and its refinement.

### Refinement

A refinement is one sub-goal, or sub-goals joined by `followed by` or `parallely`. Each sub-goal names its objective and, after `using`, the agent responsible for it. `operationalized as` is optional: a sub-goal may name only its agent.

```real-dsl
MAINTAIN "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module"
        operationalized as "Detect Pedestrian" performed by "yolov5m"
        taking input "image" producing output "pedestrian detection flag"
    parallely "Lane Keeping" using "Steering Module"
    in scenario where "An adult crossing from the left in rain."
```

Both combinators are dropped from the parse tree. `DSL.get_goal_tree` recovers them from the source text between two sub-goals and reports `followed by`, `parallely`, or `unknown`. A chain of the same combinator (A followed by B followed by C) becomes one flat list.

### Operation

An operation names a task, an optional condition, the module that performs it, its inputs and its outputs. `taking input` and `producing output` are both required; each takes one or more strings joined by `&`.

Two operations may be chained with `triggering`:

```real-dsl
MAINTAIN "Pedestrian Safety"
    by "braking" using "braking module"
        operationalized as
            "Detect Pedestrian" performed by "yolov5s"
            taking input "image" producing output "pedestrian detection flag"
        triggering
            "Apply Brakes" if "pedestrian detection flag=True" | "obstacle flag=True"
            performed by "emergency_braking"
            taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where "A pedestrian hidden behind a parked car."
```

### Scenario

`in scenario where` is required and takes one free-text string. The tool searches it for the words of the scenario vocabulary (see SCENARIO WORDS under ASSUMPTIONS) and steers scenario generation toward the matching settings.

## KEYWORDS

| Keyword | Where | Meaning |
|---|---|---|
| `MAINTAIN` | first word | the goal must hold at all times in the scenario (e.g. keep a safe distance) |
| `ACHIEVE` | first word | the goal must be reached at some point (e.g. come to a stop) |
| `by` | after the goal | introduces the refinement of the goal into sub-goals |
| `using` | after a sub-goal | names the agent responsible for the sub-goal |
| `operationalized as` | after the agent | introduces the operation that carries out the sub-goal |
| `if` | after a task | the condition under which the task is performed; free text |
| `performed by` | after the task | the module that performs the task; this is the system under test |
| `taking input` | after the module | the data the task reads |
| `producing output` | after the inputs | the data the task writes |
| `followed by` | between sub-goals | the second sub-goal comes after the first |
| `parallely` | between sub-goals | the two sub-goals hold at the same time |
| `triggering` | between operations | the first operation sets off the second |
| `in scenario where` | after the refinement | free-text description of the situations to test |
| `assuming` | after the scenario | domain assumptions; a failure counts only when they held |
| `ensuring` | after `assuming` | soft goals; qualities measured on every run |
| `&` | between strings | "and": joins objectives, tasks, conditions, inputs, outputs, assumptions, soft goals |
| `\|` | between conditions | "or": joins conditions after `if`; nowhere else |

The temporal operators `MAINTAIN` and `ACHIEVE` are recorded in the goal tree. The tool does not evaluate them differently; the safety verdict comes from the project's safety rule on each trace.

### Modules and tasks

The executor finds a module by the task it performs, by exact name:

| Role | Task name | Modules implemented | Default |
|---|---|---|---|
| perception | `"Detect Pedestrian"` | `few_shot`, `fine_tune`, `yolov5m`, `yolov5s` | `yolov5s` |
| braking | `"Apply Brakes"` or `"Brake"` | `emergency_braking`, `proportional_braking`, `path_aware_braking` | `emergency_braking` |

A task may be listed with others (`"Bring down throttle" & "Apply Brakes"`); the module still binds to it. A module on any other task is recorded but never run.

## ASSUMPTIONS

Each string after `assuming` is one assumption. An assumption is *measurable* when it has the form

```
<quantity> <op> <number>
```

where `<quantity>` is one word from the table below and `<op>` is one of `<=`, `>=`, `==`, `!=`, `<`, `>`. The tool classifies every assumption:

| Kind | Meaning |
|---|---|
| `scenario` | checked on the settings of each scenario |
| `run` | checked on the measurements of each run |
| `free_text` | not of the measurable form; shown to the reviewer, not checked |
| `rejected` | measurable form, but an unknown quantity or one about the car (`ego*`); flagged, never used |

### Checked quantities

| Quantity | Level | Unit | Source |
|---|---|---|---|
| `fog_density` | scenario | % | grid setting |
| `pedestrian` | scenario | - | grid setting |
| `dress` | scenario | - | grid setting |
| `direction` | scenario | - | grid setting |
| `distance` | scenario | - | grid setting |
| `approach_distance_m` | scenario | m | scene setting |
| `crossing_trigger_m` | scenario | m | scene setting |
| `pedestrian_min_speed_mps` | scenario | m/s | scene setting |
| `sun_altitude_angle` | scenario | deg | scene setting |
| `sun_azimuth_angle` | scenario | deg | scene setting |
| `cloudiness` | scenario | % | scene setting |
| `precipitation` | scenario | % | scene setting |
| `wetness` | scenario | % | scene setting |
| `occlusion` | scenario | - | scene setting |
| `initial_separation_m` | run | m | trace `distance_m[0]` |
| `pedestrian_speed_mps` | run | m/s | `simulations.csv` |
| `crossing_start_distance_m` | run | m | `simulations.csv` |

An assumption may only describe the world (pedestrian, weather, road, start positions), never the car: otherwise a failure could be defined away by narrowing the car's own behaviour. A quantity a run did not record is reported as *not measured*.

### Unchecked assumptions

Any other text is kept as `free_text`. It appears in the report for a human to judge, but never decides whether a failure is valid. `"daylight, dry road"` is free text; `"fog density <= 50"` (with a space) is free text too, because the quantity must be one word.

### Scenario words

The scenario text is lower-cased and searched for these words, as substrings. The first word found per setting wins.

| Setting | Words (value) |
|---|---|
| `pedestrian` | adult (Adult), child, kid (Child) |
| `dress` | light, bright (Light), dark (Dark) |
| `direction` | left (LR), right (RL) |
| `distance` | close, near, short (Short), far, long (Long) |
| `fog_density` | fog, foggy (50), clear (0) |
| `sun_altitude_angle` | night (-10), dusk, dawn (10), daytime, sunny (60) |
| `wetness` | wet, puddle (80), dry (0) |
| `precipitation` | rain, raining (60) |
| `occlusion` | parked, hidden, occluded, behind a car (1) |

## SOFT GOALS

Each string after `ensuring` is one soft goal. It uses the same measurable form as an assumption and is classified `checked`, `free_text` or `rejected`. A checked soft goal is *met*, *missed* or *not measured* on each run.

| Quantity | Meaning |
|---|---|
| `resume_within_s` | seconds from stopping to moving on again (0 = never stopped, inf = never moved on) |
| `peak_decel_mps2` | largest deceleration (m/s^2) |
| `peak_jerk_mps3` | largest change of acceleration (m/s^3) - smoothness |
| `min_ttc_s` | smallest time-to-collision while closing in (s) |

`ensuring` must come after `assuming` when both are present.

## MODULES

The strings after `performed by` name the system under test. For the two roles of the table under KEYWORDS:

- a perception module is valid when a weights file `<module>.pt` exists in the model directory (`model/`);
- a braking module is valid when it is a key of `BRAKING_BEHAVIOURS` in `scripts/simulations/util.py`. The older spellings `braking`, `brake` and `braking module` (any case) map to `emergency_braking`;
- names are matched exactly, case included;
- when no operation performs the role's task, the executor uses the default of the table;
- when a module is named but not implemented, the run is refused before it starts (see DIAGNOSTICS). It is never replaced by the default.

## COMMENTS

`#` starts a comment that runs to the end of the line. Comments may stand on their own line or after any token outside a string.

```real-dsl
# Agent only; no operation. Comments run to end of line.
MAINTAIN "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module"   # who is responsible
    in scenario where "A pedestrian crossing the street in fog."
```

## DIAGNOSTICS

A requirement that does not parse is refused everywhere: by the editor, by the API (`requirement does not parse: <message>`), and by Run Test. The message is Lark's, with the line and column of the first character it could not accept and the tokens it expected there. Lark names multi-word keywords internally (`__ANON_0`, `__ANON_1`, ...); read them as "one of the keywords that may follow here".

### Missing quote

```real-dsl
MAINTAIN "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module
        operationalized as "Detect Pedestrian" performed by "yolov5s"
        taking input "image" producing output "pedestrian detection flag"
    in scenario where "A pedestrian crossing the street in fog."
```

```
No terminal matches '"' in the current parser context, at line 2 col 33

    by "Pedestrian Check" using "Perception Module
                                ^
Expected one of:
	* STRING
```

The open string swallows the next line, so the error points at the opening quote. Single quotes give the same message: only double quotes delimit a string.

### Misspelled keyword

```real-dsl
MAINTAIN "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module"
        operationalised as "Detect Pedestrian" performed by "yolov5s"
        taking input "image" producing output "pedestrian detection flag"
    in scenario where "A pedestrian crossing the street in fog."
```

```
No terminal matches 'o' in the current parser context, at line 3 col 9

        operationalised as "Detect Pedestrian" p
        ^
Expected one of:
	* PARALLELY
	* __ANON_0
	* __ANON_1
	* __ANON_2
```

The same message appears for a lower-case `maintain` (`Expected one of: ACHIEVE, MAINTAIN`), and for `assuming` placed after `ensuring` (`Expected one of: AMPERSAND`). A file without `in scenario where` ends with `Unexpected end-of-input` and line -1.

### Unimplemented module

```real-dsl
MAINTAIN "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module"
        operationalized as "Detect Pedestrian" performed by "yolov8"
        taking input "image" producing output "pedestrian detection flag"
    followed by "braking" using "braking module"
        operationalized as "Apply Brakes" performed by "hard_braking"
        taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where "A pedestrian crossing the street in fog."
```

This parses. The check reports `"runs": false` for both roles, and the editor says `Detector yolov8 is not implemented by the executor`. Run Test's laptop check and the executor refuse the run:

```
unknown perception model 'yolov8': weights available for few_shot, fine_tune, yolov5m, yolov5s
unknown braking module 'hard_braking': the executor implements emergency_braking, path_aware_braking, proportional_braking
```

### Assumption the tool cannot check

```real-dsl
MAINTAIN "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module"
        operationalized as "Detect Pedestrian" performed by "yolov5s"
        taking input "image" producing output "pedestrian detection flag"
    in scenario where "A pedestrian crossing the street in fog."
    assuming "fog <= 50" & "ego_speed_mps <= 10" & "daylight"
    ensuring "jerk <= 5"
```

This parses. The check classifies each item:

| Item | Kind | Message |
|---|---|---|
| `fog <= 50` | rejected | `unknown quantity 'fog'. Known: fog_density, pedestrian, dress, ...` |
| `ego_speed_mps <= 10` | rejected | `'ego_speed_mps' is about the car under test. An assumption may only describe the world (pedestrian, weather, road, start positions); ...` |
| `daylight` | free_text | none; shown to the reviewer, not checked |
| `jerk <= 5` (soft goal) | rejected | `unknown quantity 'jerk'. Known: resume_within_s, peak_decel_mps2, peak_jerk_mps3, min_ttc_s.` |

A rejected item is flagged in the report and never used. With no assumption at all, the editor warns `No assumption stated: every failure will count as the car's.`

## EXAMPLES

The baseline requirement (`docs/examples/R_baseline.dsl`), without its header comment. Two sub-goals run in sequence: perception, then braking. Three assumptions are checked (one `scenario`, two `run`), two are free text. One soft goal is checked, one is free text.

```real-dsl
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
    assuming "fog_density <= 50" & "initial_separation_m >= 15" & "pedestrian_speed_mps <= 3" & "daylight, dry road" & "pedestrian on foot"
    ensuring "resume_within_s <= 10" & "braking is smooth unless an emergency stop is needed"
```

The scenario text sets `fog_density` to 50.

A requirement that tests a different car: a larger detector, path-aware braking, a dark-dressed child at dusk, and a time-to-collision soft goal.

```real-dsl
MAINTAIN "Pedestrian Safety"
    by "Pedestrian Check" using "Perception Module"
        operationalized as "Detect Pedestrian" performed by "yolov5m"
        taking input "image" producing output "pedestrian detection flag"
    followed by "braking" using "braking module"
        operationalized as "Apply Brakes" if "pedestrian detection flag=True" performed by "path_aware_braking"
        taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where "A child in dark clothes crossing at dusk."
    assuming "sun_altitude_angle >= 0" & "pedestrian_speed_mps <= 3"
    ensuring "min_ttc_s >= 1.5" & "peak_decel_mps2 <= 8"
```

The scenario text sets `pedestrian` to Child, `dress` to Dark and `sun_altitude_angle` to 10.

Two objectives joined by `&`:

```real-dsl
MAINTAIN "Pedestrian Safety" & "Passenger Comfort"
    by "braking" using "braking module"
        operationalized as "Apply Brakes" performed by "path_aware_braking"
        taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where "A pedestrian crossing the street in fog."
```

## SEE ALSO

`docs/examples/` - `R_baseline.dsl` (every clause, baseline assumptions and soft goals), `R0_rounds1_2.dsl` (no assumptions, no soft goals), `requirement_full_example.dsl` (short form of every clause).

`ui/README.md` - the review interface and its requirement editor.
