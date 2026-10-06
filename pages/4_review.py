"""Review page - the human step of the REAL loop, offline, one screen at a time.

Five screens, walked through with Next/Back (or the step picker in the sidebar):

    1. What we asked          R0 in full, the system it selected, the scenario space
    2. What happened          raw outcome, this round beside the previous one, one video
    3. What pattern           one obstacle card at a time, in support order
    4. What you decide        verdict + reason per obstacle; then the scope items, then the assumptions (D)
    5. What the requirement becomes   R0 / R1 side by side, [S]/[R]/[D] labels, Accept

Reads a run folder from disk (analysis via scripts/analysis/report; no Redis,
no API, no CARLA). If the folder already holds a decisions.json written by
the tool (reviewer marked "proposed"), its verdicts are pre-loaded and shown
as "proposed by the tool - to be confirmed". Accept writes decisions.json,
R0.dsl, R1.dsl and requirement_diff.md into the run folder. Nothing is
launched from here. Same artefact as the terminal walk-through
(scripts/analysis/review.py) - the loop does not care which produced it.

    streamlit run pages/4_review.py
Set REAL_REVIEW_RUN_DIR / REAL_REVIEW_PREVIOUS_DIR to pre-fill the folders.
"""

import glob
import json
import os

import streamlit as st

from real_config import settings
from scripts.analysis import decisions, obstacles, refine, report
from scripts.evolve.grid import grammar_terminals
from scripts.redsl.grammar import DSL

st.set_page_config(layout="wide", page_title="REAL - review")

RUNS_DIR = os.path.join(settings.artifacts_dir, "runs")
STEPS = ["1. What we asked", "2. What happened", "3. What pattern",
         "4. What you decide", "5. What the requirement becomes"]
LABELS = {"S": "[S] changed the car", "R": "[R] changed the promise", "D": "[D] changed the assumptions",
          "T": "[T] fix the test / scope rules"}
STATUS_TEXT = {"new": "new this round", "persisting": "persisting - was present in the previous round too",
               "resolved": "no longer supported this round", "absent": "not supported in either round"}
VERDICTS = ["accept", "rename", "reject", "defer"]
SCOPE_VERDICTS = ["out_of_scope", "in_scope", "scenario_defect"]
ASSUMPTION_VERDICTS = list(decisions.ASSUMPTION_VERDICTS)


def _pct(x):
    try:
        return f"{x:.0%}"
    except (TypeError, ValueError):
        return "n/a"


def _runs():
    return sorted((d for d in glob.glob(os.path.join(RUNS_DIR, "*")) if os.path.isdir(d)),
                  key=os.path.getmtime, reverse=True)


@st.cache_data(show_spinner=False)
def _analyse(run_dir):
    return report.analyse(run_dir)


def _load_or_new(run_dir, analysis, previous, reviewer, round_no):
    """Pre-load a decisions.json if the folder has one (the tool's proposal or an
    earlier human pass); otherwise start blank."""
    path = os.path.join(run_dir, decisions.FILENAME)
    if os.path.exists(path):
        try:
            doc = decisions.load(run_dir)
            fresh = decisions.from_analysis(analysis, previous, reviewer=reviewer, round_no=round_no,
                                            artefacts=obstacles.SCENARIO_ARTEFACTS)
            # keep the saved verdicts, refresh the tool-computed fields
            for oid, entry in fresh["obstacles"].items():
                saved = doc.get("obstacles", {}).get(oid, {})
                for k in ("verdict", "renamed_to", "reason", "mitigation"):
                    entry[k] = saved.get(k)
            for sid, entry in fresh["scope"].items():
                saved = doc.get("scope", {}).get(sid, {})
                entry["verdict"], entry["reason"] = saved.get("verdict"), saved.get("reason")
            for text, entry in fresh["assumptions"].items():
                saved = doc.get("assumptions", {}).get(text, {})
                for k in ("verdict", "new_text", "reason"):
                    entry[k] = saved.get(k)
            fresh["added_assumptions"] = doc.get("added_assumptions") or []
            fresh["reviewer"] = doc.get("reviewer")
            fresh["proposed_by_tool"] = bool(doc.get("proposed_by_tool")) or "proposed" in (doc.get("reviewer") or "").lower()
            return fresh
        except ValueError:
            pass
    doc = decisions.from_analysis(analysis, previous, reviewer=reviewer, round_no=round_no,
                                  artefacts=obstacles.SCENARIO_ARTEFACTS)
    doc["proposed_by_tool"] = False
    return doc


# ---------------------------------------------------------------- sidebar
st.sidebar.header("Run under review")
runs = _runs()
default_run = os.environ.get("REAL_REVIEW_RUN_DIR") or (runs[0] if runs else "")
default_prev = os.environ.get("REAL_REVIEW_PREVIOUS_DIR") or (runs[1] if len(runs) > 1 else "")
run_dir = st.sidebar.text_input("Run folder", value=default_run)
prev_dir = st.sidebar.text_input("Previous round folder (optional)", value=default_prev)
reviewer = st.sidebar.text_input("Reviewer (your name)", value="")
round_no = st.sidebar.number_input("Round number", min_value=1, value=2, step=1)

if not run_dir or not os.path.isdir(run_dir):
    st.warning("Pick a run folder in the sidebar (artifacts/runs/<run_id>).")
    st.stop()

analysis = _analyse(run_dir)
previous = _analyse(prev_dir) if prev_dir and os.path.isdir(prev_dir) else None
fm = analysis["failure_model"]
pf = previous["failure_model"] if previous else {}
meta = analysis.get("run_meta") or {}
r0 = meta.get("requirement") or ""
video = os.path.join(run_dir, "best_scenario.mp4")

key = f"decisions:{analysis['run_id']}"
if key not in st.session_state:
    st.session_state[key] = _load_or_new(run_dir, analysis, previous, reviewer or None, int(round_no))
doc = st.session_state[key]
doc["round"] = int(round_no)
proposal = doc.get("proposed_by_tool", False)

# The step picker is the single source of truth for which screen is shown.
# Back/Next change it from button callbacks (callbacks run before the script
# re-executes, which is the only time Streamlit allows a widget's own
# session_state key to be assigned).
if "step_picker" not in st.session_state:
    st.session_state["step_picker"] = STEPS[0]
if "obs_i" not in st.session_state:
    st.session_state["obs_i"] = 0


def _go(delta):
    i = STEPS.index(st.session_state["step_picker"]) + delta
    st.session_state["step_picker"] = STEPS[max(0, min(i, len(STEPS) - 1))]


st.sidebar.divider()
picked = st.sidebar.radio("Step", STEPS, key="step_picker")
step = STEPS.index(picked)

order = {"supported": 0, "insufficient_data": 1, "not_supported": 2}
obs_sorted = sorted(analysis["obstacles"], key=lambda o: (order.get(o["verdict"], 9), o["id"]))
prev_obs = {o["id"]: o for o in (previous or {}).get("obstacles", [])}

st.title(STEPS[step])

# ---------------------------------------------------------------- 1. what we asked
if step == 0:
    st.caption("The requirement this round was run with (R0). No decisions on this screen.")
    st.code(r0.strip() or "(no requirement text in run_meta.json)", language="text")
    dsl = DSL(r0) if r0.strip() else None
    sut = meta.get("system_under_test") or {}
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("**The system it selected** (from `performed by`)")
        st.markdown(f"- Detector: `{(dsl.get_perception_model() if dsl else None) or sut.get('yolo_model') or 'n/a'}`")
        st.markdown(f"- Braking: `{sut.get('braking_mode') or (dsl.get_module_for('Apply Brakes') if dsl else None) or 'n/a'}`")
        assumptions = dsl.get_assumptions() if dsl else []
        soft = dsl.get_soft_goals() if dsl else []
        st.markdown("**Assumptions (`assuming`)**: " + ("; ".join(f'"{a}"' for a in assumptions) if assumptions else "none stated"))
        st.markdown("**Soft goals (`ensuring`)**: " + ("; ".join(f'"{s}"' for s in soft) if soft else "none stated"))
    with c2:
        st.markdown("**The scenario space explored**")
        try:
            bnf = os.path.join(settings.grammar_base_dir, meta.get("grammar_file") or "old/old.bnf")
            _, cats = grammar_terminals(bnf)
            for name, values in cats.items():
                st.markdown(f"- {name}: {' / '.join(values)}")
            n = 1
            for v in cats.values():
                n *= len(v)
            st.markdown(f"- {n} scenarios x {meta.get('trials_per_scenario', '?')} simulations each = "
                        f"{fm['n_simulations']} simulations")
        except Exception:
            st.markdown(f"- {fm['n_scenarios']} scenarios, {fm['n_simulations']} simulations")
        st.markdown(f"- Safety rule scored: the car stays more than 5 m from the pedestrian")

# ---------------------------------------------------------------- 2. what happened
elif step == 1:
    st.caption("Raw outcome only. Form your own impression before the tool names anything.")

    def row(label, a, b=None):
        return {"": label, "this round": str(a), **({"previous round": str(b)} if previous else {})}

    st.table([
        row("simulations", fm["n_simulations"], pf.get("n_simulations")),
        row("true encounters (car and pedestrian actually met)", fm["n_encounters"], pf.get("n_encounters")),
        row("failures (came within 5 m)", f"{fm['failures']}  ({_pct(fm['failure_rate'])} of encounters)",
            f"{pf.get('failures')}  ({_pct(pf.get('failure_rate'))})" if previous else None),
        row("passes where the car stopped and never moved again", fm.get("passed_stalled", 0), pf.get("passed_stalled")),
        row("passes where the car drove on", fm.get("passed_clean", 0), pf.get("passed_clean")),
        row("no-encounter (never met; not counted)", fm["n_no_encounter"], pf.get("n_no_encounter")),
    ])
    if os.path.exists(video):
        st.video(video)
        st.caption("One representative simulation: the run's most-falsifying scenario.")

# ---------------------------------------------------------------- 3. what pattern
elif step == 2:
    n = len(obs_sorted)
    i = max(0, min(st.session_state["obs_i"], n - 1))
    o = obs_sorted[i]
    entry = doc["obstacles"][o["id"]]
    st.caption(f"Obstacle {i + 1} of {n}, in order of support. Names are the tool's; you decide on the next screen.")
    with st.container(border=True):
        left, right = st.columns([3, 2])
        with left:
            st.subheader(o["id"])
            if o.get("outcome"):
                st.markdown(f"**Stands for:** passes of type `{o['outcome']}` - blocks the soft goal **{o['blocks_goal']}**")
            elif o.get("failure_type"):
                st.markdown(f"**Stands for:** failures of type `{o['failure_type']}` - blocks the goal **{o['blocks_goal']}**")
            else:
                st.markdown(f"**Stands for:** `{o['param']} = {o['value']}` - blocks the goal **{o['blocks_goal']}**")
            st.write(o["description"])
            st.markdown(f"**Support this round:** {entry['evidence']}  ->  tool verdict "
                        f"*{obstacles.verdict_label(o['verdict'], analysis.get('sampling'))}*")
            p = prev_obs.get(o["id"])
            if previous:
                prev_ev = decisions._evidence_text(p) if p else "not assessed"
                st.markdown(f"**Previous round:** {prev_ev}  ->  *{p['verdict'] if p else '-'}*")
            st.markdown(f"**Change since the previous round:** {STATUS_TEXT[entry['status']]}")
        with right:
            if os.path.exists(video) and o["verdict"] == "supported":
                st.video(video)
                st.caption("Representative video (the run's worst scenario).")
            else:
                st.caption("No representative video for this obstacle.")
    b1, b2, _ = st.columns([1, 1, 6])
    if b1.button("Previous obstacle", disabled=i == 0):
        st.session_state["obs_i"] = i - 1
        st.rerun()
    if b2.button("Next obstacle", disabled=i >= n - 1):
        st.session_state["obs_i"] = i + 1
        st.rerun()

# ---------------------------------------------------------------- 4. what you decide
elif step == 3:
    if proposal:
        st.warning("Verdicts below were **proposed by the tool - to be confirmed**. Change any you disagree with; "
                   "put the reason in your own words.")
    else:
        st.caption("Your verdicts. Accepted obstacles need a mitigation from the catalogue.")
    for o in obs_sorted:
        entry = doc["obstacles"][o["id"]]
        with st.container(border=True):
            st.markdown(f"**{o['id']}** - {entry['evidence']}; {STATUS_TEXT[entry['status']]}")
            v = st.radio("Verdict", VERDICTS, horizontal=True,
                         index=VERDICTS.index(entry["verdict"]) if entry["verdict"] in VERDICTS else None,
                         key=f"v:{o['id']}",
                         captions=["real obstacle - act on it", "real, but the name is wrong",
                                   "noise / not an obstacle", "not enough evidence this round"])
            entry["verdict"] = v
            if v == "rename":
                entry["renamed_to"] = st.text_input("New name", value=entry.get("renamed_to") or "",
                                                    key=f"n:{o['id']}") or None
            entry["reason"] = st.text_input("Reason, in your own words", value=entry.get("reason") or "",
                                            key=f"r:{o['id']}") or None
            if v in ("accept", "rename") and entry["options"]:
                labels = ["(none yet)"] + [f"[{x['layer']}] {x['action']}" for x in entry["options"]]
                current = 0
                if entry.get("mitigation"):
                    for j, x in enumerate(entry["options"], 1):
                        if x["layer"] == entry["mitigation"]["layer"]:
                            current = j
                pick = st.selectbox("Mitigation (from the catalogue)", labels, index=current, key=f"m:{o['id']}")
                entry["mitigation"] = None if pick == labels[0] else dict(entry["options"][labels.index(pick) - 1])
            else:
                entry["mitigation"] = None

    st.subheader("Scope: set-aside rules and scenario artefacts")
    if not doc["scope"]:
        st.caption("Nothing was set aside and no artefact candidates.")
    for sid, s in doc["scope"].items():
        with st.container(border=True):
            st.markdown(f"**{sid}** ({s['kind']}) - {s['evidence']}")
            if s.get("description"):
                st.write(s["description"])
                st.caption(f"Suggested fix: {s['suggested_fix']}")
            s["verdict"] = st.radio("Scope verdict", SCOPE_VERDICTS, horizontal=True,
                                    index=SCOPE_VERDICTS.index(s["verdict"]) if s.get("verdict") in SCOPE_VERDICTS else None,
                                    key=f"sv:{sid}",
                                    captions=["genuinely out of scope - state it in the requirement",
                                              "actually realistic - drop the rule",
                                              "defect in the test scenario - fix it, re-measure"])
            s["reason"] = st.text_input("Reason", value=s.get("reason") or "", key=f"sr:{sid}") or None

    st.subheader("Domain assumptions (D) - what the requirement assumes about the world")
    if not doc["assumptions"]:
        st.caption("The requirement states no domain assumptions - every failure counted as the car's.")
    for text, a in doc["assumptions"].items():
        with st.container(border=True):
            st.markdown(f"**`{text}`** ({a['kind']}) - {a['evidence']}"
                        + (f"; tool: **{a['tool_verdict']}**" if a.get("tool_verdict") else ""))
            a["verdict"] = st.radio("Assumption verdict", ASSUMPTION_VERDICTS, horizontal=True,
                                    index=ASSUMPTION_VERDICTS.index(a["verdict"]) if a.get("verdict") in ASSUMPTION_VERDICTS else None,
                                    key=f"av:{text}",
                                    captions=["stays as written", "narrower - give the new text",
                                              "wider - give the new text", "remove it"])
            if a["verdict"] in ("tighten", "loosen"):
                a["new_text"] = st.text_input("New text", value=a.get("new_text") or "", key=f"an:{text}") or None
                if a["verdict"] == "loosen" and a.get("tool_verdict") == "untested":
                    st.warning("Never broken in this run - loosening it has no evidence behind it.")
            else:
                a["new_text"] = None
            a["reason"] = st.text_input("Reason", value=a.get("reason") or "", key=f"ar:{text}") or None
    added = st.text_area("Add assumptions (one per line; about the world, never the car)",
                         value="\n".join(x["text"] for x in doc.get("added_assumptions") or []),
                         key=f"aa:{analysis['run_id']}")
    doc["added_assumptions"] = [{"text": line.strip(), "reason": None}
                                for line in added.splitlines() if line.strip()]

# ---------------------------------------------------------------- 5. what the requirement becomes
elif step == 4:
    problems = decisions.validate(doc)
    if problems:
        st.error("; ".join(problems))
    changes = refine.plan_changes(doc, r0)
    try:
        r1_auto = refine.apply_changes(r0, changes) if r0.strip() else ""
    except ValueError as e:
        r1_auto = ""
        st.error(f"Could not derive R1: {e}")

    st.markdown(" &nbsp;|&nbsp; ".join(f"**{LABELS[k]}**" for k in ("S", "R", "D", "T")))
    if changes:
        for ch in changes:
            note = " - **the executor does not implement this module yet**" \
                if ch["kind"] == "S" and not ch.get("available", True) else ""
            if ch.get("no_evidence"):
                note = " - **loosened although never broken: no evidence behind it**"
            st.markdown(f"- {LABELS[ch['kind']]} - from `{ch['from']}`: {ch['text']}{note}")
    else:
        st.caption("The decisions so far imply no change to the requirement.")

    a, b = st.columns(2)
    with a:
        st.caption("R0 - what we asked")
        st.code(r0.strip(), language="text")
    with b:
        st.caption("R1 - what it becomes (edit below before accepting)")
        st.code(r1_auto.strip(), language="text")
    r1_text = st.text_area("Edit R1", value=r1_auto, height=240, key=f"r1:{analysis['run_id']}")

    complete = decisions.is_complete(doc)
    if not complete:
        st.info("Every obstacle, scope item and assumption needs a verdict (accepted, supported obstacles need a mitigation) before Accept.")
    if not reviewer.strip():
        st.info("Enter your name as reviewer in the sidebar - the decision file records who decided.")
    if st.button("Accept: write decisions.json, R0.dsl, R1.dsl, requirement_diff.md", type="primary",
                 disabled=bool(problems) or not complete or not r0.strip() or not reviewer.strip()):
        try:
            doc["reviewer"] = reviewer.strip()
            doc["proposed_by_tool"] = False
            out = refine.refine(run_dir, doc=doc, r0=r0, r1_override=r1_text)
            st.session_state[key] = {**out["decisions"], "proposed_by_tool": False}
            st.success("Written: " + ", ".join(os.path.basename(p) for p in out["paths"].values()))
            st.caption("Nothing has been launched. The next round is started deliberately with "
                       f"parent_run_id={analysis['run_id']} and requirement_source={out['paths'].get(refine.R1_FILENAME)}")
        except ValueError as e:
            st.error(str(e))

# ---------------------------------------------------------------- navigation
st.divider()
nb, _, nn = st.columns([1, 6, 1])
nb.button("Back", disabled=step == 0, on_click=_go, args=(-1,))
nn.button("Next", disabled=step >= len(STEPS) - 1, type="primary", on_click=_go, args=(1,))
