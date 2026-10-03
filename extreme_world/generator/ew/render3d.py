"""Vista prospettica del terreno (ray-marching su heightmap) per controlli visivi e anteprime.

Non è il motore di BeamNG: serve a giudicare forme, scale e pendenze dal punto di vista di un
osservatore, e a produrre le immagini di anteprima del livello a partire dai dati reali.
"""

from __future__ import annotations

import numpy as np
from numba import njit, prange
from PIL import Image

from .geom import Grid


@njit(cache=True, inline="always")
def _sample(h, fx, fy):
    n = h.shape[0]
    if fx < 0.0:
        fx = 0.0
    if fy < 0.0:
        fy = 0.0
    if fx > n - 1.001:
        fx = n - 1.001
    if fy > n - 1.001:
        fy = n - 1.001
    ix = int(fx)
    iy = int(fy)
    u = fx - ix
    v = fy - iy
    return (h[iy, ix] * (1 - u) * (1 - v) + h[iy, ix + 1] * u * (1 - v)
            + h[iy + 1, ix] * (1 - u) * v + h[iy + 1, ix + 1] * u * v)


@njit(cache=True, parallel=True)
def _render(h, water, albedo, step, x0, y0, cam, fwd, right, up, tan_half, aspect,
            width, height, max_dist, sun, sky_top, sky_hor, fog_dist, out):
    n = h.shape[0]
    for py in prange(height):
        for px in range(width):
            u = (2.0 * (px + 0.5) / width - 1.0) * tan_half * aspect
            v = (1.0 - 2.0 * (py + 0.5) / height) * tan_half
            dx = fwd[0] + u * right[0] + v * up[0]
            dy = fwd[1] + u * right[1] + v * up[1]
            dz = fwd[2] + u * right[2] + v * up[2]
            ln = np.sqrt(dx * dx + dy * dy + dz * dz)
            dx /= ln
            dy /= ln
            dz /= ln
            t = 1.0
            hit = 0
            prev_t = 0.0
            while t < max_dist:
                x = cam[0] + dx * t
                y = cam[1] + dy * t
                z = cam[2] + dz * t
                fx = (x - x0) / step
                fy = (y - y0) / step
                if fx < 0 or fy < 0 or fx > n - 1 or fy > n - 1:
                    if (dx * (x - x0 - n * step / 2) > 0 and abs(x - x0 - n * step / 2) > n * step / 2) or \
                       (dy * (y - y0 - n * step / 2) > 0 and abs(y - y0 - n * step / 2) > n * step / 2):
                        break
                else:
                    th = _sample(h, fx, fy)
                    wl = _sample(water, fx, fy)
                    if z < wl and wl > th:
                        hit = 2
                        break
                    if z < th:
                        hit = 1
                        # raffinamento per bisezione
                        a = prev_t
                        b = t
                        for _ in range(8):
                            m = 0.5 * (a + b)
                            zz = cam[2] + dz * m
                            hh = _sample(h, (cam[0] + dx * m - x0) / step, (cam[1] + dy * m - y0) / step)
                            if zz < hh:
                                b = m
                            else:
                                a = m
                        t = b
                        break
                prev_t = t
                t += max(0.4 * step, t * 0.0025)
            sky_k = max(dz, 0.0) ** 0.6
            sr = sky_hor[0] * (1 - sky_k) + sky_top[0] * sky_k
            sg = sky_hor[1] * (1 - sky_k) + sky_top[1] * sky_k
            sb = sky_hor[2] * (1 - sky_k) + sky_top[2] * sky_k
            if hit == 0:
                out[py, px, 0] = sr
                out[py, px, 1] = sg
                out[py, px, 2] = sb
                continue
            x = cam[0] + dx * t
            y = cam[1] + dy * t
            fx = (x - x0) / step
            fy = (y - y0) / step
            if hit == 2:
                cr, cg, cb = 0.16, 0.30, 0.38
                fres = 0.25 + 0.6 * (1 - abs(dz)) ** 4
                cr = cr * (1 - fres) + sr * fres
                cg = cg * (1 - fres) + sg * fres
                cb = cb * (1 - fres) + sb * fres
            else:
                hx = _sample(h, fx + 1, fy) - _sample(h, fx - 1, fy)
                hy = _sample(h, fx, fy + 1) - _sample(h, fx, fy - 1)
                nx = -hx / (2 * step)
                ny = -hy / (2 * step)
                nz = 1.0
                nl = np.sqrt(nx * nx + ny * ny + nz * nz)
                nx /= nl
                ny /= nl
                nz /= nl
                diff = max(nx * sun[0] + ny * sun[1] + nz * sun[2], 0.0)
                ix = min(max(int(fx + 0.5), 0), n - 1)
                iy = min(max(int(fy + 0.5), 0), n - 1)
                lit = 0.32 + 0.85 * diff
                cr = albedo[iy, ix, 0] * lit
                cg = albedo[iy, ix, 1] * lit
                cb = albedo[iy, ix, 2] * lit
            fog = 1.0 - np.exp(-t / fog_dist)
            out[py, px, 0] = cr * (1 - fog) + sky_hor[0] * fog
            out[py, px, 1] = cg * (1 - fog) + sky_hor[1] * fog
            out[py, px, 2] = cb * (1 - fog) + sky_hor[2] * fog


def default_albedo(h: np.ndarray, step: float) -> np.ndarray:
    gy, gx = np.gradient(h, step)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    grass = np.array([0.30, 0.40, 0.18])
    forest = np.array([0.16, 0.24, 0.12])
    rock = np.array([0.42, 0.40, 0.37])
    snow = np.array([0.92, 0.93, 0.96])
    a = np.empty(h.shape + (3,), dtype=np.float32)
    rk = np.clip((slope - 32.0) / 14.0, 0, 1)[..., None]
    fo = np.clip((h - 450.0) / 300.0, 0, 1)[..., None] * (1 - np.clip((h - 1250) / 150.0, 0, 1)[..., None])
    sn = np.clip((h - 1500.0) / 120.0, 0, 1)[..., None] * (1 - rk * 0.7)
    a[:] = grass * (1 - fo) + forest * fo
    a[:] = a * (1 - rk) + rock * rk
    a[:] = a * (1 - sn) + snow * sn
    return a


def look_at(cam, target):
    cam = np.asarray(cam, dtype=np.float64)
    fwd = np.asarray(target, dtype=np.float64) - cam
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0.0, 0.0, 1.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    return fwd, right, up


def render_view(h, grid: Grid, cam, target, path, width=1280, height=720, fov_deg=60.0, albedo=None,
                water=None, max_dist=12000.0, sun_az_deg=135.0, sun_el_deg=38.0, fog_dist=9000.0):
    h = np.ascontiguousarray(h, dtype=np.float32)
    if albedo is None:
        albedo = default_albedo(h, grid.step)
    if water is None:
        water = np.full(h.shape, -1e9, dtype=np.float32)
    fwd, right, up = look_at(cam, target)
    az, el = np.deg2rad(sun_az_deg), np.deg2rad(sun_el_deg)
    sun = np.array([np.cos(el) * np.sin(az), np.cos(el) * np.cos(az), np.sin(el)])
    out = np.zeros((height, width, 3), dtype=np.float32)
    _render(h, np.ascontiguousarray(water, dtype=np.float32), np.ascontiguousarray(albedo, dtype=np.float32),
            float(grid.step), float(grid.x0), float(grid.y0), np.asarray(cam, dtype=np.float64), fwd, right, up,
            float(np.tan(np.deg2rad(fov_deg) / 2)), width / height, width, height, float(max_dist), sun,
            np.array([0.36, 0.55, 0.85]), np.array([0.74, 0.82, 0.92]), float(fog_dist), out)
    img = (np.clip(out, 0, 1) ** (1 / 1.1) * 255).astype(np.uint8)
    Image.fromarray(img).save(path)
    return path
