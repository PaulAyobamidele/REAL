"""Draw Fig. 1 (fig:arch): REAL's workflow, as specified in
architecture_diagram.md and corrected per fig1_review_and_fixes.md.

    python docs/paper/latex/figures/make_fig1_architecture.py

Writes fig1_architecture.pdf (vector, TrueType fonts embedded, no Type 3)
and fig1_architecture.png (preview) next to this file. Every text is
measured; the script stops if any line overflows its box.
"""
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle

matplotlib.rcParams.update({
    "pdf.fonttype": 42, "ps.fonttype": 42,          # TrueType, never Type 3
    "font.family": "STIXGeneral", "mathtext.fontset": "stix",
})

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 7.0, 2.5                                   # inches (IEEE text width 7.16)

INK = "#1D1D1F"
LOOP = "#C0392B"
ENGINEER_BG, TOOL_BG, CLUSTER_BG = "#FBEBD0", "#F2F7FC", "#EFEFEF"
STEP_FILL, JOB_FILL, WHITE = "#DCEBF7", "#E2E2E2", "#FFFFFF"
MONO = "DejaVu Sans Mono"

TITLE, BODY, LABEL, LANE = 7.5, 6.5, 6.5, 6.0       # points
LINE = BODY * 1.18 / 72                           # inches per body line

fig = plt.figure(figsize=(W, H))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis("off")
renderer = fig.canvas.get_renderer()
OVERFLOWS = []


def width_in(artist):
    return artist.get_window_extent(renderer).width / fig.dpi


def text(x, y, s, size=BODY, fit=None, **kw):
    """Place text; record an overflow if it is wider than `fit` inches."""
    t = ax.text(x, y, s, fontsize=size, color=kw.pop("color", INK), **kw)
    if fit is not None and width_in(t) > fit:
        OVERFLOWS.append(f"{s!r}: {width_in(t):.2f} in > {fit:.2f} in")
    return t


def rich(x, y, parts, size=BODY, fit=None):
    """One line made of (text, family) parts: monospace keywords inside prose."""
    x0 = x
    for s, family in parts:
        t = ax.text(x, y, s, fontsize=size, family=family, color=INK, va="baseline")
        x += width_in(t)
    if fit is not None and x - x0 > fit:
        OVERFLOWS.append(f"{''.join(p for p, _ in parts)!r}: {x - x0:.2f} in > {fit:.2f} in")


def box(x, y, w, h, fill, rounded=True, lw=0.6, ls="-", z=2):
    style = "round,pad=0,rounding_size=0.05" if rounded else "square,pad=0"
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=style, fc=fill, ec=INK, lw=lw, ls=ls, zorder=z))


def arrow(points, color=INK, lw=0.8, ls="-", head=True):
    xs, ys = zip(*points)
    ax.plot(xs[:-1] + (xs[-1],), ys[:-1] + (ys[-1],), color=color, lw=lw, ls=ls,
            solid_capstyle="butt", zorder=4)
    if head:
        ax.annotate("", xy=points[-1], xytext=points[-2], zorder=5,
                    arrowprops=dict(arrowstyle="-|>,head_length=0.35,head_width=0.18",
                                    color=color, lw=lw, shrinkA=0, shrinkB=0))


def star_after(t, gap=0.02, size=TITLE):
    """A black star right after a text artist (new in this paper)."""
    bb = t.get_window_extent(renderer)
    x = bb.x1 / fig.dpi + gap
    y = (bb.y0 + bb.y1) / 2 / fig.dpi
    ax.text(x, y, "★", fontsize=size * 0.9, va="center", ha="left", color=INK)


# ---------------------------------------------------------------- lanes
LOOP_X = 0.49                                     # the R1 loop's left side
ENG = (2.24, 2.50)
TOOL = (0.74, 2.22)
CLU = (0.24, 0.72)
LEFT = 0.0
ax.add_patch(Rectangle((LEFT, ENG[0]), W, ENG[1] - ENG[0], fc=ENGINEER_BG, ec="none", zorder=0))
ax.add_patch(Rectangle((LEFT, TOOL[0]), W, TOOL[1] - TOOL[0], fc=TOOL_BG, ec="none", zorder=0))
ax.add_patch(Rectangle((LEFT, CLU[0]), W, CLU[1] - CLU[0], fc=CLUSTER_BG, ec="none", zorder=0))
for label, (y0, y1) in (("ENGINEER", ENG), ("TOOL", TOOL), ("GPU\nCLUSTER", CLU)):
    t = text(0.03, (y0 + y1) / 2, label, size=LANE, weight="bold", va="center", ha="left",
             linespacing=1.0)
    if y0 < ENG[0] and t.get_window_extent(renderer).x1 / fig.dpi > LOOP_X - 0.04:   # clear of the R1 loop
        OVERFLOWS.append(f"lane label {label!r} reaches the loop line")

# ---------------------------------------------------------------- columns
X0, BW, GAP = 0.56, 1.13, 0.15
COLS = [X0 + i * (BW + GAP) for i in range(5)]
CX = [x + BW / 2 for x in COLS]
TOP_Y, TOP_H = 1.58, 0.36                          # step boxes
SUP_Y, SUP_H = 0.86, 0.68                          # support boxes

STEPS = [
    (None, ["Input: requirements"]),
    ("1", ["Requirement check"]),
    ("2", ["Test generation", "and execution"]),
    ("3", ["Diagnosis"]),
    ("4", ["Requirement and", "domain-assumption", "refinement"]),
]
for i, (num, lines) in enumerate(STEPS):
    box(COLS[i], TOP_Y, BW, TOP_H, STEP_FILL)
    inner = BW - (0.24 if num else 0.08)
    cx = CX[i] + (0.07 if num else 0)
    step = 0.105
    ys = [TOP_Y + TOP_H / 2 + (len(lines) - 1) / 2 * step - j * step for j in range(len(lines))]
    for line, y in zip(lines, ys):
        text(cx, y, line, size=TITLE, weight="bold", ha="center", va="center", fit=inner)
    if num:
        ax.add_patch(Circle((COLS[i] + 0.1, TOP_Y + TOP_H / 2), 0.055, fc=INK, ec="none", zorder=6))
        text(COLS[i] + 0.1, TOP_Y + TOP_H / 2 - 0.004, num, size=6.5, weight="bold",
             color=WHITE, ha="center", va="center", zorder=7)
    if i < 4:   # the pipeline
        arrow([(COLS[i] + BW, TOP_Y + TOP_H / 2), (COLS[i + 1], TOP_Y + TOP_H / 2)])
    # support box belongs to the step above it
    ax.plot([CX[i], CX[i]], [SUP_Y + SUP_H, TOP_Y], color=INK, lw=0.6, ls=(0, (1, 1.5)), zorder=3)

SUPPORT = [
    ("IDE support", [
        [("performed by", MONO), (" (S)", None)],
        [("assuming", MONO), (" (D)", None)],
        [("ensuring", MONO), (" (R)", None)],
        "checked as you type",
        "live goal model (KAOS)",
    ]),
    ("Parser and checks", [
        "syntax errors, with line",
        "named modules must exist",
        "no assumption about the",
        "  system under test",
    ]),
    ("Derived tests", [
        "scenario grammar from",
        "  the requirement",
        "search: GE or grid",
        "runs as a job on a GPU",
        "  cluster (below)",
    ]),
    ("Validity and obstacles", [
        "assumptions held / broken:",
        "  valid vs spurious failures",
        "failure types from traces",
        "obstacles with evidence",
        "assumption verdicts",
    ]),
    ("IDE: triage, revision", [
        "accept / reject obstacles",
        "mitigation by layer",
        "revise assumptions (D)",
        r"R$_1$ labelled [S] [D] [R] [T]",
        [("signed ", None), ("decisions.json", MONO)],
    ]),
]
for i, (title, lines) in enumerate(SUPPORT):
    box(COLS[i], SUP_Y, BW, SUP_H, WHITE, rounded=False)
    x = COLS[i] + 0.06
    fit = BW - 0.1
    t = text(x, SUP_Y + SUP_H - 0.1, title, size=BODY + 0.3, weight="bold", va="baseline", fit=fit - 0.12)
    star_after(t, size=BODY + 0.3)
    for k, line in enumerate(lines):
        y = SUP_Y + SUP_H - 0.1 - (k + 1) * LINE
        if isinstance(line, list):
            rich(x, y, [(s, f or "STIXGeneral") for s, f in line], fit=fit)
        else:
            text(x, y, line, va="baseline", fit=fit)

# ---------------------------------------------------------------- cluster: one job
JOB = (0.56, 0.30, 5.18, 0.38)                     # x, y, w, h of the job frame
box(*JOB, JOB_FILL, rounded=True, lw=0.6)
text(JOB[0] + 0.06, JOB[1] + JOB[3] - 0.035, "Simulation job (Slurm, Apptainer image)", size=BODY,
     style="italic", va="top")
JB_Y, JB_H, JB_W = 0.335, 0.22, 1.05
jobs = [
    (["Scenario search", "grammar: GE or grid"], False),
    (["Scenic → CARLA"], False),
    (["System under test", "YOLO + braking"], False),
    (["Monitor", "same rule as step 3"], True),
]
jx = [JOB[0] + 0.1 + k * (JB_W + 0.23) for k in range(4)]
for k, (lines, new) in enumerate(jobs):
    box(jx[k], JB_Y, JB_W, JB_H, WHITE, rounded=False)
    if len(lines) == 1:
        text(jx[k] + JB_W / 2, JB_Y + JB_H / 2, lines[0], size=BODY, weight="bold", ha="center",
             va="center", fit=JB_W - 0.06)
    else:
        t = text(jx[k] + JB_W / 2, JB_Y + JB_H / 2 + 0.045, lines[0], size=BODY, weight="bold",
                 ha="center", va="center", fit=JB_W - 0.2)
        if new:
            star_after(t, size=BODY)
        text(jx[k] + JB_W / 2, JB_Y + JB_H / 2 - 0.055, lines[1], size=BODY, ha="center",
             va="center", fit=JB_W - 0.06)
    if k < 3:
        arrow([(jx[k] + JB_W, JB_Y + JB_H / 2), (jx[k + 1], JB_Y + JB_H / 2)])

# run folder: a cylinder (the store)
RF_X, RF_W, RF_Y, RF_H = 6.0, 0.8, 0.31, 0.3
from matplotlib.patches import Ellipse  # noqa: E402
ax.add_patch(Rectangle((RF_X, RF_Y), RF_W, RF_H, fc=WHITE, ec="none", zorder=2))
ax.plot([RF_X, RF_X], [RF_Y, RF_Y + RF_H], color=INK, lw=0.6, zorder=3)
ax.plot([RF_X + RF_W, RF_X + RF_W], [RF_Y, RF_Y + RF_H], color=INK, lw=0.6, zorder=3)
ax.add_patch(Ellipse((RF_X + RF_W / 2, RF_Y), RF_W, 0.07, fc=WHITE, ec=INK, lw=0.6, zorder=2.5))
ax.add_patch(Rectangle((RF_X + 0.003, RF_Y), RF_W - 0.006, RF_H, fc=WHITE, ec="none", zorder=2.6))
ax.add_patch(Ellipse((RF_X + RF_W / 2, RF_Y + RF_H), RF_W, 0.07, fc=WHITE, ec=INK, lw=0.6, zorder=3))
text(RF_X + RF_W / 2, RF_Y + 0.15, "Run folder", size=BODY, weight="bold", ha="center", va="center",
     zorder=4, fit=RF_W - 0.06)
text(RF_X + RF_W / 2, RF_Y + 0.06, "traces, metadata", size=BODY - 0.5, ha="center", va="center",
     zorder=4, fit=RF_W - 0.06)
arrow([(jx[3] + JB_W, JB_Y + JB_H / 2), (RF_X, JB_Y + JB_H / 2)])

# ---------------------------------------------------------------- between the lanes
# Step 2 submits the job (control, dashed)
arrow([(CX[2], SUP_Y), (CX[2], JOB[1] + JOB[3])], ls=(0, (3, 2)))
text(CX[2] + 0.04, (SUP_Y + JOB[1] + JOB[3]) / 2, "submit (after checks)", size=LABEL,
     style="italic", va="center")
# the run folder's traces and results feed the diagnosis (data, solid)
ROUTE_Y = 0.80
arrow([(RF_X + RF_W / 2, RF_Y + RF_H + 0.035), (RF_X + RF_W / 2, ROUTE_Y), (CX[3] + 0.2, ROUTE_Y),
       (CX[3] + 0.2, SUP_Y)])
text((RF_X + RF_W / 2 + CX[3] + 0.2) / 2 + 0.05, ROUTE_Y - 0.012, "traces and results", size=LABEL,
     style="italic", ha="center", va="top")

# ---------------------------------------------------------------- loops back (red)
TOP = TOP_Y + TOP_H
# [D] [R]: 4 -> 3, re-judged on stored traces
DR_Y = 2.00
arrow([(COLS[4] + 0.25, TOP), (COLS[4] + 0.25, DR_Y), (COLS[3] + 0.85, DR_Y), (COLS[3] + 0.85, TOP)],
      color=LOOP, lw=1.1)
text((COLS[4] + 0.25 + COLS[3] + 0.85) / 2, DR_Y + 0.025, "[D] [R]: re-diagnosed, no new run",
     size=LABEL, style="italic", color=LOOP, ha="center", va="bottom")
# [S]: 4 -> 2, a new round of simulation
S_Y = 2.17
arrow([(COLS[4] + 0.62, TOP), (COLS[4] + 0.62, S_Y), (CX[2], S_Y), (CX[2], TOP)], color=LOOP, lw=1.1)
text(CX[2] + 0.62, S_Y - 0.02, "[S]: new round", size=LABEL, style="italic", color=LOOP,
     ha="center", va="top")
# R1 becomes the next input: 4 -> Input, along the bottom edge
R1_Y = 0.15
arrow([(COLS[4] + BW, TOP_Y + 0.09), (6.93, TOP_Y + 0.09), (6.93, R1_Y), (LOOP_X, R1_Y),
       (LOOP_X, TOP_Y + 0.09), (COLS[0], TOP_Y + 0.09)], color=LOOP, lw=1.1)
text(1.75, R1_Y + 0.02, r"R$_1$ becomes the next input", size=LABEL, style="italic", color=LOOP,
     ha="center", va="bottom")

# ---------------------------------------------------------------- the engineer
for x_text, x_arrow, s in ((CX[0], CX[0], r"writes R$_0$"),
                           (CX[4] - 0.12, COLS[4] + 0.95, r"decides and signs R$_1$")):
    text(x_text, (ENG[0] + ENG[1]) / 2, s, size=TITLE, style="italic", ha="center", va="center")
    arrow([(x_arrow, ENG[0] + 0.03), (x_arrow, TOP)], lw=0.6, ls=(0, (1, 1.5)))

# ---------------------------------------------------------------- legend (one line)
LY = 0.055
lx = 2.75
t = text(lx, LY, "★ new in this paper", size=LABEL, va="center")
lx += width_in(t) + 0.16
for style, colour, lw, label in (("-", INK, 0.8, "pipeline"), ((0, (3, 2)), INK, 0.8, "submit"),
                                 ("-", LOOP, 1.1, "loop back"), ((0, (1, 1.5)), INK, 0.6, "engineer")):
    ax.plot([lx, lx + 0.25], [LY, LY], color=colour, lw=lw, ls=style)
    t = text(lx + 0.29, LY, label, size=LABEL, va="center")
    lx += 0.29 + width_in(t) + 0.16
if lx > W - 0.02:
    OVERFLOWS.append(f"legend ends at {lx:.2f} in > {W - 0.02:.2f} in")

if OVERFLOWS:
    raise SystemExit("text overflows:\n  " + "\n  ".join(OVERFLOWS))
for ext in ("pdf", "png"):
    fig.savefig(os.path.join(HERE, f"fig1_architecture.{ext}"), dpi=300 if ext == "png" else None)
print("wrote fig1_architecture.pdf and .png")
