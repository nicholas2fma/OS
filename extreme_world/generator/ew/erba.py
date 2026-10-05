"""Erba e piccole piante (GroundCover) sui layer del terreno.

Formato verificato sul livello Utah2 (main/.../vegetation/items.level.json): oggetto
"GroundCover" con material, radius, dissolveRadius, maxElements, maxBillboardTiltAngle, campi del
vento e l'array Types (layer, billboardUVs, probability, sizeMin, sizeMax, sizeExponent,
windScale, minClumpCount, maxClumpCount, clumpExponent, clumpRadius). "layer" è l'internalName del
materiale del terreno (nei Types di Utah2 compaiono "Grass3", "dirt_rocky", ... che sono gli
internalName del suo art/terrains/main.materials.json). Semantica dei campi da Torque3D
(T3D/fx/groundCover.cpp): billboardUVs è un rettangolo (x, y, larghezza, altezza) nelle UV del
materiale con origine in alto a sinistra; il materiale è un Material normale al quale il motore
aggiunge la funzione di fogliame (MFT_Foliage); la trasparenza viene dal canale alfa della
texture con alphaTest/alphaRef del materiale (campi verificati nell'importatore).
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

ART = "art/shapes/ew/erba"
CELL_W, CELL_H = 256, 512
COLS, ROWS = 4, 2
# celle dell'atlante: (nome, colonna, riga)
CELLS = {
    "erba": (0, 0), "erba_alta": (1, 0), "erba_secca": (2, 0), "fiori": (3, 0),
    "felce": (0, 1), "ciuffo_alpino": (1, 1), "erbacce": (2, 1), "erba_rada": (3, 1),
}


def _blades(d, rng, k, n, height, spread, colors, width=3, curl=0.35, base_w=0.35):
    """Fili d'erba: linee curve dalla base (in basso al centro) verso l'alto."""
    for _ in range(n):
        x0 = CELL_W * k * (0.5 + rng.uniform(-base_w, base_w))
        hgt = CELL_H * k * height * rng.uniform(0.55, 1.0)
        lean = rng.uniform(-spread, spread) * CELL_W * k
        col = colors[int(rng.integers(0, len(colors)))]
        g = rng.uniform(0.85, 1.15)
        col = tuple(int(np.clip(c * g, 0, 255)) for c in col) + (255,)
        pts = []
        for t in np.linspace(0, 1, 7):
            x = x0 + lean * t + curl * lean * t * t
            y = CELL_H * k - hgt * t
            pts.append((x, y))
        w = max(1, int(width * k))
        for (xa, ya), (xb, yb), t in zip(pts[:-1], pts[1:], np.linspace(1, 0.2, 6)):
            d.line([(xa, ya), (xb, yb)], fill=col, width=max(1, int(w * t + 0.5)))


def _cell(name, rng):
    k = 2
    img = Image.new("RGBA", (CELL_W * k, CELL_H * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    green = [(58, 102, 40), (72, 118, 46), (88, 132, 52), (50, 88, 34)]
    dry = [(176, 152, 92), (160, 136, 80), (196, 174, 110), (140, 118, 70)]
    if name == "erba":
        _blades(d, rng, k, 140, 0.75, 0.25, green)
    elif name == "erba_alta":
        _blades(d, rng, k, 90, 0.95, 0.18, green + [(98, 128, 60)])
        for _ in range(14):                                   # spighe
            x = CELL_W * k * rng.uniform(0.25, 0.75)
            y = CELL_H * k * rng.uniform(0.04, 0.25)
            d.ellipse([x - 5 * k, y - 16 * k, x + 5 * k, y + 16 * k], fill=(150, 140, 90, 255))
    elif name == "erba_secca":
        _blades(d, rng, k, 120, 0.7, 0.3, dry)
    elif name == "fiori":
        _blades(d, rng, k, 80, 0.6, 0.25, green)
        for _ in range(26):
            x = CELL_W * k * rng.uniform(0.15, 0.85)
            y = CELL_H * k * rng.uniform(0.35, 0.75)
            col = [(238, 236, 228), (236, 206, 60), (170, 110, 190), (220, 90, 80)][int(rng.integers(0, 4))]
            r = rng.uniform(5, 9) * k
            d.ellipse([x - r, y - r, x + r, y + r], fill=col + (255,))
            d.ellipse([x - r * 0.35, y - r * 0.35, x + r * 0.35, y + r * 0.35], fill=(230, 190, 40, 255))
    elif name == "felce":
        for _ in range(7):                                    # fronde arcuate con pinnule
            ang = rng.uniform(-1.0, 1.0)
            L = CELL_H * k * rng.uniform(0.55, 0.85)
            x0, y0 = CELL_W * k * 0.5, CELL_H * k
            pts = [(x0 + np.sin(ang * t) * L * 0.55 * t, y0 - L * t + 0.25 * L * t * t * abs(ang)) for t in np.linspace(0, 1, 18)]
            col = green[int(rng.integers(0, 4))]
            d.line(pts, fill=col + (255,), width=3 * k)
            for (xa, ya), t in zip(pts[2:], np.linspace(0.1, 1, 16)):
                for sd in (-1, 1):
                    ln = (1 - t) * 34 * k + 6 * k
                    d.line([(xa, ya), (xa + sd * ln, ya - ln * 0.35)], fill=col + (255,), width=2 * k)
    elif name == "ciuffo_alpino":
        _blades(d, rng, k, 110, 0.45, 0.4, dry[:2] + green[3:], base_w=0.25)
    elif name == "erbacce":
        _blades(d, rng, k, 50, 0.6, 0.3, green)
        for _ in range(5):                                    # foglie larghe
            x = CELL_W * k * rng.uniform(0.3, 0.7)
            y = CELL_H * k * rng.uniform(0.55, 0.85)
            d.ellipse([x - 22 * k, y - 9 * k, x + 22 * k, y + 9 * k], fill=green[1] + (255,))
    else:                                                     # erba rada
        _blades(d, rng, k, 35, 0.55, 0.35, dry + green[:1])
    return img.resize((CELL_W, CELL_H), Image.LANCZOS)


def write_atlas(level_dir, level_name, seed):
    rng = np.random.default_rng(seed + 5151)
    atlas = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))
    for name, (c, r) in CELLS.items():
        atlas.alpha_composite(_cell(name, rng), (c * CELL_W, r * CELL_H))
    # l'atlante è già ad alfa non premoltiplicata (resize RGBA di Pillow e alpha_composite): i
    # pixel visibili restano come sono; sotto quelli del tutto trasparenti va il colore del pixel
    # visibile più vicino, così le mipmap non mescolano aloni scuri o chiari
    from scipy import ndimage
    a = np.asarray(atlas)
    _, (iy, ix) = ndimage.distance_transform_edt(a[..., 3] == 0, return_indices=True)
    out = np.concatenate([a[..., :3][iy, ix], a[..., 3:4]], -1).astype(np.uint8)
    path = level_dir / ART / "ew_erba_b.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGBA").save(path, optimize=True)
    return {"ew_erba": {"name": "ew_erba", "mapTo": "ew_erba", "class": "Material", "version": 1.5,
                        "alphaTest": True, "alphaRef": 100,
                        "Stages": [{"baseColorMap": f"/levels/{level_name}/{ART}/{path.name}"}, {}, {}, {}]}}, path


def _uv(name, margin=2):
    c, r = CELLS[name]
    W, H = CELL_W * COLS, CELL_H * ROWS
    return [round((c * CELL_W + margin) / W, 6), round((r * CELL_H + margin) / H, 6),
            round((CELL_W - 2 * margin) / W, 6), round((CELL_H - 2 * margin) / H, 6)]


def _type(layer, cell, prob, smin, smax, wind=0.3, clump=(1, 3), radius=1.0, exp=1.0):
    return {"layer": layer, "billboardUVs": _uv(cell), "probability": prob, "sizeMin": smin, "sizeMax": smax,
            "sizeExponent": exp, "windScale": wind, "minClumpCount": clump[0], "maxClumpCount": clump[1],
            "clumpExponent": 1, "clumpRadius": radius}


def run(ctx: dict) -> dict:
    """Due GroundCover (prati e sottobosco; erba secca e alpina). Non modifica terreno né layer."""
    mats, _ = write_atlas(ctx["level_dir"], ctx["level_name"], ctx["seed"])
    wind = {"windGustFrequency": 1, "windGustLength": 1, "windGustStrength": 0.05,
            "windTurbulenceFrequency": 0.5, "windTurbulenceStrength": 0.05}
    common = {"class": "GroundCover", "material": "ew_erba", "maxBillboardTiltAngle": 40, "reflectScale": 0,
              "shapeCullRadius": 10, "shapesCastShadows": False, **wind}
    objs = [
        {"name": "erba_prati", "position": [0.0, 0.0, 200.0], "radius": 110, "dissolveRadius": 90, "maxElements": 350000,
         **common, "Types": [
             _type("ew_grass", "erba", 2.0, 0.35, 0.7, clump=(2, 5), radius=1.2),
             _type("ew_grass", "erba_alta", 0.5, 0.5, 0.95, clump=(1, 3)),
             _type("ew_grass", "fiori", 0.18, 0.3, 0.5, clump=(1, 4), radius=1.5),
             _type("ew_grass", "erbacce", 0.15, 0.3, 0.6),
             _type("ew_forest_floor", "felce", 0.6, 0.45, 0.9, clump=(1, 3), radius=1.5),
             _type("ew_forest_floor", "erba_rada", 0.4, 0.3, 0.55),
             _type("ew_dirt", "erba_rada", 0.3, 0.25, 0.5),
         ]},
        {"name": "erba_secca", "position": [0.0, 0.0, 200.0], "radius": 100, "dissolveRadius": 80, "maxElements": 250000,
         **common, "Types": [
             _type("ew_grass_dry", "erba_secca", 1.6, 0.3, 0.6, clump=(2, 5), radius=1.2),
             _type("ew_grass_dry", "ciuffo_alpino", 0.8, 0.25, 0.45, clump=(1, 4)),
             _type("ew_dirt_dusty", "erba_rada", 0.25, 0.25, 0.5, clump=(1, 2)),
             _type("ew_sand", "ciuffo_alpino", 0.15, 0.2, 0.4),
             _type("ew_scree", "ciuffo_alpino", 0.08, 0.2, 0.35),
         ]},
    ]
    for o in objs:
        ctx["scene"].add("MissionGroup/vegetation", o)
    return {"materials": mats, "stats": {"groundcover": len(objs), "tipi": sum(len(o["Types"]) for o in objs)},
            "keepout": []}
