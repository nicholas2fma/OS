"""Materiali del terreno: definizioni, texture, file main.materials.json e layer map.

Schema delle texture (documentazione BeamNG): la texture Base definisce il colore assoluto,
Macro (30-80 m) e Detail (2-8 m) modulano il dettaglio e vanno desaturate. Qui ogni materiale
ha una propria texture Base a colore pieno con lievi variazioni a grande scala (indipendenti
dall'orientamento dell'immagine), dettagli in scala di grigi e macro condivise per famiglia.
La fisica (groundmodel) è quella del materiale del terreno: anche sotto le DecalRoad le ruote
toccano il terreno, per questo le strade asfaltate hanno sotto il materiale ew_asphalt.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .textures import TexGen, write_surface_set

# internalName, superficie, groundmodel, metri per ripetizione del dettaglio, famiglia macro
TERRAIN_MATERIALS = [
    ("ew_grass", "grass", "GRASS", 3.0, "clumpy"),
    ("ew_grass_dry", "grass_dry", "GRASS", 3.0, "clumpy"),
    ("ew_forest_floor", "forest_floor", "DIRT", 3.0, "clumpy"),
    ("ew_dirt", "dirt", "DIRT", 3.0, "clumpy"),
    ("ew_dirt_dusty", "dirt_dusty", "DIRT_DUSTY", 3.0, "rocky"),
    ("ew_mud", "mud", "MUD", 3.0, "clumpy"),
    ("ew_gravel", "gravel", "GRAVEL", 2.0, "rocky"),
    ("ew_scree", "scree", "GRAVEL", 3.0, "rocky"),
    ("ew_pebbles", "pebbles", "GRAVEL", 2.0, "rocky"),
    ("ew_rock", "rock", "ROCK", 5.0, "rocky"),
    ("ew_rock_dark", "rock_dark", "ROCK", 5.0, "rocky"),
    ("ew_sand", "sand", "SAND", 3.0, "clumpy"),
    ("ew_snow", "snow", "SNOW", 4.0, "clumpy"),
    ("ew_asphalt", "asphalt", "ASPHALT", 3.0, "smooth"),
    ("ew_asphalt_old", "asphalt_old", "ASPHALT", 4.0, "smooth"),
    ("ew_concrete", "concrete", "ASPHALT", 3.0, "smooth"),
]
NAMES = [m[0] for m in TERRAIN_MATERIALS]
IDX = {n: i for i, n in enumerate(NAMES)}
MACRO_SIZE = {"clumpy": 70.0, "rocky": 60.0, "smooth": 45.0}

DETAIL_PX = 512
MACRO_PX = 512
BASE_PX = 256
TEXSET = "ExtremeWorldTerrainTextureSet"
NS = uuid.UUID("2a8f4c7e-1d3b-4e9a-8b6c-5f0e1d2c3b4a")


def _pid(name):
    return str(uuid.uuid5(NS, name))


def _desaturate_detail(path_b: Path):
    """Detail colore -> scala di grigi con media 0.5 (modulazione neutra)."""
    rgb = np.asarray(Image.open(path_b).convert("RGB"), dtype=np.float64)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    lum = 0.5 + (lum - lum.mean()) / (lum.std() * 4.0 + 1e-6)
    g = (np.clip(lum, 0.05, 0.95) * 255).astype(np.uint8)
    Image.fromarray(np.stack([g, g, g], -1)).save(path_b, optimize=True)


def write_terrain_materials(level_name: str, level_dir: Path, seed: int) -> dict:
    """Genera le texture del terreno e restituisce il dizionario di main.materials.json."""
    tg = TexGen(seed)
    rel = Path("art/terrains")
    out = level_dir / rel
    out.mkdir(parents=True, exist_ok=True)
    vpath = lambda name: f"/levels/{level_name}/{rel.as_posix()}/{name}"  # noqa: E731
    mats = {}
    # macro condivise per famiglia (in scala di grigi)
    macro = {}
    fam_surface = {"clumpy": "grass", "rocky": "rock", "smooth": "concrete"}
    for i, (fam, surf) in enumerate(fam_surface.items()):
        n = MACRO_PX
        a = tg.spectral(n, 2.4, 900 + i, fmin=1, fmax=40)
        b = tg.spectral(n, 1.6, 910 + i, fmin=4, fmax=90)
        hgt = np.clip(0.5 + 0.18 * a + 0.08 * b, 0, 1)
        g = (hgt * 255).astype(np.uint8)
        macro[fam] = {
            "b": tg.save(out / f"t_macro_{fam}_b.png", np.stack([g, g, g], -1)),
            "nm": tg.save(out / f"t_macro_{fam}_nm.png", tg.normal_from_height(hgt, 6.0)),
            "r": tg.save(out / f"t_macro_{fam}_r.png", (np.clip(0.5 + 0.12 * b, 0, 1) * 255).astype(np.uint8), "L"),
            "ao": tg.save(out / f"t_macro_{fam}_ao.png", (np.clip(0.75 + 0.2 * a, 0, 1) * 255).astype(np.uint8), "L"),
            "h": tg.save(out / f"t_macro_{fam}_h.png", g, "L"),
        }
    flat_nm = tg.save(out / "t_base_flat_nm.png", np.full((BASE_PX, BASE_PX, 3), (128, 128, 255), np.uint8))
    flat_ao = tg.save(out / "t_base_flat_ao.png", np.full((BASE_PX, BASE_PX), 255, np.uint8), "L")
    flat_h = tg.save(out / "t_base_flat_h.png", np.full((BASE_PX, BASE_PX), 128, np.uint8), "L")
    colors = {}
    for i, (name, surf, gm, dsize, fam) in enumerate(TERRAIN_MATERIALS):
        paths, mean_rgb = write_surface_set(tg, surf, DETAIL_PX, out, f"t_{name[3:]}", salt=100 + i * 17)
        _desaturate_detail(paths["b"])
        colors[name] = mean_rgb
        # base: colore del materiale con variazioni lente di tinta e luminosità
        n = BASE_PX
        v1 = tg.spectral(n, 3.0, 1200 + i, fmin=1, fmax=10)
        v2 = tg.spectral(n, 3.0, 1300 + i, fmin=1, fmax=10)
        col = mean_rgb[None, None, :] * (1.0 + 0.07 * v1[..., None])
        col[..., 0] *= 1.0 + 0.03 * v2
        col[..., 2] *= 1.0 - 0.03 * v2
        base_b = tg.save(out / f"t_base_{name[3:]}_b.png", col)
        rough_base = tg.save(out / f"t_base_{name[3:]}_r.png",
                             np.full((n, n), int(255 * {"asphalt": 0.75, "snow": 0.55, "mud": 0.4}.get(surf, 0.85)), np.uint8), "L")
        m = macro[fam]
        ms = MACRO_SIZE[fam]
        full = f"{name}-{_pid(name)}"
        mats[full] = {
            "name": full,
            "internalName": name,
            "class": "TerrainMaterial",
            "persistentId": _pid(name),
            "groundmodelName": gm,
            "baseColorBaseTex": vpath(base_b.name), "baseColorBaseTexSize": 8192,
            "normalBaseTex": vpath(flat_nm.name), "normalBaseTexSize": 8192,
            "roughnessBaseTex": vpath(rough_base.name), "roughnessBaseTexSize": 8192,
            "aoBaseTex": vpath(flat_ao.name), "aoBaseTexSize": 8192,
            "heightBaseTex": vpath(flat_h.name), "heightBaseTexSize": 8192,
            "baseColorDetailTex": vpath(paths["b"].name), "baseColorDetailTexSize": dsize, "baseColorDetailStrength": [0.35, 0.3],
            "normalDetailTex": vpath(paths["nm"].name), "normalDetailTexSize": dsize, "normalDetailStrength": [0.6, 0.15],
            "roughnessDetailTex": vpath(paths["r"].name), "roughnessDetailTexSize": dsize, "roughnessDetailStrength": [0.35, 0.3],
            "aoDetailTex": vpath(paths["ao"].name), "aoDetailTexSize": dsize, "aoDetailStrength": [1, 1],
            "heightDetailTex": vpath(paths["h"].name), "heightDetailTexSize": dsize,
            "baseColorMacroTex": vpath(m["b"].name), "baseColorMacroTexSize": ms, "baseColorMacroStrength": [0.12, 0.25],
            "normalMacroTex": vpath(m["nm"].name), "normalMacroTexSize": ms, "normalMacroStrength": [0.3, 0.5],
            "roughnessMacroTex": vpath(m["r"].name), "roughnessMacroTexSize": ms, "roughnessMacroStrength": [0.15, 0.4],
            "aoMacroTex": vpath(m["ao"].name), "aoMacroTexSize": ms,
            "heightMacroTex": vpath(m["h"].name), "heightMacroTexSize": ms,
            "detailDistances": [0, 0, 50, 100],
            "detailDistAtten": [1, 1],
            "macroDistances": [0, 10, 100, 1000],
            "macroDistAtten": [0, 1],
        }
    mats[TEXSET] = {
        "name": TEXSET,
        "class": "TerrainMaterialTextureSet",
        "persistentId": _pid(TEXSET),
        "baseTexSize": [BASE_PX, BASE_PX],
        "detailTexSize": [DETAIL_PX, DETAIL_PX],
        "macroTexSize": [MACRO_PX, MACRO_PX],
    }
    return mats, colors


# ============================================================== layer map
def classify_layers(g, h, ctx) -> np.ndarray:
    """Assegna un materiale a ogni vertice del terreno (indice in NAMES)."""
    from .geom import smoothstep
    n = ctx["noise"]
    X, Y = g.mesh(np.float32)
    hs = ndimage.gaussian_filter(h, 1.0)
    gy, gx = np.gradient(hs, g.step)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    nz1 = n.fbm(X, Y, 90.0, octaves=4, salt=501)
    nz2 = n.fbm(X, Y, 35.0, octaves=3, salt=502)
    L = np.full(h.shape, IDX["ew_grass"], dtype=np.uint8)
    # quota: prati -> pascoli alpini secchi
    L[h + 60 * nz1 > 980] = IDX["ew_grass_dry"]
    # macchie di terra nei prati
    L[(nz2 > 0.62) & (h < 1100)] = IDX["ew_dirt"]
    # calanchi del territorio estremo
    if ctx.get("badlands") is not None:
        bad = ctx["badlands"] & (nz1 + 0.3 * nz2 > -0.35)
        L[bad] = IDX["ew_dirt_dusty"]
    # sottobosco dove c'è foresta
    if ctx.get("forest") is not None:
        L[(ctx["forest"] > 0.35 + 0.15 * nz2) & (slope < 38)] = IDX["ew_forest_floor"]
    # pendii ripidi: ghiaione e roccia (bordi irregolari)
    sl = slope + 6.0 * nz2
    L[sl > 34] = IDX["ew_scree"]
    L[sl > 41] = IDX["ew_rock"]
    L[(sl > 52) | (ctx["cliff"] > 0.45) & (sl > 30)] = IDX["ew_rock_dark"]
    if ctx.get("canyon_rock") is not None:
        L[(ctx["canyon_rock"] > 0.5) & (sl > 25)] = IDX["ew_rock"]
    # cime: neve sulle parti meno ripide, roccia altrove
    L[(h + 40 * nz1 > 1590) & (sl < 36)] = IDX["ew_snow"]
    # acqua: fondali, spiagge di ghiaia, greti
    for lk in ctx.get("lakes", []):
        m = lk["mask"]
        level = lk["level"]
        L[m] = IDX["ew_mud"]
        shore = (~m) & (h < level + 1.2) & ndimage.binary_dilation(m, iterations=6)
        L[shore] = IDX["ew_pebbles"]
        shallow = m & (h > level - 1.5)
        L[shallow & (nz2 > -0.2)] = IDX["ew_pebbles"]
    if ctx.get("river_dist") is not None:
        rd = ctx["river_dist"]
        L[rd < 1.0] = IDX["ew_pebbles"]
        L[(rd >= 1.0) & (rd < 3.0) & (nz2 > 0.1)] = IDX["ew_mud"]
    # strade: piattaforma, banchine, scarpate
    roads = ctx["roads"]
    core = roads["core_id"]
    layer_of = ctx["road_layers"]           # indice strada -> (layer piattaforma, layer banchina)
    for ridx, (lay, verge_lay) in layer_of.items():
        sel = core == ridx
        L[sel & ~roads["verge"]] = IDX[lay]
        L[sel & roads["verge"]] = IDX[verge_lay]
    cut = roads["cut"]
    L[(cut > 2.5) & (slope > 38)] = IDX["ew_rock"]
    L[(cut > 1.0) & (cut <= 2.5) & (slope > 30)] = IDX["ew_scree"]
    fill = roads["fill"]
    L[(fill > 1.5) & (slope > 25) & (core < 0)] = IDX["ew_gravel"]
    for extra in ctx.get("paint", []):
        L[extra["mask"]] = IDX[extra["layer"]]
    return L
