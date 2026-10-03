"""Instradamento automatico di strade su terreno ripido (A* con direzione di marcia).

Lo stato è (cella, direzione tra 16): ogni passo può cambiare direzione al massimo di 22,5°,
quindi il raggio di curvatura minimo è garantito per costruzione. Il costo premia la
lunghezza breve e penalizza pendenze vicine al limite, pendenza trasversale (scavi e
riporti), curve, acqua e pareti. Sulle salite forti il percorso più economico diventa una
sequenza di tornanti, come nella progettazione reale.
"""

from __future__ import annotations

import numpy as np
from numba import njit
from scipy import ndimage

DIRS = np.array([(1, 0), (2, 1), (1, 1), (1, 2), (0, 1), (-1, 2), (-1, 1), (-2, 1),
                 (-1, 0), (-2, -1), (-1, -1), (-1, -2), (0, -1), (1, -2), (1, -1), (2, -1)], dtype=np.int64)


@njit(cache=True)
def _heap_push(hf, hs, size, f, s):
    i = size
    hf[i] = f
    hs[i] = s
    while i > 0:
        p = (i - 1) >> 1
        if hf[p] <= hf[i]:
            break
        tf = hf[p]
        ts = hs[p]
        hf[p] = hf[i]
        hs[p] = hs[i]
        hf[i] = tf
        hs[i] = ts
        i = p
    return size + 1


@njit(cache=True)
def _heap_pop(hf, hs, size):
    f = hf[0]
    s = hs[0]
    size -= 1
    hf[0] = hf[size]
    hs[0] = hs[size]
    i = 0
    while True:
        l = 2 * i + 1
        r = l + 1
        m = i
        if l < size and hf[l] < hf[m]:
            m = l
        if r < size and hf[r] < hf[m]:
            m = r
        if m == i:
            break
        tf = hf[m]
        ts = hs[m]
        hf[m] = hf[i]
        hs[m] = hs[i]
        hf[i] = tf
        hs[i] = ts
        i = m
    return f, s, size


@njit(cache=True)
def _astar(h, cost_mul, cell, sx, sy, gx, gy, max_grade, mult, w_grade, w_cross, w_turn, dirs, max_expand, z_target, w_z):
    H, W = h.shape
    N = H * W * 16
    g = np.full(N, np.inf, dtype=np.float32)
    parent = np.full(N, -1, dtype=np.int64)
    closed = np.zeros(N, dtype=np.uint8)
    cap = min(40_000_000, N * 3 + 1024)
    hf = np.empty(cap, dtype=np.float32)
    hs = np.empty(cap, dtype=np.int64)
    size = 0
    lens = np.empty(16)
    for k in range(16):
        lens[k] = np.sqrt(dirs[k, 0] ** 2 + dirs[k, 1] ** 2) * mult * cell
    for k in range(16):
        s = (sy * W + sx) * 16 + k
        g[s] = 0.0
        hgoal = np.sqrt((gx - sx) ** 2 + (gy - sy) ** 2) * cell
        size = _heap_push(hf, hs, size, hgoal, s)
    goal_state = -1
    expanded = 0
    while size > 0:
        f, s, size = _heap_pop(hf, hs, size)
        if closed[s]:
            continue
        closed[s] = 1
        expanded += 1
        if expanded > max_expand:
            break
        k = s % 16
        c = s // 16
        y = c // W
        x = c % W
        if abs(x - gx) <= mult and abs(y - gy) <= mult:
            goal_state = s
            break
        h0 = h[y, x]
        for dk in range(-1, 2):
            k2 = (k + dk) % 16
            nx = x + dirs[k2, 0] * mult
            ny = y + dirs[k2, 1] * mult
            if nx < 1 or ny < 1 or nx >= W - 1 or ny >= H - 1:
                continue
            cm = cost_mul[ny, nx]
            if cm <= 0.0:
                continue
            L = lens[k2]
            grade = abs(h[ny, nx] - h0) / L
            if grade > max_grade * 3.0:
                continue
            # pendenza trasversale al centro del passo
            mx = (x + nx) // 2
            my = (y + ny) // 2
            ddx = (h[my, mx + 1] - h[my, mx - 1]) / (2 * cell)
            ddy = (h[my + 1, mx] - h[my - 1, mx]) / (2 * cell)
            tx = dirs[k2, 0] * mult * cell / L
            ty = dirs[k2, 1] * mult * cell / L
            cross = abs(-ty * ddx + tx * ddy)
            ge = grade / max_grade
            step_cost = L * (1.0 + w_grade * ge ** 4 + w_cross * cross * cross) * cm
            if w_z > 0.0:
                step_cost += L * w_z * abs(h[ny, nx] - z_target) / 10.0
            if dk != 0:
                step_cost += w_turn
            s2 = (ny * W + nx) * 16 + k2
            ng = g[s] + step_cost
            if ng < g[s2]:
                g[s2] = ng
                parent[s2] = s
                hgoal = np.sqrt((gx - nx) ** 2 + (gy - ny) ** 2) * cell
                if size < cap:
                    size = _heap_push(hf, hs, size, ng + hgoal, s2)
    if goal_state < 0:
        return np.zeros((0, 2), dtype=np.int64), expanded
    path = []
    s = goal_state
    while s >= 0:
        c = s // 16
        path.append((c % W, c // W))
        s = parent[s]
    out = np.empty((len(path), 2), dtype=np.int64)
    for i in range(len(path)):
        out[i, 0] = path[len(path) - 1 - i][0]
        out[i, 1] = path[len(path) - 1 - i][1]
    return out, expanded


def route(grid, h, start, goal, max_grade, min_radius=10.0, cell=4.0, margin=500.0, avoid=None,
          w_grade=4.0, w_cross=6.0, w_turn=3.0, max_expand=30_000_000, z_target=0.0, w_z=0.0):
    """Calcola un percorso tra due punti mondo. Restituisce una polilinea (N, 2) in metri."""
    step = grid.step
    factor = max(1, int(round(cell / step)))
    cell = step * factor
    xs = [start[0], goal[0]]
    ys = [start[1], goal[1]]
    win = grid.window(min(xs), min(ys), max(xs), max(ys), pad=margin)
    sy, sx = win
    # il rumore fine del terreno verrebbe comunque assorbito da scavi e riporti
    sub = ndimage.gaussian_filter(h[sy, sx].astype(np.float32), 5.0 / step)[::factor, ::factor]
    cm = np.ones(sub.shape, dtype=np.float32)
    if avoid is not None:
        cm = avoid[sy, sx][::factor, ::factor].astype(np.float32)
    ox = grid.x0 + sx.start * step
    oy = grid.y0 + sy.start * step
    sxi = int(round((start[0] - ox) / cell))
    syi = int(round((start[1] - oy) / cell))
    gxi = int(round((goal[0] - ox) / cell))
    gyi = int(round((goal[1] - oy) / cell))
    mult = max(1, int(round(min_radius / (2.56 * cell))))
    path, expanded = _astar(sub, cm, float(cell), sxi, syi, gxi, gyi, float(max_grade), int(mult),
                            float(w_grade), float(w_cross), float(w_turn), DIRS, int(max_expand), float(z_target), float(w_z))
    if len(path) == 0:
        raise RuntimeError(f"nessun percorso trovato da {start} a {goal} (stati espansi: {expanded})")
    P = np.column_stack([ox + path[:, 0] * cell, oy + path[:, 1] * cell]).astype(np.float64)
    P[0] = start
    P[-1] = goal
    return P


def chaikin(P: np.ndarray, iterations: int = 2) -> np.ndarray:
    """Smussa gli spigoli di una polilinea mantenendo gli estremi."""
    for _ in range(iterations):
        Q = 0.75 * P[:-1] + 0.25 * P[1:]
        R = 0.25 * P[:-1] + 0.75 * P[1:]
        mid = np.empty((2 * len(Q), P.shape[1]))
        mid[0::2] = Q
        mid[1::2] = R
        P = np.vstack([P[:1], mid, P[-1:]])
    return P


def switchbacks(grid, h, start, end, grade, width, min_radius, first_side=1.0, spacing=2.0, seed=0,
                width_jitter=0.22, follow_contours=True):
    """Tornanti sovrapposti tra `start` (in basso) e `end` (in alto).

    I tratti corrono di traverso al pendio (perpendicolari alla linea start->end) e sono
    collegati da tornanti semicircolari. Il numero di tornanti è il minimo che permette di
    superare il dislivello con la pendenza `grade`. Le lunghezze dei tratti variano e il
    tracciato viene spostato lungo il pendio per seguire le curve di livello: niente
    "pettine" geometrico."""
    rng = np.random.default_rng(seed)
    start = np.asarray(start, dtype=np.float64)
    end = np.asarray(end, dtype=np.float64)
    u = end - start
    D = float(np.linalg.norm(u))
    u /= D
    v = np.array([-u[1], u[0]])
    h0 = float(grid.sample(h, start[0], start[1]))
    dh = float(grid.sample(h, end[0], end[1]) - h0)
    n = int(np.ceil(max(abs(dh) - np.pi * D * grade / 2.0, 0.0) / (width * grade * (1 - width_jitter * 0.5))))
    n = max(n, 1)
    a = D / n
    if a / 2.0 < min_radius:
        raise RuntimeError(f"tornanti troppo stretti: raggio {a / 2:.1f} m < {min_radius} m; allargare il corridoio")
    # estremi dei tratti: ogni tornante ha una sua posizione laterale
    ext = width / 2.0 * (1.0 + width_jitter * rng.uniform(-1, 1, size=n + 2))
    pts = [start]
    side = first_side
    for k in range(n + 1):
        uk = k * a
        v0 = 0.0 if k == 0 else -side * ext[k]
        v1 = 0.0 if k == n else side * ext[k + 1]
        m = max(2, int(abs(v1 - v0) / spacing))
        for t in np.linspace(0, 1, m)[1:]:
            pts.append(start + u * uk + v * (v0 + (v1 - v0) * t))
        if k < n:
            c = start + u * (uk + a / 2.0) + v * (side * ext[k + 1])
            m = max(6, int(np.pi * a / 2.0 / spacing))
            for th in np.linspace(-np.pi / 2, np.pi / 2, m)[1:-1]:
                pts.append(c + v * (side * np.cos(th) * a / 2.0) + u * (np.sin(th) * a / 2.0))
            side = -side
    pts.append(end)
    P = np.array(pts)
    if follow_contours and n > 1:
        # quota desiderata lungo il percorso (salita uniforme) e spostamento lungo il pendio
        seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
        sP = np.concatenate([[0.0], np.cumsum(seg)])
        zdes = h0 + dh * sP / sP[-1]
        hs = ndimage.gaussian_filter(h, 6.0 / grid.step)
        cand = np.linspace(-0.28 * a, 0.28 * a, 15)
        best = np.zeros(len(P))
        for i in range(1, len(P) - 1):
            q = P[i][None, :] + u[None, :] * cand[:, None]
            err = np.abs(grid.sample(hs, q[:, 0], q[:, 1]) - zdes[i])
            best[i] = cand[np.argmin(err)]
        best = ndimage.gaussian_filter1d(best, 12.0, mode="nearest")
        taper = np.minimum(1.0, np.minimum(sP, sP[-1] - sP) / 40.0)
        P = P + u[None, :] * (best * taper)[:, None]
    return P, n
