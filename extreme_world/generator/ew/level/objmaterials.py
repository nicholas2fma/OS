"""Materiali e texture delle strutture (ponti, gallerie, muri, guardrail, edifici)."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from ..textures import TexGen, surf_asphalt, surf_concrete, surf_rock

ART = "art/shapes/ew"


def _brick_or_plaster(tg, n, salt, tone):
    a = tg.spectral(n, 1.8, salt, fmin=2)
    g = tg.spectral(n, 0.5, salt + 1, fmin=n // 8)
    lum = 1 + 0.06 * a + 0.04 * g
    rgb = np.array(tone)[None, None, :] * lum[..., None]
    return rgb, 0.5 + 0.1 * g, np.clip(0.85 + 0.05 * g, 0, 1)


def _metal(tg, n, salt):
    a = tg.spectral(n, 1.0, salt, fmin=4)
    lum = 175 + 12 * a
    rgb = np.stack([lum, lum * 1.01, lum * 1.03], -1)
    return rgb, 0.5 + 0.05 * a, np.clip(0.35 + 0.08 * a, 0, 1)


def _roof(tg, n, salt):
    v = np.linspace(0, 1, n, endpoint=False)[:, None]
    rows = (np.sin(v * 2 * np.pi * 16) * 0.5 + 0.5) ** 0.6
    a = tg.spectral(n, 1.6, salt, fmin=2)
    rgb = np.stack([150 * rows + 30, 72 * rows + 20, 52 * rows + 16], -1) * (1 + 0.08 * a[..., None])
    return rgb, rows * np.ones((1, n)), np.full((n, n), 0.8)


def _corrugated(tg, n, salt, tone=(150, 158, 165)):
    u = np.linspace(0, 1, n, endpoint=False)[None, :]
    ridge = np.sin(u * 2 * np.pi * 24) * 0.5 + 0.5
    a = tg.spectral(n, 1.4, salt, fmin=2)
    rgb = np.array(tone)[None, None, :] * (0.85 + 0.15 * ridge[..., None] + 0.05 * a[..., None])
    return rgb, ridge * np.ones((n, 1)), np.clip(0.45 + 0.1 * a, 0, 1)


SURF = {
    "ew_bridge_deck": lambda tg, n, s: surf_asphalt(tg, n, s),
    "ew_concrete": surf_concrete,
    "ew_concrete_dark": lambda tg, n, s: tuple([surf_concrete(tg, n, s)[0] * 0.7] + list(surf_concrete(tg, n, s)[1:])),
    "ew_rock_wall": lambda tg, n, s: surf_rock(tg, n, s),
    "ew_metal": _metal,
    "ew_plaster_white": lambda tg, n, s: _brick_or_plaster(tg, n, s, (226, 220, 206)),
    "ew_plaster_ochre": lambda tg, n, s: _brick_or_plaster(tg, n, s, (214, 176, 118)),
    "ew_plaster_pink": lambda tg, n, s: _brick_or_plaster(tg, n, s, (214, 168, 150)),
    "ew_roof_tiles": _roof,
    "ew_metal_sheet": _corrugated,
    "ew_metal_sheet_blue": lambda tg, n, s: _corrugated(tg, n, s, (86, 112, 150)),
}


def write_object_materials(level_dir: Path, level_name: str, seed: int, names=None) -> dict:
    tg = TexGen(seed + 991)
    out = level_dir / ART
    out.mkdir(parents=True, exist_ok=True)
    mats = {}
    for i, (name, fn) in enumerate(SURF.items()):
        if names and name not in names:
            continue
        n = 512
        rgb, hgt, rough = fn(tg, n, 4000 + 13 * i)
        hgt = np.asarray(hgt, dtype=np.float64)
        hgt = (hgt - hgt.min()) / max(hgt.max() - hgt.min(), 1e-9)
        b = tg.save(out / f"{name}_b.png", rgb)
        nm = tg.save(out / f"{name}_nm.png", tg.normal_from_height(hgt, 2.0))
        r = tg.save(out / f"{name}_r.png", (np.clip(rough, 0, 1) * 255).astype(np.uint8), "L")
        vp = lambda p: f"/levels/{level_name}/{ART}/{p.name}"  # noqa: E731
        stage = {"baseColorMap": vp(b), "normalMap": vp(nm), "roughnessMap": vp(r)}
        if name in ("ew_metal", "ew_metal_sheet", "ew_metal_sheet_blue"):
            stage["metallicFactor"] = 0.8
        mats[name] = {"name": name, "mapTo": name, "class": "Material", "Stages": [stage, {}, {}, {}],
                      "version": 1.5}
    return mats
