"""Acqua: canyon, laghi, invaso con diga, fiumi e copertura con WaterBlock.

Tutto lavora sulla heightmap a piena risoluzione e solo dentro finestre attorno a ogni
elemento, così resta veloce anche a 4096x4096.
"""

from __future__ import annotations

import numpy as np
from numba import njit
from scipy import ndimage

from .geom import Grid, PolylineField, catmull_rom, smoothstep
from .noise import Noise
from .terrain import PolyFeature


def log(msg):
    print(f"[acqua] {msg}", flush=True)


class WaterBuilder:
    def __init__(self, landforms: dict, noise: Noise):
        self.lf = landforms
        self.noise = noise
        self.lakes = {}       # nome -> dict(level, center, ...)
        self.rivers = []      # dict(name, P (Nx3 superficie), width)
        self.dam = None

    # --------------------------------------------------------------- canyon
    def carve_canyons(self, g: Grid, h: np.ndarray) -> np.ndarray:
        rock = np.zeros(h.shape, dtype=np.float32)
        for c in self.lf.get("canyons", []):
            feat = PolyFeature(c["line"], spacing=3.0)
            P = feat.P
            pad = c["top_width"] + 150
            win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=pad)
            X, Y = g.window_mesh(win)
            wx, wy = self.noise.warp(X, Y, 420.0, c.get("meander", 40.0), salt=301)
            d, s, off = feat.field.query(wx, wy, max_dist=pad)
            floor = feat.attr(c["floor"], s)
            fw = c["floor_width"]
            tw = c["top_width"] * (1.0 + 0.25 * self.noise.fbm(X, Y, 300.0, octaves=3, salt=302))
            u = np.clip((d - fw / 2.0) / np.maximum((tw - fw) / 2.0, 1.0), 0.0, 1.5)
            u = u + 0.08 * self.noise.fbm(X, Y, 90.0, octaves=3, salt=303)
            k = c.get("terraces", 3)
            uk = np.clip(u, 0, None) * k
            fl = np.floor(uk)
            stair = (fl + smoothstep(0.0, 0.38, uk - fl)) / k
            target = floor + 420.0 * stair
            target = np.where(d < fw / 2.0, floor + 0.15 * self.noise.fbm(X, Y, 30.0, octaves=2, salt=304), target)
            sub = h[win]
            cut = target < sub
            sub[:] = np.where(cut, target, sub)
            rock[win] = np.maximum(rock[win], (cut & (d > fw / 2.0 + 2.0)).astype(np.float32))
            log(f"canyon {c['name']}: lunghezza {feat.field.length:.0f} m")
        return h, rock

    # ----------------------------------------------------------------- laghi
    def _lake_rho(self, g, win, lk):
        X, Y = g.window_mesh(win)
        cx, cy = lk["center"]
        a, b = lk["axes"]
        # coordinate deformate: golfi e promontori invece di un'ellisse regolare
        wx, wy = self.noise.warp(X, Y, 0.9 * a, 0.22 * b + 0.06 * a, salt=312)
        ang = np.deg2rad(lk.get("rot_deg", 0.0))
        u = (wx - cx) * np.cos(ang) + (wy - cy) * np.sin(ang)
        v = -(wx - cx) * np.sin(ang) + (wy - cy) * np.cos(ang)
        rho = np.sqrt((u / a) ** 2 + (v / b) ** 2)
        sn = lk.get("shore_noise", 0.15)
        rho = rho * (1.0 + sn * self.noise.fbm(X, Y, 0.5 * b + 60.0, octaves=5, salt=311))
        return rho

    def carve_lakes(self, g: Grid, h: np.ndarray) -> np.ndarray:
        for lk in self.lf.get("lakes", []):
            if lk.get("reservoir"):
                continue
            cx, cy = lk["center"]
            a = max(lk["axes"]) * 1.6
            win = g.window(cx - a, cy - a, cx + a, cy + a)
            rho = self._lake_rho(g, win, lk)
            level = lk["level"]
            sub = h[win]
            inside = rho < 1.0
            bed = level - 0.6 - lk["depth"] * (1.0 - np.clip(rho, 0, 1) ** 2) ** 0.7
            sub[:] = np.where(inside, np.minimum(sub, bed), sub)
            # sponda chiusa: subito fuori dal lago il terreno sale sopra il livello, con un
            # raccordo graduale (soglia naturale, non un argine)
            rim = level + 0.5 + (rho - 1.0) * 40.0
            w = smoothstep(1.7, 1.0, rho) * (rho >= 1.0)
            sub[:] = sub + w * np.maximum(rim - sub, 0.0)
            self.lakes[lk["name"]] = {"level": level, "center": (cx, cy), "window": win, "kind": "lake",
                                      "block_angle": float(lk.get("rot_deg", 0.0))}
            log(f"lago {lk['name']}: livello {level} m")
        return h

    def carve_reservoir(self, g: Grid, h: np.ndarray) -> np.ndarray:
        for lk in self.lf.get("lakes", []):
            if not lk.get("reservoir"):
                continue
            dam = lk["dam"]
            ax, ay = dam["a"]
            bx, by = dam["b"]
            level = lk["level"]
            # approfondisce leggermente l'invaso a monte della diga (fondovalle allagato)
            v = next(v for v in self.lf["valleys"] if v["name"] == lk["valley"])
            feat = PolyFeature(v["line"], spacing=4.0)
            P = feat.P
            win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=400)
            X, Y = g.window_mesh(win)
            d, s, _ = feat.field.query(X, Y, max_dist=500)
            # lato a monte della diga: prodotto vettoriale rispetto alla linea della diga
            upstream = ((bx - ax) * (Y - ay) - (by - ay) * (X - ax)) > 0
            sub = h[win]
            deepen = upstream & (sub < level) & (d < 260)
            sub[:] = np.where(deepen, sub - 6.0 * smoothstep(260, 40, d), sub)
            self.dam = {"a": (ax, ay), "b": (bx, by), "crest": dam["crest"], "base": dam["base"], "level": level,
                        "name": lk["name"]}
            seed = feat.field.point_at(feat.field.length * 0.35)
            self.lakes[lk["name"]] = {"level": level, "center": (float(seed[0]), float(seed[1])), "window": win,
                                      "kind": "reservoir", "upstream_of": ((ax, ay), (bx, by)),
                                      "block_angle": float(np.degrees(np.arctan2(by - ay, bx - ax)))}
            log(f"invaso {lk['name']}: livello {level} m, diga da {dam['base']} a {dam['crest']} m")
        return h

    # ---------------------------------------------------------------- fiumi
    def carve_rivers(self, g: Grid, h: np.ndarray) -> np.ndarray:
        for rv in self.lf.get("rivers", []):
            P, t = catmull_rom(rv["line"], spacing=4.0)
            # resta dentro la mappa
            lim = g.x0 + 8, g.x0 + g.extent - 10
            keep = (P[:, 0] > lim[0]) & (P[:, 0] < lim[1]) & (P[:, 1] > lim[0]) & (P[:, 1] < lim[1])
            P, t = P[keep], t[keep]
            field = PolylineField(P)
            width = np.interp(t, np.arange(len(rv["width"])), rv["width"])
            ground = g.sample(h, P[:, 0], P[:, 1])
            # profilo della superficie: mai in salita lungo la corrente
            start = None
            if rv.get("from_lake"):
                start = self.lakes[rv["from_lake"]]["level"]
            elif rv.get("from_dam") and self.dam:
                start = self.dam["base"] + 1.0
            surf = ndimage.uniform_filter1d(ground - 0.6, 25, mode="nearest")
            if start is not None:
                surf[0] = min(surf[0], start)
            surf = np.minimum.accumulate(surf)
            surf = ndimage.uniform_filter1d(surf, 15, mode="nearest")
            surf = np.minimum.accumulate(surf)
            depth = rv.get("depth", 1.2)
            pad = width.max() * 0.5 + 40
            win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=pad)
            X, Y = g.window_mesh(win)
            d, s, _ = field.query(X, Y, max_dist=pad)
            si = np.clip(np.searchsorted(field.s, s), 0, len(P) - 1)
            ws = width[si] / 2.0
            zs = surf[si]
            bed = zs - depth * (1.0 - np.clip(d / np.maximum(ws, 0.5), 0, 1) ** 2) - 0.1
            bank = zs + 0.35 + np.maximum(d - ws, 0.0) * 0.38
            target = np.where(d <= ws, bed, bank)
            sub = h[win]
            near = d < pad
            sub[:] = np.where(near, np.minimum(sub, target), sub)
            P3 = np.column_stack([P, surf])
            # dentro i laghi il fiume non serve
            self.rivers.append({"name": rv["name"], "P": P3, "width": width, "depth": depth,
                                "from_lake": rv.get("from_lake"), "from_dam": rv.get("from_dam")})
            log(f"fiume {rv['name']}: {field.length:.0f} m, da {surf[0]:.0f} a {surf[-1]:.0f} m")
        return h

    # ---------------------------------------------------------- maschere acqua
    def lake_masks(self, g: Grid, h: np.ndarray) -> dict:
        """Maschere finali dell'acqua ferma, calcolate sul terreno definitivo (dopo le strade)."""
        return {name: {"mask": lake_mask(g, h, lk), "level": lk["level"], "kind": lk["kind"]}
                for name, lk in self.lakes.items()}


def lake_mask(g: Grid, h: np.ndarray, lk: dict) -> np.ndarray:
    """Componente connessa sotto il livello che contiene il centro del lago (a monte della diga
    per gli invasi)."""
    level = lk["level"]
    win = lk["window"]
    sub = h[win]
    below = sub < level
    if lk["kind"] == "reservoir":
        (ax, ay), (bx, by) = lk["upstream_of"]
        X, Y = g.window_mesh(win)
        below &= ((bx - ax) * (Y - ay) - (by - ay) * (X - ax)) > 0
    lab, nlab = ndimage.label(below)
    cx, cy = lk["center"]
    ix, iy = g.to_index(cx, cy)
    iy0 = int(round(float(iy))) - win[0].start
    ix0 = int(round(float(ix))) - win[1].start
    target = lab[iy0, ix0] if 0 <= iy0 < lab.shape[0] and 0 <= ix0 < lab.shape[1] else 0
    if target == 0 and nlab:
        sizes = ndimage.sum(below, lab, range(1, nlab + 1))
        target = int(np.argmax(sizes)) + 1
    m = np.zeros(h.shape, dtype=bool)
    m[win] = lab == target
    return m


@njit(cache=True)
def _best_rect(allowed, weight):
    """Rettangolo interamente in `allowed` con la massima somma di `weight` (O(R^2 C))."""
    R, C = allowed.shape
    best = 0.0
    br = (0, 0, 0, 0)
    colok = np.empty(C, dtype=np.bool_)
    colw = np.empty(C)
    for r0 in range(R):
        for c in range(C):
            colok[c] = True
            colw[c] = 0.0
        for r1 in range(r0, R):
            any_ok = False
            for c in range(C):
                colok[c] = colok[c] and allowed[r1, c]
                colw[c] += weight[r1, c]
                any_ok = any_ok or colok[c]
            if not any_ok:
                break
            run = 0.0
            start = 0
            for c in range(C):
                if not colok[c]:
                    run = 0.0
                    start = c + 1
                    continue
                if run <= 0.0:
                    run = 0.0
                    start = c
                run += colw[c]
                if run > best:
                    best = run
                    br = (r0, r1 + 1, start, c + 1)
    return best, br


def water_blocks_for_mask(g: Grid, h: np.ndarray, mask: np.ndarray, level: float, angle_deg: float = 0.0,
                          cell: float = 8.0, max_blocks: int = 14, min_gain: float = 0.004):
    """Copre il lago con pochi rettangoli (eventualmente ruotati di angle_deg) che non toccano
    mai terreno sotto il livello fuori dal lago. Restituisce dict con centro, dimensioni, angolo
    e la frazione di lago coperta."""
    allowed_f = mask | (h >= level + 0.05)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return [], 0.0
    wx, wy = g.to_world(xs, ys)
    ang = np.deg2rad(angle_deg)
    ca, sa = np.cos(ang), np.sin(ang)
    cx0, cy0 = float(wx.mean()), float(wy.mean())
    u = (wx - cx0) * ca + (wy - cy0) * sa
    v = -(wx - cx0) * sa + (wy - cy0) * ca
    pad = 2 * cell
    u0, u1 = u.min() - pad, u.max() + pad
    v0, v1 = v.min() - pad, v.max() + pad
    nu = int(np.ceil((u1 - u0) / cell))
    nv = int(np.ceil((v1 - v0) / cell))
    # 3x3 campioni per cella grossa: la cella è ammessa solo se lo sono tutti
    sub = 3
    allowed = np.ones((nv, nu), dtype=bool)
    lake = np.zeros((nv, nu), dtype=np.float64)
    for i in range(sub):
        for j in range(sub):
            uu = u0 + (np.arange(nu) + (j + 0.5) / sub) * cell
            vv = v0 + (np.arange(nv) + (i + 0.5) / sub) * cell
            UU, VV = np.meshgrid(uu, vv)
            X = cx0 + UU * ca - VV * sa
            Y = cy0 + UU * sa + VV * ca
            ix, iy = g.to_index(X, Y)
            ix = np.clip(np.rint(ix).astype(int), 0, g.size - 1)
            iy = np.clip(np.rint(iy).astype(int), 0, g.size - 1)
            allowed &= allowed_f[iy, ix]
            lake += mask[iy, ix]
    lake /= sub * sub
    total = lake.sum()
    uncovered = lake.copy()
    rects = []
    for _ in range(max_blocks):
        gain, (r0, r1, c0, c1) = _best_rect(allowed, uncovered)
        if gain < min_gain * total:
            break
        uncovered[r0:r1, c0:c1] = 0.0
        rects.append((r0, r1, c0, c1))
    out = []
    for r0, r1, c0, c1 in rects:
        uc = u0 + (c0 + c1) / 2.0 * cell
        vc = v0 + (r0 + r1) / 2.0 * cell
        out.append({"center": (cx0 + uc * ca - vc * sa, cy0 + uc * sa + vc * ca),
                    "size": ((c1 - c0) * cell, (r1 - r0) * cell), "angle_deg": angle_deg})
    coverage = 1.0 - uncovered.sum() / max(total, 1e-9)
    return out, float(coverage)


def apply_flats(lf: dict, noise: Noise, g: Grid, h: np.ndarray) -> np.ndarray:
    """Spianate per centri abitati e aree industriali (raccordate al rilievo circostante)."""
    n = noise
    for f in lf.get("flats", []):
        cx, cy = f["center"]
        r = f["radius"]
        win = g.window(cx - r * 1.6, cy - r * 1.6, cx + r * 1.6, cy + r * 1.6)
        X, Y = g.window_mesh(win)
        d = np.hypot(X - cx, Y - cy) * (1.0 + 0.18 * n.fbm(X, Y, 400.0, octaves=3, salt=401))
        w = smoothstep(r * 1.5, r * 0.75, d)
        height = f.get("height", "auto")
        if height == "auto":
            # quota media del sito: la spianata non scava fosse né crea rilievi
            height = float(np.median(h[win][d < r])) + f.get("offset", 0.0)
        f["_height"] = height
        target = height + f.get("roughness", 0.8) * n.fbm(X, Y, 120.0, octaves=3, salt=402)
        sub = h[win]
        sub[:] = sub * (1 - w) + target * w
    return h
