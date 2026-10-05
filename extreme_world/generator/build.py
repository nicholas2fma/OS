#!/usr/bin/env python3
"""Costruisce il livello Extreme World per BeamNG.drive.

Uso:
    python build.py                 # build completa -> ../build/levels/extreme_world + zip
    python build.py --no-zip        # senza archivio
    python build.py --macro 1024    # rilievo macro a risoluzione ridotta (prove veloci)

Requisiti: Python 3.10+, numpy, scipy, pillow, numba, scikit-image.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
import zipfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from ew import materials as M  # noqa: E402
from ew.geom import PolylineField  # noqa: E402
from ew.level.environment import (environment_objects, info_json, spawn_objects, terrain_block,  # noqa: E402
                                  water_objects, write_info)
from ew.level.objmaterials import write_object_materials  # noqa: E402
from ew.level.scene import SceneWriter  # noqa: E402
from ew.pipeline import Context, load_json, stage_terrain  # noqa: E402
from ew.render3d import render_view  # noqa: E402
from ew import structures as S  # noqa: E402
from ew import vegetation as VG  # noqa: E402
from ew.roads import decals as D  # noqa: E402
from ew.roads.network import RoadNetwork  # noqa: E402
from ew.ter import heights_to_u16, write_ter, write_terrain_json  # noqa: E402
from ew.water import lake_mask  # noqa: E402


def named_lines(lf):
    lines = {}
    lines.update({"valley:" + v["name"]: v["line"] for v in lf.get("valleys", [])})
    lines.update({"river:" + r["name"]: r["line"] for r in lf.get("rivers", [])})
    lines.update({"canyon:" + c["name"]: c["line"] for c in lf.get("canyons", [])})
    return lines


def river_distance(g, h, rivers):
    """Distanza (m) dal bordo dell'acqua dei fiumi (0 dentro l'alveo)."""
    dist = np.full(h.shape, 1e6, dtype=np.float32)
    for rv in rivers:
        P = rv["P"]
        f = PolylineField(P[:, :2])
        pad = float(rv["width"].max()) + 12.0
        win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=pad)
        X, Y = g.window_mesh(win)
        d, s, _ = f.query(X, Y, max_dist=pad)
        w = np.interp(s, f.s, rv["width"]) / 2.0
        dist[win] = np.minimum(dist[win], np.maximum(d - w, 0.0))
    return dist


def build(args):
    t0 = time.time()
    ctx = Context(build_dir=args.build_dir, macro_res=args.macro)
    world = ctx.world
    name = world["level_name"]
    out_root = ctx.build_dir
    level_dir = out_root / "levels" / name
    if level_dir.exists():
        shutil.rmtree(level_dir)
    level_dir.mkdir(parents=True)
    report = {"level": name, "steps": []}

    # 1. terreno naturale + acqua
    T = stage_terrain(ctx)
    g = T["grid"]
    ctx.log("terreno pronto")

    # 2. strade
    types = load_json("road_types.json")
    roads_cfg = load_json("roads.json")["roads"]
    net = RoadNetwork(g, T["h"], types, rivers=T["rivers"], lakes=T["lakes"], lines=named_lines(ctx.landforms), dam=T.get("dam"))
    for spec in roads_cfg:
        net.add_any(spec)
    h = T["h"].copy()
    road_masks = net.stamp_all(h)
    # cordone dei laghi ripristinato dopo le scarpate stradali (fuori dalle piattaforme e
    # dall'emissario): nessuna trincea apre la sponda
    from scipy import ndimage
    for nm, lk in T["lakes"].items():
        if lk.get("kind") != "lake" or "inside" not in lk:
            continue
        win = lk["window"]
        d_out = ndimage.distance_transform_edt(~lk["inside"]) * g.step
        need = (~lk["inside"]) & (d_out < 22.0) & ~lk["outlet"] & (road_masks["core_id"][win] < 0)
        sub = h[win]
        sub[need] = np.maximum(sub[need], lk["level"] + 0.6)
    ctx.log(f"strade: {len(net.roads)} tracciati, terreno modellato")

    # 3. acqua finale sul terreno definitivo
    lake_masks = {nm: {"mask": lake_mask(g, h, lk), "level": lk["level"], "kind": lk["kind"]}
                  for nm, lk in T["lakes"].items()}
    rdist = river_distance(g, h, T["rivers"])

    # 4. densità della vegetazione (serve anche al sottobosco della layer map)
    keepout = []
    for r in net.roads.values():
        for st in r.structures:
            if st.kind == "bridge":
                for s_k in np.arange(st.s0, st.s1 + 1.0, 8.0):
                    x, y = r.point(np.array([s_k]))[0]
                    keepout.append((float(x), float(y), r.half_paved + 12.0))
            else:
                for s_k in (st.s0, st.s1):
                    x, y = r.point(np.array([s_k]))[0]
                    keepout.append((float(x), float(y), 45.0))
    if T.get("dam"):
        a_, b_ = np.array(T["dam"]["a"], float), np.array(T["dam"]["b"], float)
        for t_ in np.linspace(-0.3, 1.3, 12):
            p_ = a_ + (b_ - a_) * t_
            keepout.append((float(p_[0]), float(p_[1]), 60.0))
    veg = VG.forest_density(g, h, ctx.landforms, ctx.noise, {
        "core_id": road_masks["core_id"], "lake_masks": list(lake_masks.values()), "river_dist": rdist,
        "keepout": keepout})
    ctx.log("densità della vegetazione pronta")

    # 5. materiali e layer map
    terrain_mats, colors = M.write_terrain_materials(name, level_dir, world["seed"])
    road_layers = {net.order.index(rid): (r.t["layer"], r.t["verge_layer"]) for rid, r in net.roads.items()}
    from ew.geom import polygon_mask
    badlands = polygon_mask(g, ctx.landforms["badlands"]["poly"]) if ctx.landforms.get("badlands") else None
    layers = M.classify_layers(g, h, {
        "noise": ctx.noise, "cliff": T["cliff"], "canyon_rock": T["canyon_rock"], "badlands": badlands,
        "lakes": list(lake_masks.values()), "river_dist": rdist, "roads": road_masks, "road_layers": road_layers,
        "forest": veg["tree"],
    })
    ctx.log("layer map pronta")

    # 6. scena
    tcfg = world["terrain"]
    scene = SceneWriter(name)
    environment_objects(scene, world, name, level_dir, world["seed"])
    terrain_block(scene, name, tcfg, M.TEXSET)
    road_files = D.write_road_textures(level_dir, name, world["seed"])
    road_mats = D.road_materials(name, road_files)
    (level_dir / D.ART / "main.materials.json").write_text(json.dumps(road_mats, indent=2) + "\n")
    obj_mats = write_object_materials(level_dir, name, world["seed"])
    obj_mats.update(VG.write_vegetation_textures(level_dir, name, world["seed"]))
    (level_dir / "art/shapes/ew/main.materials.json").write_text(json.dumps(obj_mats, indent=2) + "\n")
    n_decals = 0
    bridges = []
    for rid in net.order:
        n_decals += D.road_scene_objects(net.roads[rid], scene)
        bridges += D.bridge_meshroads(net.roads[rid], scene)
    sw = S.StructureWriter(level_dir, name, scene, g, h)
    st_bridges = S.bridge_structures(sw, net, bridges, road_masks["core_id"], rdist)
    st_rails = S.guardrails(sw, net, h)
    st_dam = S.dam_structure(sw, T.get("dam"), T["h"])
    st_tun = S.tunnel_structures(sw, net, layers, road_masks["core_id"])
    ctx.log(f"strutture: {len(sw.files)} mesh, {sw.tris} triangoli, ponti {st_bridges}, guardrail {st_rails}")
    blocks, river_objs = water_objects(scene, g, h, lake_masks, T["rivers"], T["lakes"])
    # file del terreno (dopo le gallerie: i fori sono nella layer map)
    tcfg = world["terrain"]
    hu16 = heights_to_u16(h, tcfg["max_height"], tcfg["z_offset"])
    write_ter(level_dir / "theTerrain.ter", hu16, layers, M.NAMES)
    write_terrain_json(level_dir / "theTerrain.terrain.json", name, "theTerrain.ter", tcfg["size"], M.NAMES)
    (level_dir / "art/terrains/main.materials.json").write_text(json.dumps(terrain_mats, indent=2) + "\n")


    # vegetazione sul terreno definitivo (dopo gallerie e riporti)
    veg_tris = VG.write_vegetation_shapes(level_dir, name, world["seed"])
    VG.rock_density(veg, layers, M.IDX)
    placed = VG.place_vegetation(g, h, veg, world["seed"])
    forest_counts = VG.write_forest(level_dir, placed)
    scene.add("MissionGroup/vegetation", {"class": "Forest", "name": "theForest"})
    ctx.log(f"vegetazione: {sum(forest_counts.values())} istanze {forest_counts}")

    spawns_cfg = load_json("spawns.json")
    spawns = spawn_objects(scene, net, spawns_cfg["spawns"])
    written = scene.write(level_dir)
    ctx.log(f"scena: {scene.count()} oggetti in {len(written)} file")

    # 7. anteprime (dai dati reali del terreno)
    pal = np.zeros((256, 3), dtype=np.float32)
    pal[:len(M.NAMES)] = [colors[nm] for nm in M.NAMES]
    albedo = pal[layers] / 255.0
    water_lvl = np.full(h.shape, -1e9, dtype=np.float32)
    for lk in lake_masks.values():
        water_lvl[lk["mask"]] = lk["level"]
    previews = []
    views = [((150, 500, 560), (-450, 2750, 1350), "extreme_world_preview_giant.jpg"),
             ((2300, 900, 760), (3000, 2600, 1150), "extreme_world_preview_wall.jpg"),
             ((-600, -2700, 300), (500, 1500, 700), "extreme_world_preview_plain.jpg")]
    for cam, target, fname in views:
        p = level_dir / fname
        render_view(h, g, cam, target, p.with_suffix(".png"), width=1280, height=720, albedo=albedo, water=water_lvl)
        from PIL import Image
        Image.open(p.with_suffix(".png")).convert("RGB").save(p, quality=88)
        p.with_suffix(".png").unlink()
        previews.append(fname)
    write_info(level_dir, info_json(world, spawns_cfg["spawns"], previews, spawns_cfg["default"]))

    # 8. resoconto
    report.update({
        "roads": {rid: {"type": r.kind, "length_m": round(r.length), "z_min": round(float(r.z.min()), 1),
                        "z_max": round(float(r.z.max()), 1),
                        "max_grade_pct": round(float(np.abs(np.diff(r.z)).max() / 2.0 * 100), 1),
                        "structures": [{"kind": s.kind, "s0": round(s.s0), "s1": round(s.s1), "why": s.reason} for s in r.structures]}
                  for rid, r in net.roads.items()},
        "decals": n_decals, "bridges": len(bridges), "water_blocks": len(blocks), "rivers": river_objs,
        "water_coverage": {b["lake"]: b["coverage"] for b in blocks},
        "structures": {"meshes": len(sw.files), "triangles": sw.tris, "bridges": st_bridges, "guardrails": st_rails, "dam": st_dam,
                       "tunnels": st_tun},
        "spawns": spawns, "scene_objects": scene.count(),
        "vegetation": {"instances": forest_counts, "triangles_lod0_lod1": veg_tris},
        "height_range_m": [round(float(h.min()), 1), round(float(h.max()), 1)],
        "layers_used": {(M.NAMES[i] if i < len(M.NAMES) else "buco"): int(c) for i, c in zip(*np.unique(layers, return_counts=True))},
    })
    (out_root / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    np.save(out_root / "cache" / "final_h.npy", h)
    np.save(out_root / "cache" / "final_layers.npy", layers)

    # 9. archivio della mod
    if not args.no_zip:
        zpath = out_root / world["build"]["zip_name"]
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for f in sorted(level_dir.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(out_root).as_posix())
        ctx.log(f"archivio: {zpath} ({zpath.stat().st_size / 1e6:.1f} MB)")
    ctx.log(f"build completata in {time.time() - t0:.0f} s")
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--build-dir", default=str(HERE.parent / "build"))
    ap.add_argument("--macro", type=int, default=None, help="risoluzione del rilievo macro (default da world.json)")
    ap.add_argument("--no-zip", action="store_true")
    build(ap.parse_args())
