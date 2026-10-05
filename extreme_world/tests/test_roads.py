"""Test della geometria stradale: tornanti posati sul terreno e allargamenti delle piazzole."""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "generator"))

from ew.geom import Grid  # noqa: E402
from ew.roads import router  # noqa: E402
from ew.roads.network import Road  # noqa: E402


def _slope(n=512, step=2.0, rise=0.45):
    """Pendio piano che sale verso nord con pendenza `rise`."""
    g = Grid.for_world(n, step)
    Y = g.y0 + np.arange(n)[:, None] * step + np.zeros((1, n))
    return g, (Y - g.y0) * rise


def test_contour_switchbacks_follow_slope():
    g, h = _slope()
    start = np.array([0.0, -300.0])
    end = np.array([0.0, 150.0])
    grade = 0.09
    P, turns = router.contour_switchbacks(g, h, start, end, grade=grade, width=200.0, min_radius=11.0, sep=12.0)
    assert turns >= 3
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    z = g.sample(h, P[:, 0], P[:, 1])
    # la quota del terreno sotto il tracciato cresce al più con la pendenza voluta (con un margine
    # per le giunzioni dei tornanti): la strada sale lungo il pendio senza tagliarlo
    win = s > 40.0
    k = np.nonzero(win)[0]
    rate = (z[k[-1]] - z[k[0]]) / (s[k[-1]] - s[k[0]])
    assert rate < grade * 1.15
    # nessun punto oltre la metà della larghezza del corridoio più il raggio del tornante
    assert np.abs(P[:, 0]).max() < 100.0 + 2 * 11.0 + 30.0
    # niente inversioni di marcia secche: angolo fra passi consecutivi sempre sotto i 60°
    d = np.diff(P, axis=0)
    d = d[np.linalg.norm(d, axis=1) > 0.5]
    a = np.arctan2(d[:, 1], d[:, 0])
    turn = np.abs((np.diff(a) + np.pi) % (2 * np.pi) - np.pi)
    assert np.degrees(turn).max() < 60.0


def test_bay_ext_profile():
    r = Road("T", "T", "local", {"width": 6.0, "verge": 1.0}, {})
    r.bays = [{"side": -1.0, "s0": 100.0, "s1": 140.0, "taper": 20.0, "width": 3.0, "kind": "emergenza"}]
    s = np.array([70.0, 80.0, 90.0, 100.0, 120.0, 140.0, 150.0, 160.0, 175.0])
    right = r.bay_ext(s, np.full(len(s), -1.0))
    left = r.bay_ext(s, np.full(len(s), 1.0))
    assert np.allclose(left, 0.0)                       # solo sul lato della piazzola
    assert right[0] == 0.0 and right[-1] == 0.0         # fuori dai raccordi
    assert np.allclose(right[3:6], 3.0)                 # larghezza piena nel tratto
    assert 0.0 < right[2] < 3.0 and 0.0 < right[6] < 3.0  # raccordi graduali
    assert np.all(np.diff(right[:4]) >= 0) and np.all(np.diff(right[5:]) <= 0)
