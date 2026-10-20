"""Draw Fig. 1 (fig:arch), design v2: components and artefacts, flowchart
shapes, provenance colours, one decision, two loops. Spec:
architecture_diagram_v2.md.

    python docs/paper/latex/figures/make_fig1_v2.py

Writes fig1_architecture_v2.pdf (vector text, TrueType fonts, no Type 3; the
two icons are embedded rasters) and a PNG preview next to this file. Every
text is measured; the script stops if a line overflows its box or the
legend overflows the width.

Flowchart rules (ISO 5807 / ANSI, as the owner stated them):
  rectangle = process (a component) · parallelogram = input/output (an
  artefact; stacked = a set of many) · diamond = decision · frame = stage
Actors, one icon size everywhere, inside the box they index:
  robot = the component runs automatically · engineer = a person operates it
Colour = provenance: violet + star = new in this paper · orange = reused from
  the REAL framework package · grey, dashed border = existing tool · yellow =
  artefact
"""
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle

matplotlib.rcParams.update({
    "pdf.fonttype": 42, "ps.fonttype": 42,
    "font.family": "STIXGeneral", "mathtext.fontset": "stix",
})

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 7.0, 2.86

INK = "#1D1D1F"
LOOP = "#B03A2E"
FRAME_FILL = "#F6F8FB"
NEW, FRAMEWORK, TOOL, ARTEFACT, WHITE = "#C9B8F0", "#F8D9BC", "#D2D2D2", "#FFF3B0", "#FFFFFF"
STAR = "★"
SKEW = 0.07                                  # parallelogram slant, inches
DASHED = (0, (2.2, 1.4))
ICON_H = 0.14                                # one icon size everywhere
ICON_SLOT = 0.26                             # width reserved for an icon inside a box

T_FRAME, T_BOX, T_SUB, T_LEG = 7.0, 6.5, 6.0, 6.0
STEP = 0.093                                 # line pitch inside boxes

fig = plt.figure(figsize=(W, H))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis("off")
renderer = fig.canvas.get_renderer()
OVERFLOWS = []
ICONS = {n: plt.imread(os.path.join(HERE, "icons", f"{n}.png")) for n in ("robot", "engineer")}


def wid(artist):
    return artist.get_window_extent(renderer).width / fig.dpi


def text(x, y, s, size=T_SUB, fit=None, **kw):
    t = ax.text(x, y, s, fontsize=size, color=kw.pop("color", INK), zorder=8, **kw)
    if fit is not None and wid(t) > fit:
        OVERFLOWS.append(f"{s!r}: {wid(t):.2f} in > {fit:.2f} in")
    return t


def icon(name, cx, cy, h=ICON_H):
    img = ICONS[name]
    w = h * img.shape[1] / img.shape[0]
    ax.imshow(img, extent=(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2), zorder=9,
              interpolation="lanczos")
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)


def star_after(t, size):
    bb = t.get_window_extent(renderer)
    ax.text(bb.x1 / fig.dpi + 0.025, (bb.y0 + bb.y1) / 2 / fig.dpi, STAR, fontsize=size * 0.9,
            va="center", ha="left", color=INK, zorder=8)


def arrow(points, color=INK, lw=0.8, ls="-", z=6, head_len=0.32):
    xs, ys = zip(*points)
    ax.plot(xs, ys, color=color, lw=lw, ls=ls, solid_capstyle="butt", zorder=z)
    ax.annotate("", xy=points[-1], xytext=points[-2], zorder=z + 1,
                arrowprops=dict(arrowstyle=f"-|>,head_length={head_len},head_width={head_len / 2}",
                                color=color, lw=lw, shrinkA=0, shrinkB=0))


# ------------------------------------------------------------------ shapes
def component(x, y, w, h, kind, actor, title, lines=()):
    """A process: rectangle. kind: 'new' (violet, star), 'framework' (orange),
    'tool' (grey, dashed). actor: 'robot' (automated) or 'engineer' (operated)."""
    fill = {"new": NEW, "framework": FRAMEWORK, "tool": TOOL}[kind]
    ax.add_patch(Rectangle((x, y), w, h, fc=fill, ec=INK, lw=0.6,
                           ls=DASHED if kind == "tool" else "-", zorder=3))
    n = 1 + len(lines)
    top = y + h / 2 + (n - 1) / 2 * STEP
    icon(actor, x + 0.13, top)
    star = kind == "new"
    cx = x + ICON_SLOT + (w - ICON_SLOT - 0.04) / 2 - (0.05 if star else 0)
    t = text(cx, top, title, size=T_BOX, weight="bold", ha="center", va="center",
             fit=w - ICON_SLOT - 0.04 - (0.11 if star else 0))
    if star:
        star_after(t, T_BOX)
    for k, line in enumerate(lines):
        text(x + w / 2, top - (k + 1) * STEP, line, ha="center", va="center", fit=w - 0.08)


def artefact(x, y, w, h, title, lines=(), stack=False):
    """An input/output: parallelogram; stacked = a set of many."""
    def pts(dy):
        return [(x + SKEW, y + dy), (x + w, y + dy), (x + w - SKEW, y + h + dy), (x, y + h + dy)]
    if stack:
        for dy in (0.05, 0.025):
            ax.add_patch(Polygon(pts(dy), closed=True, fc=ARTEFACT, ec=INK, lw=0.6, zorder=2))
    ax.add_patch(Polygon(pts(0), closed=True, fc=ARTEFACT, ec=INK, lw=0.6, zorder=3))
    n = 1 + len(lines)
    top = y + h / 2 + (n - 1) / 2 * STEP
    text(x + w / 2, top, title, size=T_BOX, weight="bold", ha="center", va="center",
         fit=w - 2 * SKEW - 0.04)
    for j, line in enumerate(lines):
        text(x + w / 2, top - (j + 1) * STEP, line, ha="center", va="center", fit=w - 2 * SKEW - 0.04)


def decision(cx, cy, hw, hh, lines):
    """A decision: diamond."""
    ax.add_patch(Polygon([(cx - hw, cy), (cx, cy + hh), (cx + hw, cy), (cx, cy - hh)], closed=True,
                         fc=WHITE, ec=INK, lw=0.6, zorder=3))
    for k, line in enumerate(lines):
        yy = cy + (len(lines) - 1) / 2 * 0.085 - k * 0.085
        text(cx, yy, line, size=T_SUB, weight="bold", ha="center", va="center",
             fit=2 * hw * (1 - abs(yy - cy) / hh) - 0.04)


def frame(y0, y1, title, note=None):
    ax.add_patch(Rectangle((FX0, y0), FX1 - FX0, y1 - y0, fc=FRAME_FILL, ec=INK, lw=0.6, zorder=1))
    t = text(FX0 + 0.06, y1 - 0.035, title, size=T_FRAME, weight="bold", va="top")
    if note:
        text(FX0 + 0.06 + wid(t) + 0.08, y1 - 0.035, note, style="italic", va="top")


FX0, FX1 = 0.42, 6.96
BH = 0.30

# ------------------------------------------------------------------ stage frames (bands)
frame(2.24, 2.82, "1. Specify")
frame(1.43, 2.20, "2. Generate and execute tests", "runs as a job on a GPU cluster (Slurm, Apptainer image)")
frame(0.89, 1.39, "3. Diagnose")
frame(0.25, 0.85, "4. Decide and refine")

# ---- band 1, left to right -------------------------------------------------
y, yc = 2.29, 2.44
component(0.52, y, 1.43, BH, "new", "engineer", "Requirement editor", ["REAL-DSL"])
component(2.18, y, 1.02, BH, "framework", "robot", "DSL parser")
component(3.45, y, 1.60, BH, "new", "robot", "Requirement check",
          ["named modules exist", "no assumption about the system"])
artefact(5.50, y, 1.38, BH, r"R$_0$: checked requirement", ["goal model (KAOS)"])
arrow([(1.95, yc), (2.18, yc)])
arrow([(3.20, yc), (3.45, yc)])
arrow([(5.05, yc), (5.50 + SKEW / 2, yc)])

# ---- band 2, right to left -------------------------------------------------
y, yc = 1.715, 1.865
component(5.50, y, 1.38, BH, "framework", "robot", "Scenario search", ["grammar → GE (GRAPE) or grid"])
artefact(4.58, y, 0.75, BH, "scenarios", stack=True)
component(3.08, 1.75, 1.35, 0.23, "tool", "robot", "Scenario execution", ["Scenic → CARLA"])
component(3.08, 1.52, 1.35, 0.23, "framework", "robot", "System under test", ["YOLOv5 detector + braking"])
component(1.68, y, 1.27, BH, "new", "robot", "Safety monitor", ["+ telemetry recorder"])
artefact(0.55, y, 1.00, BH, "execution traces", ["results · metadata"], stack=True)
arrow([(5.50, yc), (5.33 - SKEW / 2, yc)])
arrow([(4.58 + SKEW / 2, yc), (4.43, yc)])
arrow([(3.08, yc), (2.95, yc)])
arrow([(1.68, yc), (1.55 - SKEW / 2, yc)])
arrow([(6.19, 2.29), (6.19, y + BH)])              # R0 feeds the scenario search

# ---- band 3, left to right -------------------------------------------------
y, yc = 0.94, 1.09
component(0.70, y, 1.45, BH, "new", "robot", "Validity check",
          ["assumptions held / broken", "valid vs spurious failures"])
component(2.35, y, 1.30, BH, "new", "robot", "Failure classifier", ["failure type per trace"])
component(3.85, y, 1.40, BH, "new", "robot", "Obstacle analyser",
          ["obstacles with evidence", "assumption verdicts"])
artefact(5.50, y, 1.38, BH, "diagnosis", ["valid failures · obstacles", "assumption verdicts"])
arrow([(2.15, yc), (2.35, yc)])
arrow([(3.65, yc), (3.85, yc)])
arrow([(5.25, yc), (5.50 + SKEW / 2, yc)])
arrow([(1.30, 1.715), (1.30, y + BH)])             # the traces feed the validity check

# ---- band 4, right to left -------------------------------------------------
y, yc = 0.30, 0.45
component(5.50, y, 1.38, BH, "new", "engineer", "Review interface", ["five steps · mitigation menu"])
component(3.70, y, 1.45, BH, "new", "robot", "Requirement writer", [r"R$_1$ with labelled changes"])
artefact(2.25, y, 1.20, BH, "signed decisions", [r"+ R$_1$ with its changes", "labelled [S] [D] [R]"])
DX, DY, DHW, DHH = 1.70, yc, 0.30, 0.145
decision(DX, DY, DHW, DHH, ["[S]", "changed?"])
arrow([(5.50, yc), (5.15, yc)])
arrow([(3.70, yc), (3.45 - SKEW / 2, yc)])
arrow([(2.25 + SKEW / 2, yc), (DX + DHW, yc)])
arrow([(6.19, 0.94), (6.19, y + BH)])              # the diagnosis opens in the review interface

# ---- the two branches of the decision (red loops) --------------------------
# no: only [D] or [R] changed -> stage 3 re-diagnoses the stored traces; the
# validity check sits directly above the diamond, so the branch goes straight up
arrow([(DX, DY + DHH), (DX, 0.94)], color=LOOP, lw=1.1)
text(DX + 0.08, 0.80, "no, only [D] or [R] changed:", style="italic", color=LOOP, va="center", fit=1.5)
text(DX + 0.08, 0.71, "re-diagnosed on the stored traces", style="italic", color=LOOP, va="center", fit=1.5)
# yes: the system changed -> next round from stage 1 with R1 as the input; the
# only line in the left margin, so nothing crosses
arrow([(DX - DHW, DY), (0.16, DY), (0.16, 2.44), (0.52, 2.44)], color=LOOP, lw=1.1)
text(0.47, 0.64, "yes, the system changed:", style="italic", color=LOOP, va="center", fit=DX - DHW - 0.50)
text(0.47, 0.55, r"next round with R$_1$", style="italic", color=LOOP, va="center", fit=DX - DHW - 0.50)

# ------------------------------------------------------------------ legend, two lines
def legend_item(lx, ly, draw, label):
    draw(lx, ly)
    t = text(lx + 0.21, ly, label, size=T_LEG, va="center")
    return lx + 0.21 + wid(t) + 0.15


def mini_box(lx, ly, fill=WHITE, ls="-"):
    ax.add_patch(Rectangle((lx, ly - 0.04), 0.16, 0.08, fc=fill, ec=INK, lw=0.6, ls=ls, zorder=3))


def mini_art(lx, ly, stack=False):
    for dy in ((0.03, 0.015) if stack else ()):
        ax.add_patch(Polygon([(lx + 0.03, ly - 0.04 + dy), (lx + 0.16, ly - 0.04 + dy),
                              (lx + 0.13, ly + 0.04 + dy), (lx, ly + 0.04 + dy)],
                             fc=ARTEFACT, ec=INK, lw=0.6, zorder=2))
    ax.add_patch(Polygon([(lx + 0.03, ly - 0.04), (lx + 0.16, ly - 0.04), (lx + 0.13, ly + 0.04),
                          (lx, ly + 0.04)], fc=ARTEFACT, ec=INK, lw=0.6, zorder=3))


def mini_diamond(lx, ly):
    ax.add_patch(Polygon([(lx, ly), (lx + 0.08, ly + 0.05), (lx + 0.16, ly), (lx + 0.08, ly - 0.05)],
                         fc=WHITE, ec=INK, lw=0.6, zorder=3))


def mini_line(color, lw, ls="-"):
    return lambda lx, ly: ax.plot([lx, lx + 0.18], [ly, ly], color=color, lw=lw, ls=ls, zorder=3)


ly, lx = 0.16, 0.42
lx = legend_item(lx, ly, lambda a, b: mini_box(a, b), "component (process)")
lx = legend_item(lx, ly, lambda a, b: mini_art(a, b), "artefact (input / output)")
lx = legend_item(lx, ly, lambda a, b: mini_art(a, b, stack=True), "a set of many")
lx = legend_item(lx, ly, mini_diamond, "decision")
lx = legend_item(lx, ly, lambda a, b: ax.add_patch(Rectangle((a, b - 0.04), 0.16, 0.08, fc=FRAME_FILL,
                                                             ec=INK, lw=0.6, zorder=3)), "stage")
lx = legend_item(lx, ly, lambda a, b: icon("robot", a + 0.08, b), "runs automatically")
lx = legend_item(lx, ly, lambda a, b: icon("engineer", a + 0.08, b), "operated by the engineer")
if lx > W - 0.02:
    OVERFLOWS.append(f"legend line 1 ends at {lx:.2f} in")

ly, lx = 0.055, 0.42
lx = legend_item(lx, ly, lambda a, b: (mini_box(a, b, NEW), text(a + 0.05, b, STAR, size=5.5, va="center")),
                 "new in this paper")
lx = legend_item(lx, ly, lambda a, b: mini_box(a, b, FRAMEWORK), "reused from the REAL framework package")
lx = legend_item(lx, ly, lambda a, b: mini_box(a, b, TOOL, DASHED), "existing tool")
lx = legend_item(lx, ly, mini_line(INK, 0.8), "data flow")
lx = legend_item(lx, ly, mini_line(LOOP, 1.1), "loop back")
if lx > W - 0.02:
    OVERFLOWS.append(f"legend line 2 ends at {lx:.2f} in")

if OVERFLOWS:
    raise SystemExit("text overflows:\n  " + "\n  ".join(OVERFLOWS))
for ext in ("pdf", "png"):
    fig.savefig(os.path.join(HERE, f"fig1_architecture_v2.{ext}"), dpi=300 if ext == "png" else None)
print("wrote fig1_architecture_v2.pdf and .png")
