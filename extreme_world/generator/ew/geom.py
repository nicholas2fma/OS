"""Geometria 2D: griglia del mondo, spline, campi di distanza da polilinee e poligoni."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import cKDTree


@dataclass(frozen=True)
class Grid:
    """Griglia regolare di vertici del terreno in coordinate mondo (metri).

    Il vertice [iy, ix] si trova in (x0 + ix*step, y0 + iy*step), esattamente come nel
    TerrainBlock (origine nell'angolo con x e y minimi)."""

    size: int
    step: float
    x0: float
    y0: float

    @classmethod
    def for_world(cls, terrain_size: int, square_size: float, size: int | None = None) -> "Grid":
        """Griglia centrata sull'origine; `size` permette risoluzioni ridotte con la stessa estensione."""
        size = size or terrain_size
        extent = terrain_size * square_size
        step = square_size * terrain_size / size
        return cls(size, step, -extent / 2.0, -extent / 2.0)

    @property
    def extent(self) -> float:
        return self.size * self.step

    def axes(self):
        xs = self.x0 + np.arange(self.size) * self.step
        ys = self.y0 + np.arange(self.size) * self.step
        return xs, ys

    def mesh(self, dtype=np.float64):
        xs, ys = self.axes()
        X, Y = np.meshgrid(xs.astype(dtype), ys.astype(dtype))
        return X, Y

    def to_index(self, x, y):
        """Coordinate mondo -> indici frazionari (ix, iy)."""
        return (np.asarray(x) - self.x0) / self.step, (np.asarray(y) - self.y0) / self.step

    def to_world(self, ix, iy):
        return self.x0 + np.asarray(ix) * self.step, self.y0 + np.asarray(iy) * self.step

    def sample(self, field: np.ndarray, x, y, order: int = 1):
        ix, iy = self.to_index(x, y)
        coords = np.vstack([np.ravel(iy), np.ravel(ix)])
        out = ndimage.map_coordinates(field, coords, order=order, mode="nearest")
        return out.reshape(np.shape(x))

    def window(self, xmin, ymin, xmax, ymax, pad=0.0):
        """Fetta di indici (sy, sx) che copre il rettangolo in coordinate mondo."""
        ix0, iy0 = self.to_index(xmin - pad, ymin - pad)
        ix1, iy1 = self.to_index(xmax + pad, ymax + pad)
        ix0 = int(np.clip(np.floor(ix0), 0, self.size))
        iy0 = int(np.clip(np.floor(iy0), 0, self.size))
        ix1 = int(np.clip(np.ceil(ix1) + 1, 0, self.size))
        iy1 = int(np.clip(np.ceil(iy1) + 1, 0, self.size))
        return slice(iy0, iy1), slice(ix0, ix1)

    def window_mesh(self, win):
        sy, sx = win
        xs = self.x0 + np.arange(sx.start, sx.stop) * self.step
        ys = self.y0 + np.arange(sy.start, sy.stop) * self.step
        return np.meshgrid(xs, ys)


def catmull_rom(points, spacing: float = 5.0, alpha: float = 0.5):
    """Spline Catmull-Rom centripeta attraverso i punti di controllo.

    Restituisce (P, t): punti campionati circa ogni `spacing` metri e, per ciascuno, l'indice
    frazionario del punto di controllo (per interpolare attributi definiti sui controlli)."""
    pts = np.asarray(points, dtype=np.float64)
    if len(pts) < 2:
        raise ValueError("servono almeno due punti")
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out_p = []
    out_t = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        d01 = max(np.linalg.norm(p1 - p0) ** alpha, 1e-6)
        d12 = max(np.linalg.norm(p2 - p1) ** alpha, 1e-6)
        d23 = max(np.linalg.norm(p3 - p2) ** alpha, 1e-6)
        t0, t1 = 0.0, d01
        t2 = t1 + d12
        t3 = t2 + d23
        seg_len = np.linalg.norm(p2 - p1)
        n = max(int(np.ceil(seg_len / spacing)), 1)
        ts = np.linspace(t1, t2, n, endpoint=False)[:, None]
        a1 = (t1 - ts) / (t1 - t0) * p0 + (ts - t0) / (t1 - t0) * p1
        a2 = (t2 - ts) / (t2 - t1) * p1 + (ts - t1) / (t2 - t1) * p2
        a3 = (t3 - ts) / (t3 - t2) * p2 + (ts - t2) / (t3 - t2) * p3
        b1 = (t2 - ts) / (t2 - t0) * a1 + (ts - t0) / (t2 - t0) * a2
        b2 = (t3 - ts) / (t3 - t1) * a2 + (ts - t1) / (t3 - t1) * a3
        c = (t2 - ts) / (t2 - t1) * b1 + (ts - t1) / (t2 - t1) * b2
        out_p.append(c)
        out_t.append(i + np.linspace(0, 1, n, endpoint=False))
    out_p.append(pts[-1:])
    out_t.append(np.array([len(pts) - 1.0]))
    return np.vstack(out_p), np.concatenate(out_t)


def resample_polyline(P: np.ndarray, spacing: float):
    """Ricampiona una polilinea a passo costante; restituisce (punti, ascissa curvilinea, indici sorgente frazionari)."""
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    total = s[-1]
    n = max(int(np.ceil(total / spacing)), 1)
    s_new = np.linspace(0.0, total, n + 1)
    src = np.interp(s_new, s, np.arange(len(P)))
    out = np.column_stack([np.interp(s_new, s, P[:, k]) for k in range(P.shape[1])])
    return out, s_new, src


def cumulative_length(P: np.ndarray) -> np.ndarray:
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P[:, :2], axis=0), axis=1))])


class PolylineField:
    """Interroga distanza, ascissa curvilinea e lato rispetto a una polilinea densa."""

    def __init__(self, P: np.ndarray):
        self.P = np.asarray(P, dtype=np.float64)[:, :2]
        self.s = cumulative_length(self.P)
        self.tree = cKDTree(self.P)
        d = np.diff(self.P, axis=0)
        self.seg_len = np.maximum(np.linalg.norm(d, axis=1), 1e-9)
        self.seg_dir = d / self.seg_len[:, None]

    @property
    def length(self) -> float:
        return float(self.s[-1])

    def query(self, x, y, max_dist: float = np.inf):
        """Per ogni punto: (distanza, ascissa s, offset laterale con segno: >0 a sinistra)."""
        shape = np.shape(x)
        q = np.column_stack([np.ravel(x), np.ravel(y)])
        _, idx = self.tree.query(q, distance_upper_bound=max_dist * 1.5 + 50.0 if np.isfinite(max_dist) else np.inf)
        valid = idx < len(self.P)
        idx = np.where(valid, idx, 0)
        best_d = np.full(len(q), np.inf)
        best_s = np.zeros(len(q))
        best_off = np.zeros(len(q))
        nseg = len(self.P) - 1
        for cand in (idx - 1, idx):
            k = np.clip(cand, 0, nseg - 1)
            a = self.P[k]
            dvec = self.seg_dir[k]
            rel = q - a
            t = np.clip(np.einsum("ij,ij->i", rel, dvec), 0.0, self.seg_len[k])
            foot = a + dvec * t[:, None]
            diff = q - foot
            dist = np.linalg.norm(diff, axis=1)
            side = dvec[:, 0] * rel[:, 1] - dvec[:, 1] * rel[:, 0]
            better = dist < best_d
            best_d = np.where(better, dist, best_d)
            best_s = np.where(better, self.s[k] + t, best_s)
            best_off = np.where(better, np.where(side >= 0, dist, -dist), best_off)
        best_d = np.where(valid, best_d, np.inf)
        return best_d.reshape(shape), best_s.reshape(shape), best_off.reshape(shape)

    def point_at(self, s):
        s = np.clip(np.asarray(s, dtype=np.float64), 0.0, self.length)
        x = np.interp(s, self.s, self.P[:, 0])
        y = np.interp(s, self.s, self.P[:, 1])
        return x, y

    def tangent_at(self, s):
        s = np.clip(np.asarray(s, dtype=np.float64), 0.0, self.length)
        k = np.clip(np.searchsorted(self.s, s, side="right") - 1, 0, len(self.seg_dir) - 1)
        return self.seg_dir[k]


def polygon_mask(grid: Grid, poly, oversample: int = 1) -> np.ndarray:
    """Maschera booleana [iy, ix] dei vertici dentro il poligono."""
    pts = np.asarray(poly, dtype=np.float64)
    ix, iy = grid.to_index(pts[:, 0], pts[:, 1])
    img = Image.new("L", (grid.size, grid.size), 0)
    ImageDraw.Draw(img).polygon(list(zip(ix.tolist(), iy.tolist())), fill=255)
    return np.asarray(img) > 127


def signed_distance(mask: np.ndarray, step: float) -> np.ndarray:
    """Distanza con segno in metri: negativa dentro la maschera, positiva fuori."""
    outside = ndimage.distance_transform_edt(~mask) * step
    inside = ndimage.distance_transform_edt(mask) * step
    return np.where(mask, -inside, outside).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def smooth_max(a, b, k):
    """Massimo morbido (raccordo di ampiezza k metri)."""
    h = np.clip(0.5 + 0.5 * (a - b) / k, 0.0, 1.0)
    return b + (a - b) * h + k * h * (1.0 - h)


def smooth_min(a, b, k):
    return -smooth_max(-a, -b, k)


def rotation_matrix_z(angle_rad: float):
    """Matrice 3x3 per righe come in items.level.json (rotazione attorno a Z)."""
    c, s = float(np.cos(angle_rad)), float(np.sin(angle_rad))
    return [c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0]
