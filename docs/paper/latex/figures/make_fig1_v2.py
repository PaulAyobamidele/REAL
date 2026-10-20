"""Draw Fig. 1 (fig:arch), design v2: components and artefacts, flowchart
shapes, provenance colours, two loops. Spec: architecture_diagram_v2.md.

    python docs/paper/latex/figures/make_fig1_v2.py

Writes fig1_architecture_v2.pdf (vector, TrueType fonts, no Type 3) and a
PNG preview next to this file. Every text is measured; the script stops if
a line overflows its box or the legend overflows the width.

Encodings (all stated in the legend):
  shape   rounded box = component · parallelogram = artefact · stacked = a
          set of many · frame = stage · person = the engineer
  colour  violet + star = new in this paper · orange = reused from the REAL
          framework package · grey, dashed border = existing tool · yellow =
          artefact
  line    solid = data flow · dotted = the engineer uses · red = loop back
"""
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Rectangle

matplotlib.rcParams.update({
    "pdf.fonttype": 42, "ps.fonttype": 42,
    "font.family": "STIXGeneral", "mathtext.fontset": "stix",
})

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 7.0, 2.86

INK = "#1D1D1F"
LOOP = "#B03A2E"
FRAME_FILL = "#F6F8FB"
NEW, FRAMEWORK, TOOL, ARTEFACT = "#C9B8F0", "#F8D9BC", "#D2D2D2", "#FFF3B0"
MONO = "DejaVu Sans Mono"
STAR = "★"
SKEW = 0.07                                  # parallelogram slant, inches
DOTTED, DASHED = (0, (1, 1.6)), (0, (2.2, 1.4))

T_FRAME, T_BOX, T_SUB, T_LEG = 7.0, 6.5, 6.0, 6.0

fig = plt.figure(figsize=(W, H))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis("off")
renderer = fig.canvas.get_renderer()
OVERFLOWS = []


def wid(artist):
    return artist.get_window_extent(renderer).width / fig.dpi


def text(x, y, s, size=T_SUB, fit=None, **kw):
    t = ax.text(x, y, s, fontsize=size, color=kw.pop("color", INK), zorder=8, **kw)
    if fit is not None and wid(t) > fit:
        OVERFLOWS.append(f"{s!r}: {wid(t):.2f} in > {fit:.2f} in")
    return t


ICONS = {n: plt.imread(os.path.join(HERE, "icons", f"{n}.png")) for n in ("robot", "engineer")}


def icon(name, cx, cy, h):
    """A raster icon (RGBA, transparent background) h inches tall, centred at (cx, cy)."""
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
def component(x, y, w, h, kind, title, lines=()):
    """kind: 'new' (violet, star), 'framework' (orange), 'tool' (grey, dashed border)."""
    fill = {"new": NEW, "framework": FRAMEWORK, "tool": TOOL}[kind]
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.045",
                                fc=fill, ec=INK, lw=0.6, ls=DASHED if kind == "tool" else "-", zorder=3))
    n = 1 + len(lines)
    step = 0.093
    top = y + h / 2 + (n - 1) / 2 * step
    star = kind == "new"
    t = text(x + w / 2 - (0.05 if star else 0), top, title, size=T_BOX, weight="bold",
             ha="center", va="center", fit=w - 0.08 - (0.11 if star else 0))
    if star:
        star_after(t, T_BOX)
    for k, line in enumerate(lines):
        text(x + w / 2, top - (k + 1) * step, line, ha="center", va="center", fit=w - 0.08)


def artefact(x, y, w, h, title, lines=(), stack=False, mono_title=False):
    def pts(dy):
        return [(x + SKEW, y + dy), (x + w, y + dy), (x + w - SKEW, y + h + dy), (x, y + h + dy)]
    if stack:
        for dy in (0.05, 0.025):
            ax.add_patch(Polygon(pts(dy), closed=True, fc=ARTEFACT, ec=INK, lw=0.6, zorder=2))
    ax.add_patch(Polygon(pts(0), closed=True, fc=ARTEFACT, ec=INK, lw=0.6, zorder=3))
    n = 1 + len(lines)
    step = 0.093
    top = y + h / 2 + (n - 1) / 2 * step
    text(x + w / 2, top, title, size=T_BOX, weight="bold", ha="center", va="center",
         family=MONO if mono_title else "STIXGeneral", fit=w - 2 * SKEW - 0.04)
    for j, line in enumerate(lines):
        text(x + w / 2, top - (j + 1) * step, line, ha="center", va="center", fit=w - 2 * SKEW - 0.04)


def frame(y0, y1, title, infra=None):
    ax.add_patch(Rectangle((FX0, y0), FX1 - FX0, y1 - y0, fc=FRAME_FILL, ec=INK, lw=0.6, zorder=1))
    t = text(FX0 + 0.06, y1 - 0.035, title, size=T_FRAME, weight="bold", va="top")
    x = FX0 + 0.06 + wid(t) + 0.07              # the tool drives every stage: a robot in each title
    icon("robot", x + 0.075, y1 - 0.085, 0.15)
    if infra:
        text(x + 0.20, y1 - 0.035, infra, style="italic", va="top")


def engineer_over(x, box_top, label_x):
    """The engineer glyph above a component, dotted line down to it."""
    icon("engineer", x, box_top + 0.145, 0.18)
    arrow([(x, box_top + 0.05), (x, box_top)], lw=0.6, ls=DOTTED, head_len=0.25)
    text(label_x - 0.03, box_top + 0.145, "engineer", style="italic", ha="right", va="center")


FX0, FX1 = 0.42, 6.96
BH = 0.30

# ------------------------------------------------------------------ stage frames (bands)
frame(2.24, 2.82, "1. Specify")
frame(1.43, 2.20, "2. Generate and execute tests", "runs as a job on a GPU cluster (Slurm, Apptainer image)")
frame(0.89, 1.39, "3. Diagnose")
frame(0.25, 0.85, "4. Decide and refine")

# ---- band 1, left to right -------------------------------------------------
y, yc = 2.29, 2.44
component(0.52, y, 1.36, BH, "new", "Requirement editor", ["REAL-DSL"])
component(2.18, y, 1.04, BH, "framework", "DSL parser")
component(3.52, y, 1.40, BH, "new", "Requirement check",
          ["named modules exist", "no assumption about the system"])
artefact(5.50, y, 1.38, BH, r"R$_0$: checked requirement", ["goal model (KAOS)"])
arrow([(1.88, yc), (2.18, yc)])
arrow([(3.22, yc), (3.52, yc)])
arrow([(4.92, yc), (5.50 + SKEW / 2, yc)])
engineer_over(1.55, y + BH, 1.47)

# ---- band 2, right to left -------------------------------------------------
y, yc = 1.715, 1.865
component(5.50, y, 1.38, BH, "framework", "Scenario search", ["grammar → GE (GRAPE) or grid"])
artefact(4.45, y, 0.85, BH, "scenarios", stack=True)
component(3.10, 1.75, 1.20, 0.23, "tool", "Scenario execution", ["Scenic → CARLA"])
component(3.10, 1.52, 1.20, 0.23, "framework", "System under test", ["YOLOv5 detector + braking"])
component(1.62, y, 1.23, BH, "new", "Safety monitor", ["+ telemetry recorder"])
artefact(0.78, y, 0.80, BH, "run folder", ["traces · results"], stack=True)
arrow([(5.50, yc), (5.30 - SKEW / 2, yc)])
arrow([(4.45 + SKEW / 2, yc), (4.30, yc)])
arrow([(3.10, yc), (2.85, yc)])
arrow([(1.62, yc), (1.58 - SKEW / 2, yc)])
arrow([(6.19, 2.29), (6.19, y + BH)])              # R0 feeds the scenario search

# ---- band 3, left to right -------------------------------------------------
y, yc = 0.94, 1.09
component(0.78, y, 1.20, BH, "new", "Validity check", ["assumptions held / broken", "valid vs spurious failures"])
component(2.22, y, 1.22, BH, "new", "Failure classifier", ["failure type per trace"])
component(3.70, y, 1.30, BH, "new", "Obstacle analyser", ["obstacles with evidence", "assumption verdicts"])
artefact(5.50, y, 1.38, BH, "diagnosis", ["valid failures · obstacles", "assumption verdicts"])
arrow([(1.98, yc), (2.22, yc)])
arrow([(3.44, yc), (3.70, yc)])
arrow([(5.00, yc), (5.50 + SKEW / 2, yc)])
arrow([(1.45, 1.715), (1.45, y + BH)])             # the run folder feeds the validity check (right of the stage title)

# ---- band 4, right to left -------------------------------------------------
y, yc = 0.30, 0.45
component(5.50, y, 1.38, BH, "new", "Review interface", ["five steps · mitigation menu"])
component(3.80, y, 1.30, BH, "new", "Requirement writer", [r"R$_1$ with labelled changes"])
artefact(2.20, y, 1.25, BH, "decisions.json", [r"+ R$_1$ with its changes", "labelled [S] [D] [R]"],
         mono_title=True)
arrow([(5.50, yc), (5.10, yc)])
arrow([(3.80, yc), (3.45 - SKEW / 2, yc)])
arrow([(6.19, 0.94), (6.19, y + BH)])              # the diagnosis opens in the review interface
engineer_over(5.85, y + BH, 5.77)

# ---- the two loops back (red): from the signed decisions ------------------
edge = lambda yy: 2.20 + SKEW * (1 - (yy - 0.30) / BH)   # the artefact's slanted left edge
arrow([(edge(0.525), 0.525), (0.29, 0.525), (0.29, 1.09), (0.78, 1.09)], color=LOOP, lw=1.1)
arrow([(edge(0.375), 0.375), (0.16, 0.375), (0.16, 2.44), (0.52, 2.44)], color=LOOP, lw=1.1)
text(0.56, 0.45, "[D] [R]: re-diagnosed, no new simulation", style="italic", color=LOOP,
     va="center", fit=1.60)
text(0.56, 0.325, r"[S]: next round, R$_1$ is the new input", style="italic", color=LOOP,
     va="center", fit=1.64)

# ------------------------------------------------------------------ legend, two lines
def legend_item(lx, ly, draw, label):
    draw(lx, ly)
    t = text(lx + 0.21, ly, label, size=T_LEG, va="center")
    return lx + 0.21 + wid(t) + 0.16


def mini_box(lx, ly, fill="#FFFFFF", ls="-"):
    ax.add_patch(FancyBboxPatch((lx, ly - 0.04), 0.16, 0.08, boxstyle="round,pad=0,rounding_size=0.02",
                                fc=fill, ec=INK, lw=0.6, ls=ls, zorder=3))


def mini_art(lx, ly, stack=False):
    for dy in ((0.03, 0.015) if stack else ()):
        ax.add_patch(Polygon([(lx + 0.03, ly - 0.04 + dy), (lx + 0.16, ly - 0.04 + dy),
                              (lx + 0.13, ly + 0.04 + dy), (lx, ly + 0.04 + dy)], fc=ARTEFACT, ec=INK, lw=0.6, zorder=2))
    ax.add_patch(Polygon([(lx + 0.03, ly - 0.04), (lx + 0.16, ly - 0.04), (lx + 0.13, ly + 0.04), (lx, ly + 0.04)],
                         fc=ARTEFACT, ec=INK, lw=0.6, zorder=3))


def mini_line(color, lw, ls="-"):
    return lambda lx, ly: ax.plot([lx, lx + 0.18], [ly, ly], color=color, lw=lw, ls=ls, zorder=3)


ly = 0.16
lx = 0.42
lx = legend_item(lx, ly, lambda a, b: mini_box(a, b), "component")
lx = legend_item(lx, ly, lambda a, b: mini_art(a, b), "artefact")
lx = legend_item(lx, ly, lambda a, b: mini_art(a, b, stack=True), "a set of many")
lx = legend_item(lx, ly, lambda a, b: ax.add_patch(Rectangle((a, b - 0.04), 0.16, 0.08, fc=FRAME_FILL, ec=INK, lw=0.6, zorder=3)), "stage")
lx = legend_item(lx, ly, lambda a, b: icon("robot", a + 0.08, b, 0.12), "the tool, automated")
lx = legend_item(lx, ly, lambda a, b: icon("engineer", a + 0.08, b, 0.12), "the engineer")
if lx > W - 0.02:
    OVERFLOWS.append(f"legend line 1 ends at {lx:.2f} in")

ly = 0.055
lx = 0.42
lx = legend_item(lx, ly, lambda a, b: (mini_box(a, b, NEW), text(a + 0.05, b, STAR, size=5.5, va="center")),
                 "new in this paper")
lx = legend_item(lx, ly, lambda a, b: mini_box(a, b, FRAMEWORK), "reused from the REAL framework package")
lx = legend_item(lx, ly, lambda a, b: mini_box(a, b, TOOL, DASHED), "existing tool")
lx = legend_item(lx, ly, mini_line(INK, 0.8), "data flow")
lx = legend_item(lx, ly, mini_line(INK, 0.6, DOTTED), "the engineer uses")
lx = legend_item(lx, ly, mini_line(LOOP, 1.1), "loop back")
if lx > W - 0.02:
    OVERFLOWS.append(f"legend line 2 ends at {lx:.2f} in")

if OVERFLOWS:
    raise SystemExit("text overflows:\n  " + "\n  ".join(OVERFLOWS))
for ext in ("pdf", "png"):
    fig.savefig(os.path.join(HERE, f"fig1_architecture_v2.{ext}"), dpi=300 if ext == "png" else None)
print("wrote fig1_architecture_v2.pdf and .png")
