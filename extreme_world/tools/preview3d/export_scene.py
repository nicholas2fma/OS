#!/usr/bin/env python3
"""Esporta una porzione del livello generato per il visualizzatore three.js (preview3d).

Uso: python export_scene.py <cartella_build> <cx> <cy> <mezzo_lato_m> <uscita_dir> [max_istanze_per_tipo]
Scrive terrain.bin (quote float32), colors.bin (RGB uint8), scene.json (oggetti) e copia
i .dae necessari, così la vista usa esattamente i file del livello.
"""

import json
import shutil
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "generator"))

from ew.geom import Grid  # noqa: E402
from ew.ter import read_ter, u16_to_heights  # noqa: E402


def main():
    build = Path(sys.argv[1])
    cx, cy, half = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
    out = Path(sys.argv[5])
    out.mkdir(parents=True, exist_ok=True)
    world = json.loads((ROOT / "config/world.json").read_text())
    name = world["level_name"]
    lvl = build / "levels" / name
    t = world["terrain"]
    ter = read_ter(lvl / "theTerrain.ter")
    h = u16_to_heights(ter.heights, t["max_height"], t["z_offset"]).astype(np.float32)
    g = Grid.for_world(t["size"], t["square_size"])
    win = g.window(cx - half, cy - half, cx + half, cy + half)
    sy, sx = win
    step = 1 if half <= 700 else 2
    sub = h[sy, sx][::step, ::step]
    lay = ter.layers[sy, sx][::step, ::step]
    mats = json.loads((lvl / "art/terrains/main.materials.json").read_text())
    # colore medio di ogni materiale dalla sua texture Base
    from PIL import Image
    colors = []
    for m in ter.materials:
        mm = next(v for v in mats.values() if v.get("internalName") == m)
        p = lvl / mm["baseColorBaseTex"].replace(f"/levels/{name}/", "")
        colors.append(np.asarray(Image.open(p).convert("RGB")).reshape(-1, 3).mean(0))
    colors = np.array(colors + [[255, 0, 255]] * (256 - len(colors)), dtype=np.float32)
    rgb = colors[lay].astype(np.uint8)
    (lay == 255).astype(np.uint8).tofile(out / "holes.bin")
    sub.astype("<f4").tofile(out / "terrain.bin")
    rgb.tofile(out / "colors.bin")
    x0 = g.x0 + sx.start * g.step
    y0 = g.y0 + sy.start * g.step
    objs = []
    for f in (lvl / "main").rglob("items.level.json"):
        for line in f.read_text().splitlines():
            o = json.loads(line)
            c = o["class"]
            pos = o.get("position")
            if c in ("TSStatic",):
                if abs(pos[0] - cx) > half + 400 or abs(pos[1] - cy) > half + 400:
                    continue
                src = lvl / o["shapeName"].replace(f"/levels/{name}/", "")
                dst = out / "shapes" / src.name
                dst.parent.mkdir(exist_ok=True)
                shutil.copy(src, dst)
                objs.append({"class": c, "position": pos, "shape": f"shapes/{src.name}"})
            elif c in ("DecalRoad", "MeshRoad", "River"):
                N = np.array(o["nodes"])
                if (np.abs(N[:, 0] - cx) > half + 50).all() or (np.abs(N[:, 1] - cy) > half + 50).all():
                    continue
                objs.append({"class": c, "material": o.get("material", ""), "nodes": o["nodes"]})
            elif c == "WaterBlock":
                objs.append({"class": c, "position": pos, "scale": o["scale"], "rot": o.get("rotationMatrix")})
            elif c == "SpawnSphere":
                objs.append({"class": c, "position": pos, "rot": o["rotationMatrix"]})
    # vegetazione (Forest): istanze nella finestra, mesh e texture della cartella veg
    forest = {}
    vegtex = []
    fdir = lvl / "forest"
    if fdir.exists():
        cap = int(sys.argv[6]) if len(sys.argv) > 6 else 40000
        vdst = out / "veg"
        vdst.mkdir(exist_ok=True)
        for f in sorted(fdir.glob("*.forest4.json")):
            items = []
            for line in f.read_text().splitlines():
                o = json.loads(line)
                x, y, z = o["pos"]
                if abs(x - cx) <= half and abs(y - cy) <= half:
                    rm = o["rotationMatrix"]
                    items.append([x, y, z, float(np.arctan2(rm[1], rm[0])), o["scale"]])
            if not items:
                continue
            ftype = f.name.replace(".forest4.json", "")
            forest[ftype] = items[:cap]
            src = lvl / "art/shapes/ew/veg" / f"{ftype}.dae"
            shutil.copy(src, vdst / src.name)
        for t in (lvl / "art/shapes/ew/veg").glob("*_b.png"):
            shutil.copy(t, vdst / t.name)
            vegtex.append(t.name[:-6])
    # texture base dei materiali degli oggetti (strutture, edifici, moduli): nome materiale -> png
    vdst = out / "veg"
    vdst.mkdir(exist_ok=True)
    for mf in (lvl / "art/shapes").rglob("*.materials.json"):
        for mname, m in json.loads(mf.read_text()).items():
            st = (m.get("Stages") or [{}])[0]
            tex = st.get("baseColorMap") or st.get("colorMap")
            if not tex or mname in vegtex:
                continue
            src = lvl / tex.replace(f"/levels/{name}/", "")
            if src.exists():
                shutil.copy(src, vdst / f"{mname}_b{src.suffix}")
                vegtex.append(mname)
    meta = {"x0": x0, "y0": y0, "step": g.step * step, "nx": sub.shape[1], "ny": sub.shape[0], "objects": objs,
            "forest": forest, "vegtex": vegtex}
    (out / "scene.json").write_text(json.dumps(meta))
    print(f"esportati {len(objs)} oggetti, terreno {sub.shape}, vegetazione "
          f"{sum(len(v) for v in forest.values())} istanze")


if __name__ == "__main__":
    main()
