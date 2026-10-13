"""Camera-only estimate of whether a detected person is in the car's lane,
used by the `path_aware_braking` module (scripts/scenarios/scratch.temp).

Pinhole camera: a person of height H at depth Z appears h = f*H/Z pixels tall
and (x - cx) = f*X/Z pixels off-centre, so the lateral offset is
X = (x - cx) * H / h - independent of the focal length. H is an assumed
person height, so a shorter person (a child) is estimated further out than
they are: a real weakness of this estimate, which experiments can expose.
"""

ASSUMED_PERSON_HEIGHT_M = 1.7
IN_PATH_HALF_WIDTH_M = 2.5    # the same lane band as the safety rule
IMAGE_CENTRE_X = 320.0        # 640-px frame


def lateral_offset_m(xmin, xmax, ymin, ymax, image_centre_x=IMAGE_CENTRE_X,
                     person_height_m=ASSUMED_PERSON_HEIGHT_M):
    """Estimated lateral offset (m) of a person box from the camera's axis;
    None for a degenerate box."""
    box_h = float(ymax) - float(ymin)
    if box_h <= 1.0:
        return None
    return ((float(xmin) + float(xmax)) / 2.0 - image_centre_x) * person_height_m / box_h


def in_path_confidence(boxes, half_width_m=IN_PATH_HALF_WIDTH_M):
    """Highest confidence among person boxes estimated within `half_width_m`
    of the car's axis. `boxes`: iterable of dicts/rows with xmin, xmax, ymin,
    ymax, confidence. 0.0 if none."""
    best = 0.0
    for b in boxes:
        lateral = lateral_offset_m(b["xmin"], b["xmax"], b["ymin"], b["ymax"])
        if lateral is not None and abs(lateral) <= half_width_m:
            best = max(best, float(b["confidence"]))
    return best
