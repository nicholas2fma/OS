"""Erosione idraulica (simulazione a gocce) ed erosione termica (frane/detriti).

L'erosione idraulica scava canaloni e reti di drenaggio e deposita sedimenti nelle valli;
quella termica fa franare i pendii oltre l'angolo di riposo creando coni di detriti ai
piedi delle pareti. Una maschera di "durezza" permette di proteggere le pareti rocciose che
devono restare quasi verticali.
"""

from __future__ import annotations

import numpy as np
from numba import njit


@njit(cache=True)
def _height_grad(h, x, y):
    n = h.shape[0]
    ix = int(x)
    iy = int(y)
    if ix < 0:
        ix = 0
    if iy < 0:
        iy = 0
    if ix > n - 2:
        ix = n - 2
    if iy > n - 2:
        iy = n - 2
    u = x - ix
    v = y - iy
    h00 = h[iy, ix]
    h10 = h[iy, ix + 1]
    h01 = h[iy + 1, ix]
    h11 = h[iy + 1, ix + 1]
    gx = (h10 - h00) * (1 - v) + (h11 - h01) * v
    gy = (h01 - h00) * (1 - u) + (h11 - h10) * u
    hh = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v
    return hh, gx, gy


@njit(cache=True)
def hydraulic_erosion(h, hardness, n_drops, seed, cell_size,
                      inertia=0.08, capacity=6.0, min_capacity=0.01, erode_rate=0.35,
                      deposit_rate=0.25, evaporation=0.02, gravity=9.0, max_steps=96, radius=2):
    """Erosione a gocce su griglia `h` (metri). `hardness` in [0,1]: 1 = roccia non erodibile."""
    n = h.shape[0]
    np.random.seed(seed)
    # pesi del pennello di erosione
    size = 2 * radius + 1
    brush = np.zeros((size, size))
    s = 0.0
    for by in range(size):
        for bx in range(size):
            d = np.sqrt((bx - radius) ** 2 + (by - radius) ** 2)
            if d <= radius:
                w = 1.0 - d / (radius + 1e-6)
                brush[by, bx] = w
                s += w
    brush /= s
    for _ in range(n_drops):
        x = np.random.random() * (n - 3) + 1
        y = np.random.random() * (n - 3) + 1
        dx = 0.0
        dy = 0.0
        speed = 1.0
        water = 1.0
        sediment = 0.0
        for _step in range(max_steps):
            ix = int(x)
            iy = int(y)
            u = x - ix
            v = y - iy
            hh, gx, gy = _height_grad(h, x, y)
            # le pendenze sono in metri per cella: convertite in pendenza reale
            dx = dx * inertia - gx * (1 - inertia)
            dy = dy * inertia - gy * (1 - inertia)
            ln = np.sqrt(dx * dx + dy * dy)
            if ln < 1e-9:
                break
            dx /= ln
            dy /= ln
            x += dx
            y += dy
            if x < 1 or y < 1 or x > n - 3 or y > n - 3:
                break
            nh, _, _ = _height_grad(h, x, y)
            dh = nh - hh
            slope = max(-dh / cell_size, 0.0)
            cap = max(slope * speed * water * capacity, min_capacity)
            if sediment > cap or dh > 0:
                # deposito (anche per riempire buche quando si risale)
                if dh > 0:
                    amount = min(dh, sediment)
                else:
                    amount = (sediment - cap) * deposit_rate
                sediment -= amount
                h[iy, ix] += amount * (1 - u) * (1 - v)
                h[iy, ix + 1] += amount * u * (1 - v)
                h[iy + 1, ix] += amount * (1 - u) * v
                h[iy + 1, ix + 1] += amount * u * v
            else:
                amount = min((cap - sediment) * erode_rate, -dh)
                if amount > 0:
                    soft = 1.0 - hardness[iy, ix]
                    amount *= soft
                    for by in range(size):
                        for bx in range(size):
                            w = brush[by, bx]
                            if w == 0.0:
                                continue
                            yy = iy + by - radius
                            xx = ix + bx - radius
                            if yy < 0 or xx < 0 or yy >= n or xx >= n:
                                continue
                            d = amount * w
                            h[yy, xx] -= d
                    sediment += amount
            speed = np.sqrt(max(speed * speed + (-dh) * gravity / cell_size * 0.5, 0.0))
            if speed > 12.0:
                speed = 12.0
            water *= 1 - evaporation
            if water < 0.01:
                break
    return h


@njit(cache=True)
def thermal_erosion(h, talus, hardness, iterations, cell_size, rate=0.5):
    """Sposta materiale verso il vicino più basso dove la pendenza supera `talus` (tan angolo).
    `hardness` alza localmente l'angolo di riposo (pareti rocciose)."""
    n = h.shape[0]
    dirs_y = np.array([-1, 1, 0, 0, -1, -1, 1, 1])
    dirs_x = np.array([0, 0, -1, 1, -1, 1, -1, 1])
    dist = np.array([1.0, 1.0, 1.0, 1.0, 1.41421356, 1.41421356, 1.41421356, 1.41421356])
    for _ in range(iterations):
        for y in range(1, n - 1):
            for x in range(1, n - 1):
                hc = h[y, x]
                t = talus + hardness[y, x] * 4.0
                best = 0.0
                bi = -1
                for k in range(8):
                    d = (hc - h[y + dirs_y[k], x + dirs_x[k]]) / (dist[k] * cell_size)
                    if d > best:
                        best = d
                        bi = k
                if bi >= 0 and best > t:
                    excess = (best - t) * dist[bi] * cell_size
                    amount = excess * 0.5 * rate
                    h[y, x] -= amount
                    h[y + dirs_y[bi], x + dirs_x[bi]] += amount
    return h
