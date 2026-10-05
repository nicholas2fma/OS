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
    # mesh Collada: parsing rigoroso (pycollada) e materiali definiti
    try:
        import collada
        dae_files = sorted(level_dir.rglob("*.dae"))
        bad_dae = 0
        dae_tris = 0
        for f in dae_files:
            try:
                d = collada.Collada(str(f))
                for mat in d.materials:
                    if mat.id not in mats:
                        R.err(f"{f.name}: materiale {mat.id} senza definizione in *.materials.json")
                for geo in d.geometries:
                    for prim in geo.primitives:
                        dae_tris += len(prim)
                names = [n.id for n in d.scene.nodes]
                if names != ["base00"] or not any(c.id == "start01" for c in d.scene.nodes[0].children):
                    R.err(f"{f.name}: gerarchia diversa da base00/start01")
            except Exception as ex:  # noqa: BLE001
                bad_dae += 1
                R.err(f"{f.name}: Collada non valido ({ex})")
        R.ok(f"mesh Collada: {len(dae_files)} file validi secondo pycollada, {dae_tris} triangoli totali")
    except ImportError:
        R.warn("pycollada non installato: mesh non verificate")
    # ------------------------------------------------------------ vegetazione (Forest)
    fdir = level_dir / "forest"
    if fdir.exists():
        mi = level_dir / "art/forest/managedItemData.json"
        items = json.loads(mi.read_text()) if mi.exists() else {}
        if not items:
            R.err("forest/ presente ma art/forest/managedItemData.json mancante o vuoto")
        for k, it in items.items():
            if it.get("class") != "TSForestItemData" or it.get("name") != k:
                R.err(f"managedItemData {k}: class/name incoerenti")
            sp = level_dir / str(it.get("shapeFile", "")).replace(f"/levels/{name}/", "")
            if not sp.exists():
                R.err(f"managedItemData {k}: shapeFile mancante {it.get('shapeFile')}")
        if cls["Forest"] != 1:
            R.err(f"serve un solo oggetto Forest (trovati {cls['Forest']})")
        n_inst, off, worst = 0, [], 0.0
        for f in sorted(fdir.glob("*.forest4.json")):
            tname = f.name[: -len(".forest4.json")]
            if tname not in items:
                R.err(f"{f.name}: tipo senza ForestItemData")
            rows = []
            for ln, line in enumerate(f.read_text().splitlines(), 1):
                o = json.loads(line)
                if o.get("type") != tname or len(o.get("rotationMatrix", [])) != 9 or not np.isfinite(o["pos"]).all():
                    R.err(f"{f.name}:{ln}: riga non valida")
                    break
                rows.append(o["pos"])
            if not rows:
                continue
            P = np.array(rows)
            n_inst += len(P)
            inside = (np.abs(P[:, 0]) < 4096) & (np.abs(P[:, 1]) < 4096)
            if not inside.all():
                R.err(f"{f.name}: {int((~inside).sum())} istanze fuori dal terreno")
            dz = P[inside, 2] - g.sample(h, P[inside, 0], P[inside, 1])
            off.append(dz)
            worst = max(worst, float(np.abs(dz).max()))
        if off:
            dz = np.concatenate(off)
            bad = int(((dz > 0.3) | (dz < -3.0)).sum())
            (R.warn if bad else R.ok)(f"vegetazione: {n_inst} istanze in {len(items)} tipi; base rispetto al terreno "
                                      f"{np.percentile(dz, 1):.2f}..{np.percentile(dz, 99):.2f} m"
                                      + (f", {bad} fuori da [-3, +0.3] m" if bad else ""))
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
        rm = o["rotationMatrix"]
        fwd = -np.array(rm[3:5])       # frontale del veicolo = -Y locale
        lat = np.array(rm[0:2])
        pts = [np.array([x, y]) + fwd * a + lat * b for a in (-2.4, 0, 2.4) for b in (-0.95, 0.95)]
        zs = [float(g.sample(h, p[0], p[1])) for p in pts]
        span = max(zs) - min(zs)
        if not (0.2 <= z - tz <= 2.5):
            R.err(f"spawn {nm}: {z - tz:.2f} m sopra il terreno (atteso 0.2..2.5)")
        if span > 0.6:
            R.warn(f"spawn {nm}: dislivello sotto l'impronta del veicolo {span:.2f} m")
        R.ok(f"spawn {nm}: {z - tz:.2f} m sopra il terreno, dislivello sotto l'impronta del veicolo {span:.2f} m")
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
    # testate dei ponti: esclusione geometrica (le stazioni delle linee IA sfalsate non
    # coincidono con quelle dell'asse, lo scarto cresce lungo le curve)
    from scipy.spatial import cKDTree
    deck_pts, deck_r = [], []
    for o in bridges:
        Nb = np.array(o["nodes"])
        segb = np.linalg.norm(np.diff(Nb[:, :2], axis=0), axis=1)
        sb = np.concatenate([[0], np.cumsum(segb)])
        sq = np.arange(0, sb[-1] + 0.1, 2.0)
        deck_pts.append(np.column_stack([np.interp(sq, sb, Nb[:, 0]), np.interp(sq, sb, Nb[:, 1])]))
        deck_r.append(np.interp(sq, sb, Nb[:, 3]) / 2.0 + 12.0)
    deck_tree = cKDTree(np.vstack(deck_pts)) if deck_pts else None
    deck_r = np.concatenate(deck_r) if deck_r else None
    for o in ai:
        N = np.array(o["nodes"])
        rid = o.get("name", "ia_?")[3:]
        rid = rid[:-2] if rid.endswith(("_a", "_b")) and rid[:-2] in report["roads"] else rid
        rinfo = report["roads"].get(rid, {})
        seg = np.linalg.norm(np.diff(N[:, :2], axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        ss = np.arange(0, s[-1], 1.0)
        if o.get("name", "").endswith("_a"):
            st_s = s[-1] - ss   # nodi invertiti per la carreggiata opposta
        else:
            st_s = ss
        x = np.interp(ss, s, N[:, 0])
        y = np.interp(ss, s, N[:, 1])
        zt = g.sample(h, x, y)
        zn = np.interp(ss, s, N[:, 2])
        ok = np.abs(zt - zn) < 0.6
        # escluse: strutture (+12 m), primi/ultimi 20 m (incroci), dove la linea non è sul terreno
        for stc in rinfo.get("structures", []):
            ok &= ~((st_s > stc["s0"] - 12) & (st_s < stc["s1"] + 12))
        ok &= (ss > 20) & (ss < s[-1] - 20)
        if deck_tree is not None:
            dd, ii = deck_tree.query(np.column_stack([x, y]))
            ok &= ~(dd < deck_r[ii])
        # imbocchi delle gallerie (tratto artificiale e terreno sotto il pavimento del tubo)
        for px_, py_ in report.get("structures", {}).get("tunnels", {}).get("portals", []):
            ok &= np.hypot(x - px_, y - py_) > 30.0
        dz = np.diff(zt)
        kink = np.abs(np.diff(dz))
        m = ok[2:] & ok[1:-1] & ok[:-2]
        if m.sum() < 10:
            continue
        k = kink[m]
        idx = np.nonzero(m)[0][np.argmax(k)]
        worst.append((rid, float(k.max()), float(np.percentile(k, 99.5)), (float(x[idx + 1]), float(y[idx + 1]))))
    if worst:
        p995 = max(w[2] for w in worst)
        R.ok(f"profili stradali sul terreno quantizzato (escluse testate dei ponti e incroci): 99,5° percentile delle "
             f"variazioni di pendenza su 1 m = {p995 * 100:.1f} cm")
        damaged = set(report.get("modules", {}).get("danni", {}).get("strade", []))
        for w in sorted(worst, key=lambda w: -w[1])[:8]:
            if w[1] > 0.10:
                msg = f"strada {w[0]}: variazione di pendenza puntuale {w[1] * 100:.1f} cm su 1 m in ({w[3][0]:.0f}, {w[3][1]:.0f})"
                # le strade danneggiate di proposito (buche, cedimenti) non sono un difetto
                (R.ok if w[0] in damaged else R.warn)(msg + (" (danni voluti)" if w[0] in damaged else ""))
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
    # sponde chiuse: il terreno sotto il livello collegato all'acqua deve stare dentro i blocchi
    # (altrimenti si vede il bordo verticale del WaterBlock); l'invaso è chiuso dalla diga (mesh)
    lf = json.loads((HERE.parent / "config/landforms.json").read_text())
    reservoirs = {lk["name"].replace(" ", "_") for lk in lf.get("lakes", []) if lk.get("reservoir")}
    groups = {}
    for o in objs:
        if o["class"] == "WaterBlock":
            lake = o["name"][len("acqua_"):].rsplit("_", 1)[0]
            groups.setdefault(lake, []).append(o)
    for lake, wbs in groups.items():
        if lake in reservoirs:
            continue
        lvl = wbs[0]["position"][2]
        pts = np.array([o["position"][:2] for o in wbs])
        ext = max(max(o["scale"][:2]) for o in wbs)
        win = g.window(pts[:, 0].min() - ext, pts[:, 1].min() - ext, pts[:, 0].max() + ext, pts[:, 1].max() + ext, pad=300)
        X, Y = g.window_mesh(win)
        inbox = np.zeros(X.shape, dtype=bool)
        for o in wbs:
            cx, cy, _ = o["position"]
            sx, sy, _ = o["scale"]
            m = o.get("rotationMatrix", [1, 0, 0, 0, 1, 0, 0, 0, 1])
            u = (X - cx) * m[0] + (Y - cy) * m[1]
            v = -(X - cx) * m[1] + (Y - cy) * m[0]
            inbox |= (np.abs(u) <= sx / 2) & (np.abs(v) <= sy / 2)
        sub = h[win]
        deep = sub < lvl - 0.3
        # gli alvei dei fiumi (oggetti River) hanno la propria acqua
        for o in objs:
            if o["class"] != "River":
                continue
            Nr = np.array(o["nodes"])
            near = (Nr[:, 0] > X.min() - 50) & (Nr[:, 0] < X.max() + 50) & (Nr[:, 1] > Y.min() - 50) & (Nr[:, 1] < Y.max() + 50)
            for nd in Nr[near]:
                rr = nd[3] / 2.0 + 6.0
                deep &= ~(((X - nd[0]) ** 2 + (Y - nd[1]) ** 2) < rr * rr)
        lab, _ = ndimage.label(deep)
        ids = np.unique(lab[deep & inbox])
        leak = np.isin(lab, ids[ids > 0]) & ~inbox
        n_leak = int(leak.sum())
        if n_leak > 2000:
            R.err(f"lago {lake}: {n_leak} vertici sotto il livello fuori dai WaterBlock e collegati all'acqua "
                  f"(sponda aperta, prof. max {float((lvl - sub[leak]).max()):.1f} m)")
        elif n_leak > 50:
            R.warn(f"lago {lake}: {n_leak} vertici sotto il livello fuori dai WaterBlock (prof. max "
                   f"{float((lvl - sub[leak]).max()):.1f} m)")
        else:
            R.ok(f"lago {lake}: sponde chiuse ({n_leak} vertici sotto il livello fuori dai blocchi)")
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
