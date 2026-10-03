"""Oggetti d'ambiente, acqua, spawn e info.json."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from ..textures import TexGen

WATER_COMMON = {
    "baseColor": [38, 82, 96, 255],
    "underwaterColor": [24, 60, 72, 230],
    "depthGradientTex": "core/art/water/depthcolor_ramp.png",
    "depthGradientMax": 12,
    "foamTex": "core/art/water/foam.dds",
    "rippleTex": "core/art/water/ripple.dds",
    "reflectivity": 0.55,
    "waterFogDensity": 0.6,
    "waterFogDensityOffset": 1,
    "wetDarkening": 0.3,
    "wetDepth": 0.4,
    "specularPower": 200,
    "overallWaveMagnitude": 0.12,
    "overallRippleMagnitude": 0.5,
}


def rotation_facing(fx: float, fy: float) -> list:
    """rotationMatrix per un veicolo rivolto verso (fx, fy).

    Convenzione verificata: i 9 valori sono le immagini degli assi locali X, Y, Z. I veicoli
    BeamNG hanno il frontale verso -Y locale, quindi Y = -f e X = Y x Z."""
    ln = float(np.hypot(fx, fy)) or 1.0
    fx, fy = fx / ln, fy / ln
    return [-fy, fx, 0.0, -fx, -fy, 0.0, 0.0, 0.0, 1.0]


def environment_objects(scene, world: dict, level_name: str, level_dir: Path, seed: int):
    g = "MissionGroup/Level_objects"
    scene.add(f"{g}/level_info", {
        "name": "theLevelInfo", "class": "LevelInfo",
        "canvasClearColor": [180, 200, 220, 255],
        "fogColor": [0.62, 0.72, 0.86, 1],
        "fogDensity": 0.00028,
        "fogDensityOffset": 400,
        "fogAtmosphereHeight": 1800,
        "gravity": -9.81,
        "visibleDistance": 9000,
        "desc0": world["description"],
        "levelName": world["title"],
        "temperatureCurveC": [0, 22, 0.25, 26, 0.5, 14, 0.75, 10, 1, 22],
    })
    scene.add(f"{g}/sky", {
        "name": "sunsky", "class": "ScatterSky",
        "position": [0, 0, 400],
        "ambientScale": [1, 0.96, 0.9, 1],
        "brightness": 1.0,
        "colorize": [0.22, 0.35, 0.6, 1],
        "exposure": 1.3,
        "fogScale": [0.45, 0.65, 1, 1],
        "mieScattering": 0.0004,
        "rayleighScattering": 0.0035,
        "shadowDistance": 2400,
        "shadowSoftness": 0.2,
        "skyBrightness": 40,
        "sunScale": [1, 0.92, 0.82, 1],
        "texSize": 1024,
    })
    scene.add(f"{g}/time", {
        "name": "tod", "class": "TimeOfDay",
        "position": [0, 0, 400],
        "axisTilt": 23.44,
        "dayLength": 1800,
        "play": False,
        "startTime": 0.12,
        "time": 0.12,
        "azimuthOverride": 0,
    })
    # nuvole: texture procedurale periodica
    tg = TexGen(seed + 5)
    n = 512
    c = tg.spectral(n, 2.6, 7001, fmin=2)
    c2 = tg.spectral(n, 1.8, 7002, fmin=6)
    dens = np.clip((0.55 * c + 0.25 * c2 - 0.1) * 0.9, 0, 1)
    rgba = np.dstack([np.full((n, n), 250), np.full((n, n), 250), np.full((n, n), 255), dens * 255]).astype(np.uint8)
    cloud = tg.save(level_dir / "art/skies/ew_clouds.png", rgba, "RGBA")
    scene.add(f"{g}/cloud", {
        "name": "clouds1", "class": "CloudLayer",
        "position": [0, 0, 0],
        "texture": f"/levels/{level_name}/art/skies/{cloud.name}",
        "Textures": [{"texScale": 1, "texSpeed": 0.002}, {"texDirection": [0.8, 0.2], "texScale": 2, "texSpeed": 0.02},
                     {"texDirection": [0.2, 0.5], "texScale": 0.5, "texSpeed": 0.03}],
        "baseColor": [0.996, 0.996, 0.996, 0.996],
        "coverage": 0.35,
        "exposure": 1.4,
        "height": 5,
        "windSpeed": 0.03,
    })
    scene.add(f"{g}/vegetation", {"class": "ForestWindEmitter", "position": [0, 0, 300], "gustFrequency": 1.5,
                                   "gustStrength": 2.0, "gustWobbleStrength": 2.0, "gustYawAngle": 40, "hasMount": "0",
                                   "strength": 0.6, "turbulenceStrength": 3.0})


def terrain_block(scene, level_name: str, tcfg: dict, texset: str):
    half = tcfg["size"] * tcfg["square_size"] / 2.0
    scene.add("MissionGroup/Level_objects/terrain", {
        "name": "theTerrain", "class": "TerrainBlock",
        "position": [-half, -half, tcfg["z_offset"]],
        "baseTexSize": 2048,
        "materialTextureSet": texset,
        "maxHeight": tcfg["max_height"],
        "squareSize": tcfg["square_size"],
        "terrainFile": f"/levels/{level_name}/theTerrain.ter",
    })


def water_objects(scene, grid, h, lake_masks: dict, rivers: list, lakes_meta: dict):
    from ..water import water_blocks_for_mask
    blocks = []
    for name, lk in lake_masks.items():
        m = lk["mask"]
        level = lk["level"]
        if not m.any():
            continue
        depth = float(level - h[m].min()) + 2.0
        angle = lakes_meta.get(name, {}).get("block_angle", 0.0)
        rects, coverage = water_blocks_for_mask(grid, h, m, level, angle_deg=angle)
        for k, r in enumerate(rects):
            (cx, cy), (sx, sy) = r["center"], r["size"]
            a = np.deg2rad(r["angle_deg"])
            obj = {"class": "WaterBlock", "name": f"acqua_{name.replace(' ', '_')}_{k + 1}",
                   "position": [cx, cy, level], "scale": [sx, sy, 2.0 * depth],
                   "fullReflect": True, "reflectMaxRateMs": 30, "reflectTexSize": 512, "gridElementSize": 8}
            if abs(r["angle_deg"]) > 1e-6:
                obj["rotationMatrix"] = [float(np.cos(a)), float(np.sin(a)), 0.0, float(-np.sin(a)), float(np.cos(a)), 0.0, 0.0, 0.0, 1.0]
            obj.update(WATER_COMMON)
            scene.add("MissionGroup/Level_objects/water", obj)
            blocks.append({"lake": name, "center": r["center"], "size": r["size"], "angle": r["angle_deg"],
                           "level": level, "depth": depth, "coverage": coverage})
    river_objs = []
    for rv in rivers:
        P = rv["P"]
        width = rv["width"]
        # salta i punti dentro i laghi (superficie ferma già coperta dai WaterBlock)
        keep = np.ones(len(P), dtype=bool)
        for name, lk in lake_masks.items():
            inside = grid.sample(lk["mask"].astype(np.float32), P[:, 0], P[:, 1]) > 0.5
            keep &= ~inside
        idx = np.nonzero(keep)[0]
        if len(idx) < 2:
            continue
        # campionamento ogni ~16 m, più fitto dove la pendenza cambia
        sel = [idx[0]]
        for i in idx[1:]:
            if np.hypot(*(P[i, :2] - P[sel[-1], :2])) >= 16.0 or i == idx[-1]:
                sel.append(i)
        nodes = [[float(P[i, 0]), float(P[i, 1]), float(P[i, 2]), float(width[i] + 2.0), float(rv["depth"] + 0.6), 0, 0, 1]
                 for i in sel]
        obj = {"class": "River", "name": rv["name"].replace(" ", "_"), "position": nodes[0][:3], "nodes": nodes,
               "flowMagnitudePhysics": 1.6, "fullReflect": False, "lowLODDistance": 120, "SubdivideLength": 4}
        obj.update(WATER_COMMON)
        obj["overallWaveMagnitude"] = 0.05
        scene.add("MissionGroup/Level_objects/water", obj)
        river_objs.append({"name": rv["name"], "nodes": len(nodes)})
    return blocks, river_objs


def spawn_objects(scene, net, spawns: list) -> list:
    """Spawn su punti delle strade: posizione sulla carreggiata, orientamento lungo la strada."""
    out = []
    for sp in spawns:
        road = net.roads[sp["road"]]
        s = sp["s"] if sp["s"] >= 0 else road.length + sp["s"]
        k = int(road.idx(s))
        off = sp.get("offset", 0.0)
        if road.dual:
            off = -(road.t["median"] / 2.0 + road.t["carriageway"] / 2.0 + 1.0)
        elif road.t.get("lanes", 2) >= 2:
            off = -road.spec.get("width", road.t.get("width", 6)) / 4.0
        x, y = road.P[k] + road.nor[k] * off
        z = float(road.surface(np.array([s]), np.array([off]))[0]) + 0.6
        fx, fy = road.tan[k] * (-1.0 if sp.get("reverse") else 1.0)
        scene.add("MissionGroup/PlayerDropPoints", {
            "name": sp["name"], "class": "SpawnSphere", "position": [float(x), float(y), z],
            "autoplaceOnSpawn": "0", "dataBlock": "SpawnSphereMarker", "radius": 5, "sphereWeight": "1",
            "indoorWeight": "1", "outdoorWeight": "1", "homingCount": "0", "lockCount": "0",
            "rotationMatrix": rotation_facing(fx, fy),
        })
        out.append({**sp, "position": [float(x), float(y), z]})
    return out


def info_json(world: dict, spawns: list, previews: list, default_spawn: str) -> dict:
    size = world["terrain"]["size"] * world["terrain"]["square_size"]
    return {
        "title": world["title"],
        "description": world["description"],
        "previews": previews,
        "size": [int(size), int(size)],
        "authors": world["authors"],
        "biome": "alpino, laghi, foreste, pianura, calanchi",
        "roads": "autostrada, tangenziale, statali, strade di montagna, sterrati, percorsi estremi",
        "suitablefor": "freeroam, fuoristrada, rally, prove di velocità",
        "features": "montagne gigantesche, tornanti, canyon, laghi, ponti, viadotti",
        "defaultSpawnPointName": default_spawn,
        "spawnPoints": [{"translationId": sp["title"], "objectname": sp["name"], "preview": sp.get("preview", previews[0] if previews else "")}
                        for sp in spawns],
    }


def write_info(level_dir: Path, info: dict):
    (level_dir / "info.json").write_text(json.dumps(info, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
