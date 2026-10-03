"""Test delle primitive mesh: facce orientate verso l'esterno e normali coerenti con l'ordine
dei vertici (in BeamNG, come in ogni motore con back-face culling, una faccia con l'ordine
sbagliato sparisce)."""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "generator"))

from ew.mesh.collada import Mesh  # noqa: E402


def test_box_outward():
    m = Mesh()
    m.add_box("x", (10, -3, 2), (2, 3, 4), yaw=0.7)
    assert m.winding_consistency() == 1.0
    assert abs(m.signed_volume() - 24.0) < 1e-6


def test_prism_outward():
    m = Mesh()
    m.prism("x", (0, 0, 0), 1.0, 2.0, sides=12, top=True)
    assert m.winding_consistency() == 1.0


def test_sweep_closed_profile_outward():
    path = np.array([[0, 0, 0], [5, 0, 0], [10, 2, 0.5]], dtype=float)
    prof = [(-0.25, 0.0), (0.25, 0.0), (0.25, 1.0), (-0.25, 1.0)]   # antiorario (laterale, quota)
    m = Mesh()
    m.sweep("x", path, prof, closed_profile=True)
    assert m.winding_consistency() == 1.0
    # profilo antiorario e normali verso l'esterno: il volume (senza tappi) resta positivo
    assert m.signed_volume() > 0


def test_sweep_tunnel_inward():
    path = np.array([[0, 0, 0], [20, 0, 0]], dtype=float)
    R = 5.0
    arc = [(-R * np.cos(a), 5 + 2 * np.sin(a)) for a in np.linspace(0, np.pi, 9)]
    prof = [(-R, 0), (-R, 5)] + arc[1:-1] + [(R, 5), (R, 0)]
    m = Mesh()
    m.sweep("x", path, prof)
    assert m.winding_consistency() == 1.0
    # le normali dei piedritti guardano verso l'asse della galleria
    N = np.vstack(m.parts["x"]["n"])
    P = np.vstack(m.parts["x"]["p"])
    inward = np.einsum("ij,ij->i", N[:, :2], -P[:, :2] * np.array([0, 1]))
    assert (inward >= -1e-9).mean() > 0.95
