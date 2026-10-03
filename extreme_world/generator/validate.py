#!/usr/bin/env python3
"""Validazione del livello generato (controlli statici, senza avviare BeamNG).

Uso: python validate.py [cartella_build]

Controlla formati, riferimenti incrociati, guidabilità delle strade sul terreno quantizzato e
coerenza dell'acqua. Esce con codice 1 se trova errori.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from ew.geom import Grid  # noqa: E402
from ew.ter import read_ter, u16_to_heights  # noqa: E402


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.info = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def ok(self, msg):
        self.info.append(msg)


def load_scene(level_dir: Path):
    objs = []
    for f in sorted((level_dir / "main").rglob("items.level.json")):
        for ln, line in enumerate(f.read_text().splitlines(), 1):
            if not line.strip():
                continue
            o = json.loads(line)
            o["__file__"] = f"{f.relative_to(level_dir)}:{ln}"
            objs.append(o)
    return objs


def load_materials(level_dir: Path):
    mats = {}
    for f in level_dir.rglob("*.materials.json"):
        d = json.loads(f.read_text())
        for k, v in d.items():
            v["__file__"] = str(f.relative_to(level_dir))
            mats[k] = v
            if "mapTo" in v:
                mats.setdefault(v["mapTo"], v)
    return mats


def texture_paths(obj):
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and v.lower().endswith((".png", ".dds", ".jpg", ".jpeg")):
                out.append((k, v))
            else:
                out += texture_paths(v)
    elif isinstance(obj, list):
        for v in obj:
            out += texture_paths(v)
    return out


def validate(build_dir: Path) -> Report:
    R = Report()
    world = json.loads((HERE.parent / "config/world.json").read_text())
    name = world["level_name"]
    level_dir = build_dir / "levels" / name
    tcfg = world["terrain"]

    # ---------------------------------------------------------------- file base
    for req in ("info.json", "theTerrain.ter", "theTerrain.terrain.json", "main/items.level.json",
                "art/terrains/main.materials.json"):
        if not (level_dir / req).exists():
            R.err(f"manca il file obbligatorio {req}")
    info = json.loads((level_dir / "info.json").read_text())

    # ---------------------------------------------------------------- terreno
    ter = read_ter(level_dir / "theTerrain.ter")
    tj = json.loads((level_dir / "theTerrain.terrain.json").read_text())
    if ter.size != tcfg["size"] or tj["size"] != ter.size:
        R.err(f"dimensione terreno incoerente: ter {ter.size}, json {tj['size']}, config {tcfg['size']}")
    if tj["materials"] != ter.materials:
        R.err("i materiali di .terrain.json non coincidono con quelli del .ter")
    used = np.unique(ter.layers)
    bad = [int(u) for u in used if u != 255 and u >= len(ter.materials)]
    if bad:
        R.err(f"indici di layer senza materiale: {bad}")
    R.ok(f".ter v{ter.version} {ter.size}x{ter.size}, {len(ter.materials)} materiali, layer usati {len(used)}")
    h = u16_to_heights(ter.heights, tcfg["max_height"], tcfg["z_offset"]).astype(np.float32)
    g = Grid.for_world(tcfg["size"], tcfg["square_size"])
    R.ok(f"quote del terreno {h.min():.1f} .. {h.max():.1f} m (passo di quantizzazione {tcfg['max_height'] / 65535 * 100:.2f} cm)")
    if ter.heights.max() == 65535 or ter.heights.min() == 0:
        R.warn("la heightmap tocca i limiti 0/65535: possibile troncamento delle quote")

    # ---------------------------------------------------------- materiali
    mats = load_materials(level_dir)
    tmats = {v["internalName"]: v for v in json.loads((level_dir / "art/terrains/main.materials.json").read_text()).values()
             if v.get("class") == "TerrainMaterial"}
    texset = [v for v in json.loads((level_dir / "art/terrains/main.materials.json").read_text()).values()
              if v.get("class") == "TerrainMaterialTextureSet"]
    for m in ter.materials:
        if m not in tmats:
            R.err(f"materiale del terreno {m} senza TerrainMaterial")
    if len(texset) != 1:
        R.err("serve esattamente un TerrainMaterialTextureSet")
    else:
        ts = texset[0]
        sizes = {"Base": ts["baseTexSize"], "Detail": ts["detailTexSize"], "Macro": ts["macroTexSize"]}
        modes = defaultdict(set)
        for mname, m in tmats.items():
            for key, val in m.items():
                if not key.endswith("Tex"):
                    continue
                slot = next(s for s in ("Base", "Detail", "Macro") if s in key)
                p = level_dir / val.replace(f"/levels/{name}/", "")
                if not p.exists():
                    R.err(f"{mname}.{key}: texture mancante {val}")
                    continue
                im = Image.open(p)
                if list(im.size) != list(sizes[slot]):
                    R.err(f"{mname}.{key}: {im.size} diverso da {slot}TexSize {sizes[slot]}")
                modes[key.replace(slot, "*")].add(im.mode)
        for k, ms in modes.items():
            if len(ms) > 1:
                R.err(f"formati diversi nello stesso array di texture {k}: {ms}")
        R.ok(f"materiali del terreno: {len(tmats)}, texture coerenti con il TextureSet {sizes}")
    gms = Counter(m["groundmodelName"] for m in tmats.values())
    known = {"ASPHALT", "ASPHALT_WET", "ROCK", "DIRT", "DIRT_DUSTY", "SAND", "SANDY_ROAD", "MUD", "GRAVEL", "GRASS", "ICE", "SNOW"}
    for gm in gms:
        if gm not in known:
            R.err(f"groundmodel non verificato: {gm}")
    # texture di tutti i materiali
    missing = 0
    external = set()
    for mname, m in mats.items():
        for key, val in texture_paths(m):
            if val.startswith(f"/levels/{name}/"):
                if not (level_dir / val.replace(f"/levels/{name}/", "")).exists():
                    R.err(f"{mname}.{key}: file mancante {val}")
                    missing += 1
            else:
                external.add(val)

    # ---------------------------------------------------------------- scena
    objs = load_scene(level_dir)
    pids = Counter(o.get("persistentId") for o in objs)
    dup = [p for p, c in pids.items() if c > 1]
    if dup:
        R.err(f"persistentId duplicati: {len(dup)}")
    groups = {o["name"] for o in objs if o["class"] == "SimGroup"}
    for o in objs:
        if o.get("__parent") not in groups and o["class"] != "SimGroup" or (o["class"] == "SimGroup" and o["name"] != "MissionGroup" and o.get("__parent") not in groups):
            R.err(f"{o['__file__']}: __parent {o.get('__parent')} inesistente")
        for key in ("position", "scale"):
            if key in o and not all(np.isfinite(o[key])):
                R.err(f"{o['__file__']}: {key} non finito")
    cls = Counter(o["class"] for o in objs)
    R.ok("oggetti di scena: " + ", ".join(f"{k} {v}" for k, v in sorted(cls.items())))
    for req in ("LevelInfo", "TerrainBlock", "ScatterSky", "TimeOfDay", "SpawnSphere"):
        if cls[req] == 0:
            R.err(f"manca un oggetto {req}")
    for o in objs:
        for key in ("material", "topMaterial", "bottomMaterial", "sideMaterial"):
            if key in o and o[key] not in mats:
                R.err(f"{o['__file__']}: materiale {o[key]} non definito")
        if o["class"] in ("TSStatic",):
            p = level_dir / o["shapeName"].replace(f"/levels/{name}/", "")
            if not p.exists():
                R.err(f"{o['__file__']}: mesh mancante {o['shapeName']}")
    tb = next(o for o in objs if o["class"] == "TerrainBlock")
    if tb["terrainFile"] != f"/levels/{name}/theTerrain.ter":
        R.err("TerrainBlock.terrainFile errato")
    if tb["materialTextureSet"] not in mats and tb["materialTextureSet"] not in [t.get("name") for t in texset]:
        R.err("materialTextureSet non definito")

    # ---------------------------------------------------------------- spawn
    spawns = {o["name"]: o for o in objs if o["class"] == "SpawnSphere"}
    for sp in info["spawnPoints"]:
        if sp["objectname"] not in spawns:
            R.err(f"info.json: spawn {sp['objectname']} senza SpawnSphere")
    if info["defaultSpawnPointName"] not in spawns:
        R.err("info.json: defaultSpawnPointName inesistente")
    for nm, o in spawns.items():
        x, y, z = o["position"]
        tz = float(g.sample(h, x, y))
        win = g.window(x - 4, y - 4, x + 4, y + 4)
        span = float(h[win].max() - h[win].min())
        if not (0.2 <= z - tz <= 2.5):
            R.err(f"spawn {nm}: {z - tz:.2f} m sopra il terreno (atteso 0.2..2.5)")
        if span > 1.2:
            R.warn(f"spawn {nm}: terreno irregolare entro 4 m ({span:.2f} m)")
        R.ok(f"spawn {nm}: {z - tz:.2f} m sopra il terreno, dislivello locale {span:.2f} m")
    for p in info.get("previews", []):
        if not (level_dir / p).exists():
            R.err(f"anteprima mancante {p}")

    # --------------------------------------------- guidabilità delle strade
    report = json.loads((build_dir / "report.json").read_text())
    road_objs = [o for o in objs if o["class"] == "DecalRoad" and o.get("material") not in ("ew_road_invisible",)]
    bridges = [o for o in objs if o["class"] == "MeshRoad"]
    ai = [o for o in objs if o["class"] == "DecalRoad" and o.get("material") == "ew_road_invisible"]
    R.ok(f"DecalRoad visibili {len(road_objs)}, IA {len(ai)}, impalcati MeshRoad {len(bridges)}")
    worst = []
    for o in ai:
        N = np.array(o["nodes"])
        # ricampiona la linea ogni 1 m e confronta con il terreno
        seg = np.linalg.norm(np.diff(N[:, :2], axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        ss = np.arange(0, s[-1], 1.0)
        x = np.interp(ss, s, N[:, 0])
        y = np.interp(ss, s, N[:, 1])
        zt = g.sample(h, x, y)
        zn = np.interp(ss, s, N[:, 2])
        on_ground = np.abs(zt - zn) < 0.6
        if on_ground.sum() < 10:
            continue
        # gradini: variazione di pendenza tra campioni consecutivi sul terreno
        dz = np.diff(zt)
        ok = on_ground[1:] & on_ground[:-1]
        step = np.abs(np.diff(dz))[ok[1:] & ok[:-1]] if len(dz) > 2 else np.array([0])
        grade = np.abs(dz[ok])
        worst.append((o["__file__"], float(step.max() if step.size else 0), float(np.percentile(step, 99.5) if step.size else 0),
                      float(grade.max() if grade.size else 0), float(1 - on_ground.mean())))
    if worst:
        mx = max(worst, key=lambda w: w[2])
        R.ok(f"profilo stradale sul terreno quantizzato: discontinuità di pendenza 99.5° percentile max {mx[2] * 100:.1f} cm/m ({mx[0]})")
        for w in worst:
            if w[1] > 0.12:
                R.warn(f"{w[0]}: discontinuità di pendenza puntuale {w[1] * 100:.1f} cm su 1 m")
    # pendenze dichiarate
    for rid, r in report["roads"].items():
        R.ok(f"strada {rid}: {r['length_m']} m, quote {r['z_min']}-{r['z_max']} m, pendenza max {r['max_grade_pct']}%")

    # ---------------------------------------------------------------- acqua
    from scipy import ndimage
    covered = np.zeros(h.shape, dtype=bool)
    for o in objs:
        if o["class"] != "WaterBlock":
            continue
        cx, cy, lvl = o["position"]
        sx, sy, sz = o["scale"]
        m = o.get("rotationMatrix", [1, 0, 0, 0, 1, 0, 0, 0, 1])
        ax, ay = m[0], m[1]          # asse X locale nel mondo
        rad = 0.5 * float(np.hypot(sx, sy))
        win = g.window(cx - rad, cy - rad, cx + rad, cy + rad)
        X, Y = g.window_mesh(win)
        u = (X - cx) * ax + (Y - cy) * ay
        v = -(X - cx) * ay + (Y - cy) * ax
        inside = (np.abs(u) <= sx / 2) & (np.abs(v) <= sy / 2)
        sub = h[win]
        below = (sub < lvl - 0.02) & inside
        covered[win] |= below
        if below.any() and sz / 2 < lvl - sub[below].min():
            R.err(f"{o['name']}: blocco troppo poco profondo")
        # il blocco non deve coprire terreno sotto il livello staccato dal lago principale
        lab, n = ndimage.label(below)
        if n > 1:
            sizes = sorted(ndimage.sum(below, lab, range(1, n + 1)))
            if sizes[-2] > 25:
                R.warn(f"{o['name']}: {n} zone sotto il livello nel blocco (seconda {sizes[-2]:.0f} vertici)")
    blocks = report.get("water_blocks_detail", [])
    for lake, cov in report.get("water_coverage", {}).items():
        (R.ok if cov > 0.97 else R.warn)(f"lago {lake}: superficie coperta da WaterBlock {cov * 100:.1f}%")
    R.ok(f"WaterBlock {cls['WaterBlock']}, River {cls['River']}")
    if external:
        R.ok("texture di sistema referenziate (fornite dal gioco): " + ", ".join(sorted(external)))

    # ---------------------------------------------------------- dimensioni
    total = sum(f.stat().st_size for f in level_dir.rglob("*") if f.is_file())
    nfiles = sum(1 for f in level_dir.rglob("*") if f.is_file())
    R.ok(f"dimensione del livello: {total / 1e6:.1f} MB in {nfiles} file")
    return R


if __name__ == "__main__":
    bd = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "build"
    R = validate(bd)
    for m in R.info:
        print("  OK   ", m)
    for m in R.warnings:
        print("  AVV  ", m)
    for m in R.errors:
        print("  ERR  ", m)
    print(f"\n{len(R.errors)} errori, {len(R.warnings)} avvisi")
    sys.exit(1 if R.errors else 0)
