"""Anteprime 2D: rilievo ombreggiato, tinte altimetriche, sovrapposizioni di strade e acqua."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

from .geom import Grid


def hillshade(h: np.ndarray, step: float, azimuth=315.0, altitude=38.0, zfactor=1.0) -> np.ndarray:
    gy, gx = np.gradient(h.astype(np.float64) * zfactor, step)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az = np.deg2rad(azimuth)
    alt = np.deg2rad(altitude)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1)


HYPSO = [
    (60, (92, 128, 74)),
    (180, (128, 158, 92)),
    (400, (164, 172, 108)),
    (700, (176, 160, 112)),
    (1000, (160, 134, 104)),
    (1300, (146, 132, 124)),
    (1550, (196, 194, 192)),
    (1800, (250, 250, 252)),
]


def hypsometric(h: np.ndarray) -> np.ndarray:
    lv = np.array([p[0] for p in HYPSO], dtype=np.float64)
    cols = np.array([p[1] for p in HYPSO], dtype=np.float64)
    out = np.empty(h.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(h, lv, cols[:, c])
    return out


def render(h: np.ndarray, grid: Grid, path, out_px=1024, water_mask=None, rock=None, title=None,
           lines=None, points=None, grid_lines=None, crop=None):
    """Salva un'immagine della mappa. `lines`: lista di (polilinea Nx2 in metri, colore, larghezza px)."""
    f = h.shape[0] / out_px
    hs = h if f <= 1 else ndimage.zoom(h, 1 / f, order=1)
    step = grid.step * h.shape[0] / hs.shape[0]
    shade = hillshade(hs, step)
    col = hypsometric(hs)
    gy, gx = np.gradient(hs, step)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    rockiness = np.clip((slope - 30) / 25, 0, 1)[..., None]
    col = col * (1 - 0.5 * rockiness) + np.array([120, 112, 104]) * 0.5 * rockiness
    img = col * (0.35 + 0.75 * shade[..., None])
    if water_mask is not None:
        wm = water_mask if f <= 1 else ndimage.zoom(water_mask.astype(np.float32), 1 / f, order=1) > 0.5
        img[wm] = img[wm] * 0.25 + np.array([40, 90, 150]) * 0.75
    img = np.clip(img, 0, 255).astype(np.uint8)[::-1]  # nord in alto
    im = Image.fromarray(img)
    draw = ImageDraw.Draw(im)
    n = im.size[0]

    def to_px(P):
        P = np.asarray(P)
        px = (P[:, 0] - grid.x0) / grid.extent * n
        py = n - (P[:, 1] - grid.y0) / grid.extent * n
        return list(zip(px.tolist(), py.tolist()))

    if grid_lines:
        try:
            gfont = ImageFont.load_default(size=max(10, n // 110))
        except TypeError:
            gfont = ImageFont.load_default()
        v = np.ceil(grid.x0 / grid_lines) * grid_lines
        while v < grid.x0 + grid.extent:
            (px, _), = to_px([[v, grid.y0]])
            (_, py), = to_px([[grid.x0, v]])
            draw.line([(px, 0), (px, n)], fill=(255, 255, 255), width=1)
            draw.line([(0, py), (n, py)], fill=(255, 255, 255), width=1)
            draw.text((px + 2, 2), f"{int(v)}", fill=(255, 255, 0), font=gfont, stroke_width=1, stroke_fill=(0, 0, 0))
            draw.text((2, py + 2), f"{int(v)}", fill=(255, 255, 0), font=gfont, stroke_width=1, stroke_fill=(0, 0, 0))
            v += grid_lines
    for line in lines or []:
        P, color, width = line
        if len(P) > 1:
            draw.line(to_px(P), fill=color, width=width)
    try:
        font = ImageFont.load_default(size=max(12, n // 70))
    except TypeError:
        font = ImageFont.load_default()
    for pt in points or []:
        (x, y), label, color = pt
        (px, py), = to_px([[x, y]])
        draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=color)
        if label:
            draw.text((px + 6, py - 8), label, fill=(255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
    if title:
        draw.text((10, 10), title, fill=(255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
    im.save(path)
    return path


def render_crop(h: np.ndarray, grid: Grid, center, half: float, path, out_px=1024, water_mask=None, lines=None,
                points=None, grid_lines=None, title=None):
    """Anteprima ingrandita di un quadrato di lato 2*half metri attorno a `center`."""
    cx, cy = center
    win = grid.window(cx - half, cy - half, cx + half, cy + half)
    sy, sx = win
    n = min(sy.stop - sy.start, sx.stop - sx.start)
    sy = slice(sy.start, sy.start + n)
    sx = slice(sx.start, sx.start + n)
    sub_grid = Grid(n, grid.step, grid.x0 + sx.start * grid.step, grid.y0 + sy.start * grid.step)
    wm = water_mask[sy, sx] if water_mask is not None else None
    return render(h[sy, sx], sub_grid, path, out_px=out_px, water_mask=wm, lines=lines, points=points,
                  grid_lines=grid_lines, title=title)
