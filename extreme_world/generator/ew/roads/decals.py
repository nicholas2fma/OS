"""Oggetti di scena delle strade: DecalRoad visibili, segnaletica, grafo IA, impalcati dei ponti.

* superficie: una DecalRoad per tratto (terreno / ponte), bordi sfumati nella texture
* segnaletica: DecalRoad sottili separate per mezzeria e bordi, così la loro posizione non
  dipende dall'orientamento della texture
* IA: DecalRoad con materiale trasparente e `drivability` (come nei livelli ufficiali),
  a senso unico per le carreggiate autostradali e le rampe
* ponti: MeshRoad (geometria con collisione) con il piano superiore alla quota stradale
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from ..textures import TexGen, sigmoid01, surf_asphalt, surf_dirt, surf_gravel
from .network import DS, Road

ART = "art/road"

SURFACE_DECAL = {
    "ew_road_asphalt": "asphalt",
    "ew_road_broken": "broken",
    "ew_road_gravel": "gravel",
    "ew_road_dirt": "dirt",
}
TYPE_SURFACE = {
    "highway": "ew_road_asphalt", "ring": "ew_road_asphalt", "ramp": "ew_road_asphalt", "state": "ew_road_asphalt",
    "urban": "ew_road_asphalt", "local": "ew_road_asphalt", "mountain": "ew_road_asphalt", "narrow": "ew_road_asphalt",
    "broken": "ew_road_broken", "gravel": "ew_road_gravel", "dirt": "ew_road_dirt", "trail": "ew_road_dirt",
    "climb": "ew_road_dirt",
}


# ================================================================ texture
def write_road_textures(level_dir: Path, level_name: str, seed: int) -> dict:
    tg = TexGen(seed + 77)
    out = level_dir / ART
    out.mkdir(parents=True, exist_ok=True)
    W, H = 512, 1024   # U = larghezza della strada, V = lunghezza
    u = np.linspace(0, 1, W)[None, :]
    files = {}

    def edge_alpha(soft=0.06, noise=None):
        a = np.minimum(u, 1 - u) / soft
        a = np.clip(a, 0, 1)
        a = np.repeat(a, H, axis=0)
        if noise is not None:
            a = np.clip(a + 0.25 * noise * (a < 1), 0, 1)
        return a

    def save_rgba(name, rgb, alpha, hgt, rough):
        # le texture sono periodiche in V: si sintetizza un quadrato e lo si ripete
        files[name] = {
            "b": tg.save(out / f"{name}_b.png", np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), "RGBA"),
            "nm": tg.save(out / f"{name}_nm.png", tg.normal_from_height(hgt, 3.0)),
            "r": tg.save(out / f"{name}_r.png", (np.clip(rough, 0, 1) * 255).astype(np.uint8), "L"),
        }

    def tall(fn, salt):
        """Superficie W x H periodica: due quadrati W x W con rumore indipendente non sarebbero
        continui, quindi si sintetizza H x H e si ritaglia in larghezza (resta periodica in V)."""
        rgb, hgt, rough = fn(tg, H, salt)
        return rgb[:, :W], hgt[:, :W], rough[:, :W]

    noise_edge = tg.spectral(H, 1.5, 3001, fmin=4)[:, :W]
    # asfalto
    rgb, hgt, rough = tall(lambda t, n, s: surf_asphalt(t, n, s), 3002)
    wheel = np.exp(-((u - 0.27) / 0.07) ** 2) + np.exp(-((u - 0.73) / 0.07) ** 2)
    rgb = rgb * (1 - 0.06 * wheel[..., None])  # passaggi delle ruote più scuri
    save_rgba("ew_road_asphalt", rgb, edge_alpha(0.035, noise_edge * 0.3), hgt, rough - 0.05 * wheel)
    # asfalto rovinato: crepe, rappezzi e bordi sbrecciati
    rgb, hgt, rough = tall(lambda t, n, s: surf_asphalt(t, n, s, old=True), 3003)
    ragged = edge_alpha(0.12, noise_edge)
    holes = sigmoid01(tg.spectral(H, 2.2, 3004)[:, :W], 6, 1.6)
    save_rgba("ew_road_broken", rgb, np.clip(ragged - 0.85 * holes, 0, 1), hgt - 0.3 * holes, rough)
    # ghiaia
    rgb, hgt, rough = tall(lambda t, n, s: surf_gravel(t, n, s, count=9000), 3005)
    save_rgba("ew_road_gravel", rgb * 0.95, edge_alpha(0.16, noise_edge), hgt, rough)
    # sterrato con solchi delle ruote
    rgb, hgt, rough = tall(lambda t, n, s: surf_dirt(t, n, s), 3006)
    ruts = np.exp(-((u - 0.28) / 0.06) ** 2) + np.exp(-((u - 0.72) / 0.06) ** 2)
    rgb = rgb * (1 - 0.18 * ruts[..., None])
    save_rgba("ew_road_dirt", rgb, edge_alpha(0.2, noise_edge), hgt - 0.3 * ruts, rough)
    # segnaletica: linea continua e tratteggiata (4,5 m di tratto su 12 m)
    LW, LH = 32, 512
    wear = tg.spectral(LH, 0.8, 3007, fmin=8)[:, :LW]
    lu = np.linspace(0, 1, LW)[None, :]
    a_line = np.clip(np.minimum(lu, 1 - lu) / 0.15, 0, 1) * np.clip(0.95 - 0.12 * wear, 0, 1)
    white = np.full((LH, LW, 3), 236.0)
    flat_h = np.zeros((LH, LW))
    files["ew_line_solid"] = {
        "b": tg.save(out / "ew_line_solid_b.png", np.dstack([white, a_line * 255]).astype(np.uint8), "RGBA"),
        "r": tg.save(out / "ew_line_solid_r.png", np.full((LH, LW), 150, np.uint8), "L"),
    }
    v = np.linspace(0, 1, LH, endpoint=False)[:, None]
    dash = ((v % 1.0) < 4.5 / 12.0).astype(np.float64)
    files["ew_line_dashed"] = {
        "b": tg.save(out / "ew_line_dashed_b.png", np.dstack([white, a_line * dash * 255]).astype(np.uint8), "RGBA"),
        "r": tg.save(out / "ew_line_dashed_r.png", np.full((LH, LW), 150, np.uint8), "L"),
    }
    files["ew_road_invisible"] = {
        "b": tg.save(out / "ew_road_invisible_b.png", np.zeros((8, 8, 4), np.uint8), "RGBA"),
    }
    return files


def road_materials(level_name: str, files: dict) -> dict:
    """Materiali v1.5 delle DecalRoad (translucidi, selezionabili come strade)."""
    vp = lambda p: f"/levels/{level_name}/{ART}/{Path(p).name}"  # noqa: E731
    mats = {}
    for name, f in files.items():
        stage = {"baseColorMap": vp(f["b"])}
        if "nm" in f:
            stage["normalMap"] = vp(f["nm"])
        if "r" in f:
            stage["roughnessMap"] = vp(f["r"])
        mats[name] = {
            "name": name,
            "mapTo": name,
            "class": "Material",
            "Stages": [stage, {}, {}, {}],
            "materialTag0": "RoadAndPath",
            "translucent": True,
            "translucentBlendOp": "LerpAlpha",
            "translucentZWrite": False,
            "castShadows": False,
            "version": 1.5,
        }
    return mats


# ============================================================ geometria
def _adaptive_indices(road: Road, i0: int, i1: int, max_step=24.0, max_turn_deg=2.5):
    """Indici dei nodi: più fitti in curva e nei cambi di pendenza."""
    idx = [i0]
    th = np.arctan2(road.tan[:, 1], road.tan[:, 0])
    last = i0
    for i in range(i0 + 1, i1):
        dturn = abs((th[i] - th[last] + np.pi) % (2 * np.pi) - np.pi)
        dgrade = abs((road.z[i] - road.z[i - 1]) - (road.z[last + 1] - road.z[last])) / DS if last + 1 < len(road.z) else 0
        if (i - last) * DS >= max_step or np.degrees(dturn) >= max_turn_deg or dgrade > 0.01:
            idx.append(i)
            last = i
    if idx[-1] != i1:
        idx.append(i1)
    return np.array(idx)


def _pieces(road: Road):
    """Tratti della strada: (i0, i1, tipo) con tipo 'ground' | 'bridge' | 'tunnel'."""
    n = len(road.s)
    kind = np.array(["ground"] * n, dtype=object)
    for st in road.structures:
        sel = (road.s >= st.s0) & (road.s <= st.s1)
        kind[sel] = st.kind
    out = []
    i0 = 0
    for i in range(1, n + 1):
        if i == n or kind[i] != kind[i0]:
            out.append((max(i0 - 1, 0), min(i, n - 1), kind[i0]))
            i0 = i
    return out


def _nodes(road: Road, idx, offset=0.0, width=4.0, dz=0.0, reverse=False):
    P = road.P[idx] + road.nor[idx] * offset
    z = road.surface(road.s[idx], np.full(len(idx), offset)) + dz
    nodes = [[float(P[k, 0]), float(P[k, 1]), float(z[k]), float(width)] for k in range(len(idx))]
    return nodes[::-1] if reverse else nodes


def _decal(nodes, material, prio, texlen, over=False, extra=None, fade=(2, 2)):
    o = {"class": "DecalRoad", "position": nodes[0][:3], "material": material, "nodes": nodes,
         "improvedSpline": True, "breakAngle": 1, "textureLength": texlen, "renderPriority": prio,
         "startEndFade": list(fade), "distanceFade": [1200, 600]}
    if over:
        o["overObjects"] = True
    if extra:
        o.update(extra)
    return o


def road_scene_objects(road: Road, scene, base_group="MissionGroup/roads"):
    """Aggiunge alla scena tutte le DecalRoad della strada e restituisce il numero di oggetti."""
    t = road.t
    grp = f"{base_group}/{road.rid}"
    count = 0
    surf_mat = TYPE_SURFACE[road.kind]
    paved = surf_mat in ("ew_road_asphalt", "ew_road_broken")
    for i0, i1, kind in _pieces(road):
        if i1 - i0 < 1:
            continue
        idx = _adaptive_indices(road, i0, i1)
        # su ponti e in galleria il decal si proietta sulla mesh (impalcato, pavimento del tubo)
        over = kind in ("bridge", "tunnel")
        if road.dual:
            cw = t["carriageway"]
            off = t["median"] / 2.0 + cw / 2.0
            for side, rev in ((-1.0, False), (1.0, True)):
                o = side * off
                scene.add(grp, _decal(_nodes(road, idx, o, cw + 0.3, 0.0, rev), surf_mat, 10, 16, over))
                # linee rispetto al senso di marcia (scostamento > 0 = verso lo spartitraffico):
                # bordo sinistro, separazione corsie, bordo destro con corsia d'emergenza oltre
                for loff, mat in ((4.75, "ew_line_solid"), (1.0, "ew_line_dashed"), (-2.75, "ew_line_solid")):
                    lo = o + (loff if not rev else -loff)
                    scene.add(grp, _decal(_nodes(road, idx, lo, 0.15, 0.0, rev), mat, 2, 12, over))
                count += 4
            # spartitraffico centrale (in galleria è il setto tra le due canne)
            if kind != "tunnel":
                scene.add(grp, _decal(_nodes(road, idx, 0.0, t["median"], 0.0), "ew_road_asphalt", 9, 16, over))
                count += 1
        else:
            w = road.spec.get("width", t["width"])
            scene.add(grp, _decal(_nodes(road, idx, 0.0, w + 0.4, 0.0), surf_mat, 10, t.get("texture_length", 14), over,
                                  extra={"looped": True} if road.spec.get("looped") else None))
            count += 1
            if paved and road.kind not in ("narrow", "broken"):
                edge = w / 2.0 - 0.35
                scene.add(grp, _decal(_nodes(road, idx, edge, 0.15), "ew_line_solid", 2, 12, over))
                scene.add(grp, _decal(_nodes(road, idx, -edge, 0.15), "ew_line_solid", 2, 12, over))
                count += 2
                if road.kind == "ramp":
                    pass
                elif t.get("lanes", 2) >= 2:
                    scene.add(grp, _decal(_nodes(road, idx, 0.0, 0.15), "ew_line_dashed", 2, 12, over))
                    count += 1
    # grafo dell'IA (anche dentro le gallerie e sui ponti)
    if t.get("ai_drivability", 0) > 0:
        idx = _adaptive_indices(road, 0, len(road.s) - 1, max_step=30.0, max_turn_deg=4.0)
        ai = {"drivability": t["ai_drivability"], "overObjects": True}
        if road.dual:
            cw = t["carriageway"]
            off = t["median"] / 2.0 + cw / 2.0 - 0.6
            for side, rev in ((-1.0, False), (1.0, True)):
                scene.add(f"{base_group}/ai", _decal(_nodes(road, idx, side * off, 7.6, 0.0, rev), "ew_road_invisible", 50, 10,
                                                      extra={**ai, "name": f"ia_{road.rid}_{'a' if rev else 'b'}", "oneWay": True,
                                                             "lanesLeft": 0, "lanesRight": t.get("lanes", 2)}))
                count += 1
        else:
            w = road.spec.get("width", t["width"])
            extra = dict(ai)
            if t.get("one_way") or road.spec.get("looped"):
                extra.update({"oneWay": True, "lanesLeft": 0, "lanesRight": t.get("lanes", 1)})
            if road.spec.get("looped"):
                extra["looped"] = True
            elif t.get("lanes", 2) >= 2:
                extra.update({"lanesLeft": 1, "lanesRight": 1})
            extra["name"] = f"ia_{road.rid}"
            scene.add(f"{base_group}/ai", _decal(_nodes(road, idx, 0.0, w), "ew_road_invisible", 50, 10, extra=extra))
            count += 1
    return count


def bridge_meshroads(road: Road, scene, base_group="MissionGroup/structures/bridges"):
    """Impalcati dei ponti come MeshRoad (piano superiore = quota stradale)."""
    out = []
    t = road.t
    width = 2 * road.half_paved + 1.6
    for k, st in enumerate([s for s in road.structures if s.kind == "bridge"]):
        s0 = max(0.0, st.s0 - 4.0)
        s1 = min(road.length, st.s1 + 4.0)
        i0, i1 = int(road.idx(s0)), int(road.idx(s1))
        idx = _adaptive_indices(road, i0, i1, max_step=10.0, max_turn_deg=2.0)
        depth = 1.5 if road.rank >= 70 else 1.1
        nodes = []
        for i in idx:
            x, y = road.P[i]
            z = float(road.z[i])
            b = float(road.bank[i])
            # normale inclinata per la superelevazione
            nx, ny = road.nor[i] * (-b)
            nz = 1.0
            ln = (nx * nx + ny * ny + nz * nz) ** 0.5
            nodes.append([float(x), float(y), z, width, depth, nx / ln, ny / ln, nz / ln])
        obj = {"class": "MeshRoad", "name": f"{road.rid}_ponte_{k + 1}", "position": nodes[0][:3], "nodes": nodes,
               "topMaterial": "ew_bridge_deck", "bottomMaterial": "ew_concrete", "sideMaterial": "ew_concrete",
               "textureLength": 8, "breakAngle": 3, "widthSubdivisions": 0}
        scene.add(base_group, obj)
        out.append({"road": road.rid, "s0": s0, "s1": s1, "idx": idx, "width": width, "depth": depth, "reason": st.reason})
    return out
