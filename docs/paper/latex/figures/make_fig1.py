"""Figure 1 of the ICSE demo paper: REAL's loop as the tool implements it.

    sim_env/bin/python docs/paper/latex/figures/make_fig1.py

Writes fig1_workflow.pdf (vector, for the paper) and fig1_workflow.png
(preview) next to this file. Full text width (figure* in IEEEtran, ~7.1 in),
one row, so it costs little height.
"""

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

HERE = os.path.dirname(os.path.abspath(__file__))
plt.rcParams.update({"font.family": "serif", "font.size": 6.4})

HUMAN, LAPTOP, CLUSTER, EDGE = "#f6e3b4", "#dbe9f6", "#e3e3e3", "#333333"

STEPS = [
    ("1  Requirement", "performed by  (S)\nassuming  (D)\nensuring  (R)", HUMAN),
    ("2  Scenario search", "grammar of scenarios\nGE or exhaustive grid", LAPTOP),
    ("3  Execution", "Scenic + CARLA + YOLO\non a GPU cluster\nper-step telemetry", CLUSTER),
    ("4  Analysis", "test defects set aside\nvalid vs spurious from D\nobstacles + evidence", LAPTOP),
    ("5  Review", "verdict per obstacle\nand per assumption;\nmitigation menu", HUMAN),
    ("6  Revision", "R1, changes labelled\n[S] car  [R] promise\n[D] assumptions  [T] test", LAPTOP),
]

W, H, GAP, X0, Y0 = 14.7, 15.0, 1.6, 1.2, 8.6
fig = plt.figure(figsize=(7.1, 1.3))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 100)
ax.set_ylim(0, 27)
ax.axis("off")

centres = []
for i, (title, body, colour) in enumerate(STEPS):
    x = X0 + i * (W + GAP)
    ax.add_patch(FancyBboxPatch((x, Y0), W, H, boxstyle="round,pad=0.3,rounding_size=1.0",
                                linewidth=0.6, edgecolor=EDGE, facecolor=colour))
    ax.text(x + W / 2, Y0 + H - 1.6, title, ha="center", va="top", weight="bold")
    ax.text(x + W / 2, Y0 + H - 5.6, body, ha="center", va="top", linespacing=1.2, fontsize=5.7)
    centres.append(x + W / 2)
    if i:
        ax.add_patch(FancyArrowPatch((x - GAP + 0.3, Y0 + H / 2), (x - 0.3, Y0 + H / 2),
                                     arrowstyle="-|>", mutation_scale=6, linewidth=0.6, color=EDGE))

# loop back: revision -> next round's requirement, under the row
yb = Y0 - 2.6
ax.plot([centres[-1], centres[-1], centres[0]], [Y0 - 0.4, yb, yb], color=EDGE, linewidth=0.6)
ax.add_patch(FancyArrowPatch((centres[0], yb), (centres[0], Y0 - 0.4), arrowstyle="-|>",
                             mutation_scale=6, linewidth=0.6, color=EDGE))
ax.text(50, yb - 1.9, "next round: run_meta.json and decisions.json link every run to the decision that caused it",
        ha="center", va="center", style="italic", fontsize=6.2)
ax.text(99, 25.6, "yellow: people decide   blue: laptop (also in the Docker demo)   grey: GPU cluster",
        ha="right", va="center", fontsize=5.8, color="#555555")

for ext in ("pdf", "png"):
    fig.savefig(os.path.join(HERE, f"fig1_workflow.{ext}"), bbox_inches="tight", dpi=300)
print("wrote", os.path.join(HERE, "fig1_workflow.pdf"))
