"""Rumore procedurale deterministico (Perlin 2D) accelerato con numba.

Tutte le funzioni lavorano su coordinate in metri, così il risultato non dipende dalla
risoluzione della griglia: cambiando dimensione del terreno le forme restano le stesse.
"""

from __future__ import annotations

import numpy as np
from numba import njit, prange


def make_perm(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    p = rng.permutation(256).astype(np.int32)
    return np.concatenate([p, p])


@njit(cache=True, inline="always")
def _fade(t):
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


@njit(cache=True, inline="always")
def _grad(h, x, y):
    # 8 direzioni a lunghezza unitaria
    h = h & 7
    if h == 0:
        return x + y
    if h == 1:
        return -x + y
    if h == 2:
        return x - y
    if h == 3:
        return -x - y
    if h == 4:
        return 1.41421356 * x
    if h == 5:
        return -1.41421356 * x
    if h == 6:
        return 1.41421356 * y
    return -1.41421356 * y


@njit(cache=True, inline="always")
def _perlin(perm, x, y):
    xf = np.floor(x)
    yf = np.floor(y)
    xi = int(xf) & 255
    yi = int(yf) & 255
    x -= xf
    y -= yf
    u = _fade(x)
    v = _fade(y)
    aa = perm[perm[xi] + yi]
    ab = perm[perm[xi] + yi + 1]
    ba = perm[perm[xi + 1] + yi]
    bb = perm[perm[xi + 1] + yi + 1]
    x1 = _grad(aa, x, y) + u * (_grad(ba, x - 1.0, y) - _grad(aa, x, y))
    x2 = _grad(ab, x, y - 1.0) + u * (_grad(bb, x - 1.0, y - 1.0) - _grad(ab, x, y - 1.0))
    return (x1 + v * (x2 - x1)) * 0.7071


@njit(cache=True, parallel=True)
def _fbm(perm, xs, ys, wavelength, octaves, lacunarity, gain, out):
    n = xs.size
    for i in prange(n):
        x = xs.flat[i] / wavelength
        y = ys.flat[i] / wavelength
        amp = 1.0
        total = 0.0
        norm = 0.0
        for o in range(octaves):
            # offset per ottava per evitare allineamenti tra ottave
            total += amp * _perlin(perm, x + 17.13 * o, y - 31.7 * o)
            norm += amp
            x *= lacunarity
            y *= lacunarity
            amp *= gain
        out.flat[i] = total / norm


@njit(cache=True, parallel=True)
def _ridged(perm, xs, ys, wavelength, octaves, lacunarity, gain, sharpness, out):
    """Ridged multifractal (Musgrave): creste affilate, valli larghe."""
    n = xs.size
    for i in prange(n):
        x = xs.flat[i] / wavelength
        y = ys.flat[i] / wavelength
        amp = 1.0
        weight = 1.0
        total = 0.0
        norm = 0.0
        for o in range(octaves):
            s = 1.0 - abs(_perlin(perm, x + 11.7 * o, y + 5.3 * o) * 1.6)
            if s < 0.0:
                s = 0.0
            s = s ** sharpness
            s *= weight
            weight = s * 1.6
            if weight > 1.0:
                weight = 1.0
            total += s * amp
            norm += amp
            x *= lacunarity
            y *= lacunarity
            amp *= gain
        out.flat[i] = total / norm


class Noise:
    """Generatore di campi di rumore con seme fisso."""

    def __init__(self, seed: int):
        self.seed = seed

    def _perm(self, salt: int) -> np.ndarray:
        return make_perm(self.seed * 7919 + salt)

    def fbm(self, xs, ys, wavelength, octaves=6, lacunarity=2.03, gain=0.5, salt=0):
        xs = np.ascontiguousarray(xs, dtype=np.float64)
        ys = np.ascontiguousarray(ys, dtype=np.float64)
        out = np.empty(xs.shape, dtype=np.float32)
        _fbm(self._perm(salt), xs, ys, float(wavelength), int(octaves), float(lacunarity), float(gain), out)
        return out

    def ridged(self, xs, ys, wavelength, octaves=7, lacunarity=2.05, gain=0.5, sharpness=2.0, salt=0):
        xs = np.ascontiguousarray(xs, dtype=np.float64)
        ys = np.ascontiguousarray(ys, dtype=np.float64)
        out = np.empty(xs.shape, dtype=np.float32)
        _ridged(self._perm(salt), xs, ys, float(wavelength), int(octaves), float(lacunarity), float(gain),
                float(sharpness), out)
        return out

    def warp(self, xs, ys, wavelength, amount, salt=0, octaves=4):
        """Domain warping: sposta le coordinate con due campi fBm."""
        dx = self.fbm(xs, ys, wavelength, octaves=octaves, salt=salt + 101)
        dy = self.fbm(xs + 5200.0, ys - 1300.0, wavelength, octaves=octaves, salt=salt + 202)
        return xs + amount * dx, ys + amount * dy
