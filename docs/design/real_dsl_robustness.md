# REAL-DSL: limitations, and the work to make it robust

Status: open work list, 2026-10-19. These limitations were moved here from
the user manual (`docs/manual/real-dsl.md`). The manual describes the
language as it works today; this file lists where it falls short.

Sources:
- the manual's former LIMITATIONS section;
- what was observed while writing the manual. Every claim below was
  reproduced against the parser through `POST /authoring/check`, or read in
  the named code.

How the work is ordered:
- **P1**: the language says something it does not do. A user is misled, or a
  run is wasted.
- **P2**: it is unclear, or hard to use.
- **P3**: a feature to add.

Each item gives:
- *Now*: what happens today.
- *Why it matters*.
- *Fix*: the proposed change.
- *Test*: what would prove the fix works.

## P1: the language says one thing and does another

### 1. `|` in a condition is read as `&`
- **Now:** the grammar accepts `condition ("|" condition)*`. But `DSL._operation`
  joins every condition string with `" & "`, so `"a" | "b"` reaches the goal
  tree as `a & b` (`scripts/redsl/grammar.py`).
- **Why it matters:** the requirement silently means the opposite of what was
  written.
- **Fix:** keep the operator in the tree, either as `{op: "or", items: [...]}` or
  as the joined text with the operator the user wrote. Until conditions are
  evaluated, the check should warn that "conditions are recorded, not
  evaluated".
- **Test:** `"a" | "b"` round-trips as `a | b`. A mixed `&`/`|` condition is
  refused or made explicit.

### 2. A file holds one goal, though the grammar says many
- **Now:** the grammar has `start : (goal)+`, but the parser is built with
  `start="goal"`, so a second `MAINTAIN` or `ACHIEVE` is a parse error. The
  authoring catalog lists "several top-level goals in one file" under
  `not_covered`, as if only the form lacked it.
- **Fix:** decide which is right.
  - One goal per file: remove `(goal)+` from the grammar and say so in the
    error message ("one goal per file").
  - Several goals: start at `start` and carry them through the goal tree, the
    executor and the report.
- **Test:** two goals give either a clear error naming the rule, or two goal
  trees.

### 3. Empty refinements parse
- **Now:** the alternatives `(refined_goal "followed by" refined_goal)*` and
  `(operation "triggering" operation)*` can match nothing.
  `MAINTAIN "G" by in scenario where "fog"` parses, with an empty refinement.
- **Why it matters:** a requirement with no system in it passes the parser and
  only fails later, on the cluster.
- **Fix:** use `+` instead of `*`, or write the rules as
  `refined_goal ("followed by" refined_goal)*`.
- **Test:** `by in scenario where` is a parse error at `in`.

### 4. One sub-goal is reported as "no sub-goal with an operation"
- **Now:** with one sub-goal there is no combinator, so `get_goal_tree` returns
  that sub-goal itself, not a list. The authoring check then reports `covered`
  as "no sub-goal with an operation", even when the sub-goal has one. The
  review page crashed on this shape until 2026-10-19; it is fixed in the
  interface, but not at the source.
- **Fix:** always return `{combinator, goals: [...]}`, with a list of one when
  there is a single sub-goal.
- **Test:** a one-sub-goal requirement gives `goals` of length 1 and no false
  `covered` message.

### 5. The legacy module name "braking module" is reported as not run
- **Now:** the check reports `runs: false` for `"braking module"`, but the
  executor maps that name to `emergency_braking`
  (`util.braking_mode_from_module`).
- **Fix:** one function maps a name to the module that runs, and both the
  check and the executor use it. Its result is either the module that will
  run or a refusal; the check shows exactly that.
- **Test:** the check and the executor agree on every name in the catalog,
  and on every legacy name.

### 6. An unimplemented module makes the run fail
- **Now:** `util.resolve_yolo_model` and `util.braking_mode_from_module` raise
  an error for an unknown name. The default module is used only when no
  module is named. The editor now marks such a name as "a run with it would
  fail". The run panel's checks on the laptop also catch it, but only after
  Run is pressed.
- **Fix:** make an unimplemented module a parse-time error in the check
  response (`ok: false`, with its line and column), not a warning.
- **Test:** `performed by "yolov8"` is refused by the check, with its line.

## P2: unclear or hard to use

### 7. Mixing `followed by` and `parallely` is ambiguous
- **Now:** in `A followed by B parallely C`, the grammar does not fix the
  grouping. The combinator is read from the raw text between two sub-goals,
  so a comment containing "parallely" there could change the reading.
- **Fix:**
  - one combinator per refinement, refused otherwise;
  - or explicit grouping (brackets);
  - and read the combinator from the parse tree, not from the source text.
- **Test:** a mixed refinement gives a clear error. A comment containing a
  keyword changes nothing.

### 8. Scenario words match as substrings
- **Now:** "walking along the road" sets `distance` to Long, and "the
  crossing is clear" sets `fog_density` to 0.
- **Fix:** match whole words only, and list what was read from the scenario
  sentence in the check response. The editor already shows the check; it
  would show these too.
- **Test:** "walking along" sets nothing. "in fog" still sets fog.

### 9. `"fog density <= 50"` (with a space) is free text, not refused
- **Now:** a measurable assumption needs a one-word quantity from the
  catalog. A near miss, such as a space, a different case or a unit (`50 %`),
  is silently classed as free text and never checked.
- **Fix:** if a string has a comparison operator and a number, but no known
  quantity, refuse it with the nearest quantity names. The editor's
  completion already offers the exact names.
- **Test:** `"fog density <= 50"` is rejected with "did you mean
  fog_density?".

### 10. Parse errors show internal token names
- **Now:** Lark reports the multi-word keywords as `__ANON_0`, `__ANON_1` and
  so on. "Expected one of: BY, BY, BY…" repeats names.
- **Fix:** name the terminals in the grammar (for example
  `OPERATIONALIZED_AS: "operationalized as"`), deduplicate the expected list,
  and turn it into one sentence: "after the task, write `performed by` or
  `if`".
- **Test:** no `__ANON` in any error. Each error names the keyword expected.

### 11. MAINTAIN and ACHIEVE are treated alike
- **Now:** no code after the parser reads the temporal operator. The safety
  verdict comes from the safety rule on each trace.
- **Fix:** either give them different checks (MAINTAIN: the rule holds at
  every step; ACHIEVE: it holds at some step), or document that only
  MAINTAIN is supported and refuse ACHIEVE.
- **Test:** an ACHIEVE requirement is judged by its own rule, or refused.

### 12. A string cannot contain a double quote except as `\"`
- **Fix:** keep this rule, but report it clearly, and have the editor escape a
  pasted quote.

## P3: features

### 13. Most of the requirement does not change the simulation
- **Now:** the executor runs two roles, perception and braking, found by the
  exact task names `Detect Pedestrian`, `Apply Brakes` and `Brake`. Every
  other task, agent, input, output and condition is recorded in the goal tree
  but does not change the run.
- **Fix:** map roles explicitly rather than by task name, and say in the
  check which parts of the text drive the run and which are only recorded.
  The editor's colours could show this.

### 14. `followed by` and `parallely` do not change the simulation
- Same as item 13, for the combinators.

### 15. The guided form cannot hold everything the language can
- The form cannot hold:
  - several goals;
  - `parallely`;
  - `triggering`;
  - nested sub-goals;
  - `&` between objectives;
  - `|` in a condition.
- Such a requirement still parses and runs, and the REAL-DSL editor holds
  it. The form could grow, or the editor could become the only way to write.

### 16. Measurable form is narrow
- **Now:** only `<quantity> <op> <number>`.
- **Candidates:**
  - ranges (`10 <= x <= 50`);
  - units (`50 %`);
  - sets (`pedestrian in {adult, child}`);
  - conjunction inside one assumption.

## Suggested order

1. Items 3 and 1 (small grammar changes, each with a test).
2. Items 5 and 6 (one module resolver, shared by the check and the executor).
3. Items 4 and 10 (the shape of the goal tree, and readable errors).
4. Items 2, 7 and 9, which need a decision from the owner first.
5. Items 8 and 11–16 as features.

All fixes in `scripts/redsl/` and `scripts/simulations/util.py` touch code
that runs on the cluster. Add a contract test in the interface
(`ui/tests/contract/`) for each change in the check response.
