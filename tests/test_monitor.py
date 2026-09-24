"""The safety monitor must score distance to the PEDESTRIAN only - the
scenario also contains a roadside VendingMachine ~3.5 m from the lane
centre, which the old "all other objects" check flagged on every drive-by."""

import math

import pytest

from scripts.analysis import telemetry
from scripts.simulations.util import SAFETY_MARGIN_M, MyMonitor, _pedestrian_indices


class _P:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def distanceTo(self, other):
        return math.hypot(self.x - other.x, self.y - other.y)


# Stand-ins for the Scenic classes; only the class *name* matters to the monitor.
class Car:
    pass


class Pedestrian:
    pass


class VendingMachine:
    pass


class _Result:
    def __init__(self, trajectory, speeds):
        self.trajectory = trajectory
        self.records = {"ego_speed": list(enumerate(speeds))}
        self.terminationReason = "test"


class _Sim:
    timestep = 0.1

    def __init__(self, objects, trajectory, speeds):
        self.objects = objects
        self.result = _Result(trajectory, speeds)


def _drive_by(ped_offset):
    """Ego drives along +y past a vending machine at x=3.5 and a pedestrian
    at lateral offset `ped_offset`, both level with y=12."""
    objects = [Car(), Pedestrian(), VendingMachine()]
    trajectory, speeds = [], []
    for step in range(30):
        y = step * 1.0
        trajectory.append((_P(0, y), _P(ped_offset, 12), _P(3.5, 12)))
        speeds.append(7.5)
    return _Sim(objects, trajectory, speeds)


def test_pedestrian_indices_by_class_name():
    assert _pedestrian_indices([Car(), Pedestrian(), VendingMachine()]) == [1]
    assert _pedestrian_indices([Car(), VendingMachine()]) == []


def test_vending_machine_alone_does_not_fail(tmp_path):
    telemetry.clear()
    sim = _drive_by(ped_offset=20)  # pedestrian far away, prop 3.5 m off
    rho = MyMonitor().evaluate(sim)
    assert rho > 0  # passes: 20 - 5 = 15 margin from the pedestrian


def test_close_pedestrian_fails(tmp_path):
    telemetry.clear()
    sim = _drive_by(ped_offset=3.0)
    rho = MyMonitor().evaluate(sim)
    assert rho == pytest.approx(3.0 - SAFETY_MARGIN_M)


def test_monitor_logs_telemetry_row(tmp_path):
    telemetry.set_run("r", str(tmp_path))
    telemetry.begin_scenario(0, "p", {"pedestrian": "Adult"})
    telemetry.begin_simulation()
    try:
        MyMonitor().evaluate(_drive_by(ped_offset=3.0))
    finally:
        telemetry.clear()
    with open(tmp_path / telemetry.CSV_NAME) as f:
        header, row = f.read().splitlines()[:2]
    assert "min_distance_m" in header
    assert ",False," in row  # passed = False
    assert "3.0" in row  # min distance to the pedestrian, not 3.5 to the prop


def test_none_simulation_returns_none():
    assert MyMonitor().evaluate(None) is None
