"""Review page - the human step of the REAL loop, offline.

Reads a run folder from disk (analysis via scripts/analysis/report, no Redis,
no API, no CARLA), shows the obstacles with their evidence and the video,
collects verdicts, shows the proposed next requirement (R1) next to the one
that was run (R0), and on Accept writes decisions.json, R0.dsl, R1.dsl and
requirement_diff.md into the run folder. Nothing is launched from here.

Same artefact as the terminal walk-through (scripts/analysis/review.py) - the
loop does not care which one produced it. Run:

    streamlit run app.py      (then pick "review" in the sidebar)
Set REAL_REVIEW_RUN_DIR / REAL_REVIEW_PREVIOUS_DIR to pre-fill the folders.
"""

import glob
import json
import os

import streamlit as st

from real_config import settings
from scripts.analysis import decisions, failure_model, obstacles, refine, report

st.set_page_config(layout="wide", page_title="REAL - review")

RUNS_DIR = os.path.join(settings.artifacts_dir, "runs")


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


# ---------------------------------------------------------------- sidebar: which run
st.sidebar.header("Run under review")
runs = _runs()
default_run = os.environ.get("REAL_REVIEW_RUN_DIR") or (runs[0] if runs else "")
default_prev = os.environ.get("REAL_REVIEW_PREVIOUS_DIR") or (runs[1] if len(runs) > 1 else "")
run_dir = st.sidebar.text_input("Run folder", value=default_run)
prev_dir = st.sidebar.text_input("Previous round folder (optional)", value=default_prev)
reviewer = st.sidebar.text_input("Reviewer", value=os.environ.get("USER", ""))
round_no = st.sidebar.number_input("Round number", min_value=1, value=2, step=1)

if not run_dir or not os.path.isdir(run_dir):
    st.warning("Pick a run folder in the sidebar (artifacts/runs/<run_id>).")
    st.stop()

analysis = _analyse(run_dir)
previous = _analyse(prev_dir) if prev_dir and os.path.isdir(prev_dir) else None
fm = analysis["failure_model"]
meta = analysis.get("run_meta") or {}
r0 = meta.get("requirement") or ""

# keep one decisions doc per run in session state
key = f"decisions:{analysis['run_id']}"
if key not in st.session_state:
    st.session_state[key] = decisions.from_analysis(analysis, previous, reviewer=reviewer or None,
                                                    round_no=int(round_no),
                                                    artefacts=obstacles.SCENARIO_ARTEFACTS)
doc = st.session_state[key]
doc["reviewer"] = reviewer or None
doc["round"] = int(round_no)

# ---------------------------------------------------------------- 1. header
st.title("Review - what the run found, what you decide")
c1, c2 = st.columns([3, 2])
with c1:
    st.caption("Requirement as run (R0)")
    st.code(r0.strip() or "(no requirement text in run_meta.json)", language="text")
with c2:
    st.caption("System under test")
    st.json(meta.get("system_under_test") or {"note": "not recorded (pre-2026-09-23 run)"})


def _row(label, a, b=None):
    # all strings: st.table converts to Arrow and dislikes mixed int/str columns
    return {"": label, "this round": str(a), **({"previous round": str(b)} if previous else {})}


pf = previous["failure_model"] if previous else {}
st.table([
    _row("true encounters", fm["n_encounters"], pf.get("n_encounters")),
    _row("failures", f"{fm['failures']} ({_pct(fm['failure_rate'])})",
         f"{pf.get('failures')} ({_pct(pf.get('failure_rate'))})" if previous else None),
    _row("no-encounter (car never met the pedestrian; excluded)", fm["n_no_encounter"], pf.get("n_no_encounter")),
    _row("passes that stalled (standoff)", fm.get("passed_stalled", 0), pf.get("passed_stalled")),
    _row("passes that drove on", fm.get("passed_clean", 0), pf.get("passed_clean")),
])

video = os.path.join(run_dir, "best_scenario.mp4")

# ---------------------------------------------------------------- 2. obstacles
st.header("2. Obstacles")
order = {"supported": 0, "insufficient_data": 1, "not_supported": 2}
obs = sorted(analysis["obstacles"], key=lambda o: (order.get(o["verdict"], 9), o["id"]))
status_badge = {"new": "🆕 new", "persisting": "⚠️ persisting", "resolved": "✅ resolved", "absent": "– absent"}

for o in obs:
    entry = doc["obstacles"][o["id"]]
    with st.container(border=True):
        left, right = st.columns([3, 2])
        with left:
            st.subheader(o["id"])
            st.markdown(f"**Tool verdict:** {o['verdict']} &nbsp;&nbsp; **vs previous round:** {status_badge[entry['status']]}")
            if o.get("outcome"):
                st.markdown(f"**Condition:** passes of type `{o['outcome']}` - blocks soft goal **{o['blocks_goal']}**")
            elif o.get("failure_type"):
                st.markdown(f"**Condition:** failures of type `{o['failure_type']}` - blocks goal **{o['blocks_goal']}**")
            else:
                st.markdown(f"**Condition:** `{o['param']} = {o['value']}` - blocks goal **{o['blocks_goal']}**")
            st.markdown(f"**Evidence:** {entry['evidence']}")
            st.write(o["description"])
            t = fm.get("timing") or {}
            if t:
                st.caption(f"Timing (medians): first seen {t['first_detection_distance_m_median']:.1f} m at "
                           f"{t['speed_at_first_brake_mps_median']:.1f} m/s; stopping needs "
                           f"{t['stopping_distance_needed_m_median']:.1f} m; {_pct(t['share_detected_too_late'])} of detections too late; "
                           f"still moving at the closest point in {_pct(t['share_still_moving_at_closest'])}")
        with right:
            if os.path.exists(video) and o["verdict"] == "supported":
                st.video(video)
                st.caption("Video: the run's worst scenario")
        v = st.radio("Verdict", ["accept", "rename", "reject", "defer"], horizontal=True,
                     index=["accept", "rename", "reject", "defer"].index(entry["verdict"]) if entry["verdict"] else None,
                     key=f"v:{o['id']}")
        entry["verdict"] = v
        if v == "rename":
            entry["renamed_to"] = st.text_input("New name", value=entry.get("renamed_to") or "", key=f"n:{o['id']}") or None
        entry["reason"] = st.text_input("Reason", value=entry.get("reason") or "", key=f"r:{o['id']}") or None
        if v in ("accept", "rename") and entry["options"]:
            labels = ["(none yet)"] + [f"[{x['layer']}] {x['action']}" for x in entry["options"]]
            current = 0
            if entry.get("mitigation"):
                for i, x in enumerate(entry["options"], 1):
                    if x["layer"] == entry["mitigation"]["layer"]:
                        current = i
            pick = st.selectbox("Mitigation", labels, index=current, key=f"m:{o['id']}")
            entry["mitigation"] = (None if pick == labels[0]
                                   else dict(entry["options"][labels.index(pick) - 1]))
        else:
            entry["mitigation"] = None

# ---------------------------------------------------------------- 3. scope / artefacts
st.header("3. Out of scope / scenario artefacts")
if not doc["scope"]:
    st.caption("No rules set simulations aside and no artefact candidates.")
for sid, s in doc["scope"].items():
    with st.container(border=True):
        st.markdown(f"**{sid}** ({s['kind']}) - {s['evidence']}")
        if s.get("description"):
            st.write(s["description"])
            st.caption(f"Suggested fix: {s['suggested_fix']}")
        opts = ["out_of_scope", "in_scope", "scenario_defect"]
        s["verdict"] = st.radio("Verdict", opts, horizontal=True,
                                index=opts.index(s["verdict"]) if s.get("verdict") in opts else None,
                                key=f"sv:{sid}",
                                captions=["genuinely out of scope - state it in the requirement",
                                          "actually realistic - drop the rule",
                                          "the test itself is wrong - fix the template, re-measure"])
        s["reason"] = st.text_input("Reason", value=s.get("reason") or "", key=f"sr:{sid}") or None

# ---------------------------------------------------------------- 4. proposed requirement
st.header("4. Proposed requirement (R1)")
problems = decisions.validate(doc)
if problems:
    st.error("; ".join(problems))
changes = refine.plan_changes(doc)
try:
    r1_auto = refine.apply_changes(r0, changes) if r0.strip() else ""
except ValueError as e:
    r1_auto = ""
    st.error(f"Could not derive R1: {e}")

if changes:
    for ch in changes:
        note = " - **executor does not implement this module yet**" if ch["kind"] == "S" and not ch.get("available", True) else ""
        st.markdown(f"- **[{ch['kind']}]** from `{ch['from']}` ({ch['layer']}): {ch['text']}{note}")
    st.caption("[S] specification (performed by) - [R] requirement (assuming / ensuring) - [D] domain/test fix, not requirement text")
else:
    st.caption("The decisions so far imply no change to the requirement.")

a, b = st.columns(2)
with a:
    st.caption("R0 - as run")
    st.code(r0.strip(), language="text")
with b:
    st.caption("R1 - proposed (edit below before accepting)")
    st.code(r1_auto.strip(), language="text")
r1_text = st.text_area("Edit R1", value=r1_auto, height=260, key=f"r1:{analysis['run_id']}")

complete = decisions.is_complete(doc)
if not complete:
    st.info("Give every obstacle and scope item a verdict (accepted, supported obstacles need a mitigation) to enable Accept.")
if st.button("Accept: write decisions.json, R0.dsl, R1.dsl, requirement_diff.md", type="primary",
             disabled=bool(problems) or not complete or not r0.strip()):
    try:
        out = refine.refine(run_dir, doc=doc, r0=r0, r1_override=r1_text)
        st.success("Written: " + ", ".join(os.path.basename(p) for p in out["paths"].values()))
        st.caption("Nothing has been launched. Start the next round deliberately with parent_run_id="
                   f"{analysis['run_id']} and requirement_source={out['paths'].get(refine.R1_FILENAME)}")
    except ValueError as e:
        st.error(str(e))
