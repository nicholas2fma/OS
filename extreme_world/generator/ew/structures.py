"""Strutture 3D generate: ponti (piloni, spalle, parapetti), guardrail, spartitraffico, diga.

Ogni gruppo di geometrie diventa un file .dae con origine locale e un TSStatic con rotazione
identità (nessuna ambiguità di orientamento). La collisione usa la mesh visibile
(collisionType "Visible Mesh Final"): le geometrie sono semplici e poco dense.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .mesh.collada import Mesh, write_dae

SHAPES = "art/shapes/ew/gen"


class StructureWriter:
    def __init__(self, level_dir: Path, level_name: str, scene, grid, h):
        self.level_dir = level_dir
        self.level = level_name
        self.scene = scene
        self.g = grid
        self.h = h
        self.files = []
        self.tris = 0

    def emit(self, name: str, mesh: Mesh, group: str, px: int = 2, collision=True):
        if not mesh.parts:
            return None
        lo, hi = mesh.bounds()
        origin = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
        local = _relocate(mesh, origin)
        path = self.level_dir / SHAPES / f"{name}.dae"
        write_dae(path, [(name, local, px)])
        self.files.append(path)
        self.tris += local.triangle_count()
        obj = {"class": "TSStatic", "name": name, "position": origin.tolist(),
               "shapeName": f"/levels/{self.level}/{SHAPES}/{name}.dae",
               "rotationMatrix": [1, 0, 0, 0, 1, 0, 0, 0, 1], "scale": [1, 1, 1],
               "collisionType": "Visible Mesh Final" if collision else "None",
               "decalType": "Visible Mesh Final" if collision else "None"}
        self.scene.add(group, obj)
        return obj


def _relocate(mesh: Mesh, origin) -> Mesh:
    out = Mesh()
    for mat, part in mesh.parts.items():
        start = 0
        for P, N, UV, I in zip(part["p"], part["n"], part["uv"], part["i"]):
            out.add(mat, P - origin, N, UV, I - start)
            start += len(P)
    return out


# ================================================================== ponti
def bridge_structures(sw: StructureWriter, net, bridges: list, road_core: np.ndarray, river_dist: np.ndarray):
    g, h = sw.g, sw.h
    stats = {"bridges": 0, "piers": 0}
    for k, b in enumerate(bridges):
        road = net.roads[b["road"]]
        m = Mesh()
        s0, s1 = b["s0"], b["s1"]
        width = b["width"]
        depth = b["depth"]
        span = 32.0 if road.rank >= 70 else 24.0
        length = s1 - s0
        n_sp = max(1, int(round((length - 8.0) / span)))
        stations = [s0 + 4.0 + (length - 8.0) * (i + 0.5) / n_sp for i in range(n_sp)] if length > 20 else []
        # piloni
        for s in stations:
            placed = False
            for shift in (0.0, 6.0, -6.0, 12.0, -12.0):
                ss = s + shift
                if ss <= s0 + 5 or ss >= s1 - 5:
                    continue
                i = int(road.idx(ss))
                x, y = road.P[i]
                zt = float(road.z[i]) - depth
                foot = [road.P[i] + road.nor[i] * o for o in np.linspace(-width * 0.3, width * 0.3, 5)]
                zg = min(float(g.sample(h, f[0], f[1])) for f in foot)
                wet = min(float(g.sample(river_dist, f[0], f[1])) for f in foot)
                under_road = any(road_core[int(round((f[1] - g.y0) / g.step)), int(round((f[0] - g.x0) / g.step))] >= 0
                                 for f in foot)
                if wet < 1.5 or under_road:
                    continue
                hgt = zt - zg
                if hgt < 1.2:
                    placed = True
                    break
                yaw = float(np.arctan2(road.tan[i, 1], road.tan[i, 0]))
                pw = 1.4 if hgt < 18 else 2.2   # spessore lungo la strada
                if width > 12 and hgt > 8:
                    for o in (-width * 0.28, width * 0.28):
                        c = road.P[i] + road.nor[i] * o
                        m.add_box("ew_concrete", (c[0], c[1], zg - 3 + (hgt + 3) / 2), (pw, 1.8 + hgt * 0.02, hgt + 3), yaw)
                else:
                    m.add_box("ew_concrete", (x, y, zg - 3 + (hgt + 3) / 2), (pw, max(2.0, width * 0.45), hgt + 3), yaw)
                # pulvino sotto l'impalcato
                m.add_box("ew_concrete", (x, y, zt - 0.5), (pw + 0.6, width * 0.9, 1.0), yaw)
                stats["piers"] += 1
                placed = True
                break
        # spalle alle due estremità (nascondono il raccordo con il rilevato)
        for se in (s0 + 4.0, s1 - 4.0):
            i = int(road.idx(se))
            x, y = road.P[i]
            zt = float(road.z[i]) - depth
            zg = float(g.sample(h, x, y))
            hh = max(zt - zg + 3.0, 2.0)
            yaw = float(np.arctan2(road.tan[i, 1], road.tan[i, 0]))
            m.add_box("ew_concrete", (x, y, zt - hh / 2 + 0.2), (2.0, width + 0.4, hh), yaw)
        # parapetti in cemento lungo i bordi dell'impalcato
        i0, i1 = int(road.idx(s0)), int(road.idx(s1))
        sel = np.arange(i0, i1 + 1, 2)
        if len(sel) >= 2:
            for side in (1.0, -1.0):
                off = side * (width / 2.0 - 0.25)
                P = road.P[sel] + road.nor[sel] * off
                z = road.surface(road.s[sel], np.full(len(sel), np.clip(off, -road.half_paved, road.half_paved)))
                path = np.column_stack([P, z])
                prof = [(-0.25, 0.0), (0.25, 0.0), (0.25, 1.0), (-0.15, 1.0), (-0.25, 0.85)]
                if side < 0:
                    prof = [(-x, y) for x, y in prof][::-1]
                m.sweep("ew_concrete", path, prof, closed_profile=True)
        sw.emit(f"ponte_{b['road']}_{k + 1}", m, "MissionGroup/structures/bridges")
        stats["bridges"] += 1
    return stats


# ============================================================== guardrail
def guardrails(sw: StructureWriter, net, h_final: np.ndarray, chunk_m=360.0):
    """Guardrail sui lati con dislivello e su tutte le strade veloci; New Jersey in autostrada."""
    g = sw.g
    stats = {"guardrail_m": 0.0, "barrier_m": 0.0}
    for rid in net.order:
        road = net.roads[rid]
        if road.kind in ("trail", "climb", "dirt", "urban") or road.spec.get("guardrails", True) is False:
            continue
        n = len(road.s)
        ground = ~road.structure_mask(road.s, "bridge")
        for st in road.structures:              # gallerie con il tratto artificiale davanti
            if st.kind == "tunnel":
                ground &= ~((road.s >= st.s0 - 9.0) & (road.s <= st.s1 + 9.0))
        fast = road.kind in ("highway", "ring", "ramp")
        for side in (1.0, -1.0):
            ext = road.bay_ext(road.s, side)           # piazzole: il guardrail gira sul bordo esterno
            edge = side * (road.half_paved + 0.55 + ext)
            z_edge = road.surface(road.s, side * (road.half_paved + ext))
            drop = np.zeros(n)
            for o in (3.0, 6.0, 10.0):
                Q = road.P + road.nor * (side * (road.half_core + ext + o))[:, None]
                zt = g.sample(h_final, Q[:, 0], Q[:, 1])
                drop = np.maximum(drop, z_edge - zt - 0.35 * o)
            need = ground & (fast | (drop > 1.8))
            # chiude i piccoli buchi e scarta i tratti troppo corti
            from scipy import ndimage
            need = ndimage.binary_closing(need, iterations=6) & ground
            need = ndimage.binary_opening(need, iterations=4)
            lab, nl = ndimage.label(need)
            for li in range(1, nl + 1):
                idx = np.nonzero(lab == li)[0]
                if len(idx) * 2.0 < 16.0:
                    continue
                for c0 in range(idx[0], idx[-1] + 1, int(chunk_m / 2)):
                    c1 = min(idx[-1], c0 + int(chunk_m / 2))
                    sel = np.arange(c0, c1 + 1)
                    if len(sel) < 4:
                        continue
                    P = road.P[sel] + road.nor[sel] * edge[sel][:, None]
                    path = np.column_stack([P, z_edge[sel]])
                    m = Mesh()
                    # lama (profilo a doppia onda semplificato) + paletti ogni 4 m
                    rail = [(-0.02, 0.55), (0.06, 0.62), (0.02, 0.70), (0.06, 0.78), (-0.02, 0.85), (-0.06, 0.85), (-0.06, 0.55)]
                    if side < 0:
                        rail = [(-x, y) for x, y in rail][::-1]
                    m.sweep("ew_metal", path, rail, closed_profile=True)
                    for j in range(0, len(sel), 2):
                        i = sel[j]
                        x, y = road.P[i] + road.nor[i] * (edge[i] + side * 0.12)
                        yaw = float(np.arctan2(road.tan[i, 1], road.tan[i, 0]))
                        m.add_box("ew_metal", (x, y, z_edge[i] + 0.35), (0.12, 0.1, 1.1), yaw)
                    sw.emit(f"guardrail_{rid}_{'s' if side > 0 else 'd'}_{c0}", m, f"MissionGroup/structures/guardrails/{rid}")
                    stats["guardrail_m"] += len(sel) * 2.0
        if road.dual:
            sel_all = np.nonzero(ground)[0]
            if len(sel_all):
                for c0 in range(sel_all[0], sel_all[-1] + 1, int(chunk_m / 2)):
                    sel = np.arange(c0, min(sel_all[-1], c0 + int(chunk_m / 2)) + 1)
                    sel = sel[ground[sel]]
                    if len(sel) < 4:
                        continue
                    path = np.column_stack([road.P[sel], road.surface(road.s[sel], np.zeros(len(sel)))])
                    m = Mesh()
                    nj = [(-0.3, 0.0), (0.3, 0.0), (0.09, 0.25), (0.08, 0.81), (-0.08, 0.81), (-0.09, 0.25)]
                    m.sweep("ew_concrete", path, nj, closed_profile=True)
                    sw.emit(f"newjersey_{rid}_{c0}", m, f"MissionGroup/structures/guardrails/{rid}")
                    stats["barrier_m"] += len(sel) * 2.0
            # anche sui ponti
    return stats


# ================================================================== diga
def dam_structure(sw: StructureWriter, dam: dict, h_natural: np.ndarray):
    """Diga a gravità ad arco leggero tra le due spalle della valle."""
    if not dam:
        return None
    g = sw.g
    a = np.array(dam["a"], dtype=np.float64)
    b = np.array(dam["b"], dtype=np.float64)
    crest = dam["crest"]
    base = dam["base"]
    d = b - a
    L = np.linalg.norm(d)
    t = d / L
    nrm = np.array([-t[1], t[0]])
    # verso monte: il lato con il lago (prodotto vettoriale positivo, come in water.py)
    up = nrm
    # estende la diga finché il terreno non supera il coronamento
    ext = 0.0
    for e in np.arange(0, 120, 4):
        za = float(g.sample(h_natural, *(a - t * e)))
        zb = float(g.sample(h_natural, *(b + t * e)))
        ext = e
        if za > crest + 3 and zb > crest + 3:
            break
    s = np.linspace(-ext, L + ext, 60)
    arch = 18.0 * (1 - ((s - L / 2) / (L / 2 + ext)) ** 2)  # arco verso monte
    line = a[None, :] + t[None, :] * s[:, None] + up[None, :] * arch[:, None]
    m = Mesh()
    height = crest - base + 6.0
    top_w = 6.0
    bot_w = 0.55 * height
    # sezione: paramento di monte verticale, valle inclinato (coordinate: laterale verso monte, z)
    prof = [(0.0, -6.0), (0.0, height - 6.0), (-top_w, height - 6.0), (-bot_w, -6.0)]
    path = np.column_stack([line, np.full(len(line), base)])
    # il profilo laterale "a sinistra" del percorso a->b coincide con il lato monte
    m.sweep("ew_concrete", path, prof, closed_profile=True)
    # parapetti sul coronamento
    for lat in (-0.3, -top_w + 0.3):
        pth = np.column_stack([line + up[None, :] * lat, np.full(len(line), crest)])
        m.sweep("ew_concrete", pth, [(-0.2, 0), (0.2, 0), (0.2, 1.0), (-0.2, 1.0)], closed_profile=True)
    sw.emit("diga_montalba", m, "MissionGroup/structures/dam", px=1)
    return {"length_m": float(L + 2 * ext), "height_m": float(height), "crest": crest}


# ================================================================ gallerie
def tunnel_structures(sw: StructureWriter, net, layers: np.ndarray, road_core: np.ndarray, hole_value: int = 255):
    """Gallerie: tubo con volta e pavimento (mesh con collisione), portali, fori nel terreno.

    Il terreno non viene modellato dentro la galleria; agli imbocchi la trincea d'accesso
    termina contro il versante e lì si praticano i fori (layer 255) in cui entra il tubo."""
    g = sw.g
    stats = {"tunnels": 0, "length_m": 0.0, "hole_cells": 0, "portals": []}
    for rid in net.order:
        road = net.roads[rid]
        for k, st in enumerate([s for s in road.structures if s.kind == "tunnel"]):
            gallery = 8.0                           # tratto artificiale davanti al versante
            s0 = max(0.0, st.s0 - gallery)
            s1 = min(road.length, st.s1 + gallery)
            i0, i1 = int(road.idx(s0)), int(road.idx(s1))
            sel = np.arange(i0, i1 + 1)
            Hw = 5.2                                # altezza dei piedritti
            if road.dual:                           # due canne, una per carreggiata
                W = road.t["carriageway"] + 2.4
                offsets = [-(road.t["median"] / 2.0 + road.t["carriageway"] / 2.0),
                           road.t["median"] / 2.0 + road.t["carriageway"] / 2.0]
            else:
                W = 2 * road.half_paved + 2.4       # carreggiata + marciapiedi di servizio
                offsets = [0.0]
            R = W / 2.0
            Hv = 0.55 * R                           # freccia della volta
            m = Mesh()
            arc = [(-R * np.cos(a), Hw + Hv * np.sin(a)) for a in np.linspace(0, np.pi, 13)]
            # profilo interno da destra a sinistra: le facce guardano dentro la galleria
            inner = [(-R, -0.3), (-R, Hw)] + arc[1:-1] + [(R, Hw), (R, -0.3)]
            # estensione laterale del guscio esterno: per le canne gemelle i gusci si toccano
            # sulla mezzeria, verso l'esterno coprono i quadrati di terreno forati (2 m)
            ext_out = R + 4.0
            portals = ((st.s0, -1.0), (st.s1, 1.0))      # stazione, verso uscente
            # galleria artificiale: terreno di riporto sopra i gusci dietro le testate, dove il
            # versante è più basso (lato a valle); prima dei fori, che dipendono dal terreno
            for sp, out_dir in portals:
                _backfill(g, sw.h, road, offsets, ext_out, Hw + Hv + 1.5 + 1.2, sp, out_dir, st,
                          road_core, net.order.index(rid), ds_start=-3.5)
            for ti, oc in enumerate(offsets):
                e_neg = ext_out if ti == 0 else abs(oc)   # verso destra (laterale negativo)
                e_pos = ext_out if ti == len(offsets) - 1 else abs(oc)
                P = road.P[sel] + road.nor[sel] * oc
                z = road.surface(road.s[sel], np.full(len(sel), oc))
                path = np.column_stack([P, z])
                m.sweep("ew_concrete", path, inner, closed_profile=False)
                m.sweep("ew_bridge_deck", path, [(R, -0.02), (-R, -0.02)], closed_profile=False)
                outer = _outer_profile(R, Hw, Hv, e_neg, e_pos)
                for sp, out_dir in portals:
                    hs = _tunnel_holes(g, sw.h, layers, road, oc, R, Hw, Hv, sp, out_dir, hole_value, gallery)
                    _sink_floor(g, sw.h, road, oc, R, sp, out_dir, gallery, hs + 3.0)
                    # guscio esterno finché il terreno è forato o non lo ricopre del tutto
                    reach = max(hs, _shell_exposed(g, sw.h, layers, road, oc, outer, sp, out_dir, hole_value)) + 4.0
                    a, b = (s0, sp + reach) if out_dir < 0 else (sp - reach, s1)
                    a, b = max(a, s0), min(b, s1)
                    j = np.arange(int(road.idx(a)), int(road.idx(b)) + 1)
                    if len(j) >= 2:
                        Pj = road.P[j] + road.nor[j] * oc
                        zj = road.surface(road.s[j], np.full(len(j), oc))
                        # percorso dal lato sinistro al destro: normali verso l'esterno
                        m.sweep("ew_concrete", np.column_stack([Pj, zj]), outer[::-1], closed_profile=False)
                        # chiusura dello spessore dove il guscio finisce dentro il monte
                        _ring_face(m, road, int(j[-1] if out_dir < 0 else j[0]), oc, inner, outer, -out_dir)
                    # testata all'estremità del tubo: chiude lo spessore tra profilo interno ed
                    # esterno e fa da facciata del portale (galleria artificiale fino al versante)
                    i_end = int(road.idx(s0 if out_dir < 0 else s1))
                    lo = oc - (e_neg + 1.5 if ti == 0 else abs(oc))
                    hi = oc + (e_pos + 1.5 if ti == len(offsets) - 1 else abs(oc))
                    _headwall(m, road, i_end, oc, inner, lo, hi, Hw + Hv + 3.0, out_dir)
            sw.emit(f"galleria_{rid}_{k + 1}", m, "MissionGroup/structures/tunnels", px=1)
            for sp_ in (st.s0, st.s1):
                stats["portals"].append([round(float(v), 1) for v in road.point(np.array([sp_]))[0]])
            stats["tunnels"] += 1
            stats["length_m"] += float(st.s1 - st.s0)
    stats["hole_cells"] = int((layers == hole_value).sum())
    return stats


def _outer_profile(R, Hw, Hv, e_neg, e_pos, crown=1.5, base=-1.0):
    """Profilo esterno della canna da destra (-) a sinistra (+): pareti e volta ellittica."""
    zs = Hw + 0.9
    b = Hv + crown - 0.9
    pts = [(-e_neg, base), (-e_neg, zs)]
    for a in np.linspace(0, np.pi, 15)[1:-1]:
        c = -np.cos(a)
        pts.append((c * (e_neg if c < 0 else e_pos), zs + b * np.sin(a)))
    pts += [(e_pos, zs), (e_pos, base)]
    return pts


def _frame(road, i, oc):
    c = road.P[i] + road.nor[i] * oc
    zz = float(road.surface(np.array([road.s[i]]), np.array([oc]))[0])
    return np.array([c[0], c[1], zz]), np.array([road.nor[i][0], road.nor[i][1], 0.0]), \
        np.array([road.tan[i][0], road.tan[i][1], 0.0])


def _merge_polylines(A, B):
    """Ricampiona due polilinee 2D sugli stessi parametri (unione dei vertici di entrambe)."""
    A = np.asarray(A, dtype=np.float64)
    B = np.asarray(B, dtype=np.float64)

    def param(P):
        d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        return d / d[-1]
    ua, ub = param(A), param(B)
    u = np.unique(np.round(np.concatenate([ua, ub]), 6))
    res = [np.column_stack([np.interp(u, uu, P[:, 0]), np.interp(u, uu, P[:, 1])]) for P, uu in ((A, ua), (B, ub))]
    return res[0], res[1]


def _strip(m, mat, A, B, normal):
    """Triangoli tra due polilinee 3D con lo stesso numero di punti, rivolti verso `normal`."""
    P, I = [], []
    for i in range(len(A) - 1):
        for tri in ((A[i], A[i + 1], B[i + 1]), (A[i], B[i + 1], B[i])):
            gn = np.cross(tri[1] - tri[0], tri[2] - tri[0])
            if np.linalg.norm(gn) < 1e-8:
                continue
            if np.dot(gn, normal) < 0:
                tri = (tri[0], tri[2], tri[1])
            I.append([len(P), len(P) + 1, len(P) + 2])
            P += list(tri)
    if P:
        P = np.array(P)
        uv = np.column_stack([P[:, 0] + P[:, 1], P[:, 2]]) / 2.0
        m.add(mat, P, np.repeat(np.asarray(normal, dtype=np.float64)[None, :], len(P), 0), uv, I)


def _backfill(g, h, road, offsets, ext_out, crown, sp, out_dir, st, road_core, road_index,
              ds_start=1.0, depth=40.0, slope=0.67):
    """Rilevato sopra le canne presso un imbocco: piano alla quota del guscio + copertura,
    scarpate 1:1,5 ai lati e verso l'interno oltre `depth`; non tocca altre strade."""
    center = (offsets[0] + offsets[-1]) / 2.0
    halfw = (offsets[-1] - offsets[0]) / 2.0 + ext_out
    reach_lat = halfw + crown / slope + 2.0
    reach_s = depth + crown / slope + 2.0
    a = sp + ds_start if out_dir < 0 else sp - reach_s
    b = sp + reach_s if out_dir < 0 else sp - ds_start
    a, b = max(a, 0.0), min(b, road.length)
    if b - a < 2.0:
        return
    i0, i1 = int(road.idx(a)), int(road.idx(b))
    P = road.P[i0:i1 + 1]
    win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=reach_lat + 4)
    X, Y = g.window_mesh(win)
    d, s, off = road.field.query(X, Y, max_dist=reach_lat + 4)
    ds = (s - sp) * (-out_dir)                   # >0 dentro il monte
    inside = (ds >= ds_start) & (ds <= reach_s) & (d <= reach_lat + 2)
    zf = road.surface(s, np.zeros_like(s))
    lat_ex = np.maximum(np.abs(off - center) - halfw, 0.0)
    target = zf + crown - lat_ex * slope - np.maximum(ds - depth, 0.0) * slope
    sub = h[win]
    other = road_core[win]
    free = (other < 0) | (other == road_index)
    upd = inside & free & (target > sub)
    sub[upd] = target[upd]


def _sink_floor(g, h, road, oc, R, sp, out_dir, gallery, ds_end, depth=0.3):
    """Abbassa sotto il pavimento del tubo il terreno a quota strada dentro la galleria
    artificiale: i quadrati vicini ai fori (vertici 255, colore indefinito) restano nascosti."""
    a = sp - gallery if out_dir < 0 else sp - ds_end
    b = sp + ds_end if out_dir < 0 else sp + gallery
    a, b = max(a, 0.0), min(b, road.length)
    if b - a < 1.0:
        return
    i0, i1 = int(road.idx(a)), int(road.idx(b))
    P = road.P[i0:i1 + 1] + road.nor[i0:i1 + 1] * oc
    win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=R + 4)
    X, Y = g.window_mesh(win)
    d, s, off = road.field.query(X, Y, max_dist=abs(oc) + R + 4)
    ds = (s - sp) * (-out_dir)
    zf = road.surface(s, np.full_like(s, oc))
    sub = h[win]
    sel = (ds >= -gallery + 0.5) & (ds <= ds_end) & (np.abs(off - oc) <= R + 1.0) & (sub < zf + 0.6)
    sub[sel] = np.minimum(sub[sel], zf[sel] - depth)


def _ring_face(m, road, i, oc, inner, outer, facing):
    """Faccia piana tra profilo interno ed esterno della canna, rivolta verso tan * facing."""
    o, lat, tan = _frame(road, i, oc)
    A, B = _merge_polylines(inner, outer)
    up = np.array([0, 0, 1.0])
    _strip(m, "ew_concrete", o + np.outer(A[:, 0], lat) + np.outer(A[:, 1], up),
           o + np.outer(B[:, 0], lat) + np.outer(B[:, 1], up), tan * facing)


def _shell_exposed(g, h, layers, road, oc, outer, sp, out_dir, hole_value):
    """Distanza dall'imbocco oltre la quale il terreno ricopre interamente il guscio esterno."""
    prof = np.asarray(outer[1:-1], dtype=np.float64)     # senza i tratti sotto la piattaforma
    lat = np.linspace(prof[:, 0].min(), prof[:, 0].max(), 25)
    top = np.interp(lat, prof[:, 0], prof[:, 1]) if np.all(np.diff(prof[:, 0]) > 0) else \
        np.interp(lat, prof[::-1, 0], prof[::-1, 1])
    last = 0.0
    for ds in np.arange(0.0, 80.0, 1.0):
        s = sp - out_dir * ds
        if s < 0 or s > road.length:
            break
        k = int(road.idx(s))
        q = road.point(np.array([s]))[0] + road.nor[k] * (oc + lat[:, None])
        zf = float(road.surface(np.array([s]), np.array([oc]))[0])
        zt = g.sample(h, q[:, 0], q[:, 1])
        ix = np.clip(np.floor((q[:, 0] - g.x0) / g.step).astype(int), 0, g.size - 1)
        iy = np.clip(np.floor((q[:, 1] - g.y0) / g.step).astype(int), 0, g.size - 1)
        holed = layers[iy, ix] == hole_value
        if ((zt < zf + top + 0.3) | holed).any():
            last = ds
    return last


def _headwall(m, road, i, oc, inner, lo, hi, top, out_dir, thick=1.2, base=-0.3):
    """Muro di testata con l'apertura ad arco della canna; lo, hi laterali assoluti."""
    o, lat, tan = _frame(road, i, oc)
    up = np.array([0, 0, 1.0])
    rect = [(lo - oc, base), (lo - oc, top), (hi - oc, top), (hi - oc, base)]
    A, B = _merge_polylines(inner, rect)
    back = -tan * out_dir * thick                 # spessore verso l'interno del monte

    def w(P, d=0.0):
        return o + np.outer(P[:, 0], lat) + np.outer(P[:, 1], up) + (back if d else 0.0)
    _strip(m, "ew_concrete", w(A), w(B), tan * out_dir)
    _strip(m, "ew_concrete", w(A, 1), w(B, 1), -tan * out_dir)
    R4 = np.array(rect)
    for a, b, nrm in ((0, 1, -lat), (1, 2, up), (2, 3, lat)):
        p = w(R4[[a, b]])
        q = w(R4[[a, b]], 1)
        _strip(m, "ew_concrete", p, q, nrm)


def _tunnel_holes(g, h, layers, road, oc, R, Hw, Hv, sp, out_dir, hole_value, gallery):
    """Fori nei quadrati di terreno che attraversano l'interno della canna presso un imbocco.

    In Torque3D/BeamNG il valore 255 del vertice (x, y) elimina il quadrato [x, x+1] x [y, y+1]
    (terrCell.cpp e terrFile.cpp). Restituisce la distanza dall'imbocco dell'ultimo foro."""
    # dall'imbocco verso l'interno; davanti al versante il tubo inizia `gallery` metri prima e
    # un quadrato forato non deve sporgere oltre la testata (margine di un quadrato, 2,9 m)
    ds = np.arange(-(gallery - 3.0), 60.0, 0.5)
    ss = sp - out_dir * ds
    ok_s = (ss >= 0) & (ss <= road.length)
    ds, ss = ds[ok_s], ss[ok_s]
    lat = np.arange(-R - 0.3, R + 0.31, 0.5)
    Q = road.point(ss)
    nor = road.nor[road.idx(ss)]
    zf = road.surface(ss, np.full(len(ss), oc))
    vault = Hw + Hv * np.sqrt(np.clip(1.0 - (lat / R) ** 2, 0.0, 1.0))
    last = 0.0
    for o, v in zip(lat, vault):
        q = Q + nor * (oc + o)
        ix = np.floor((q[:, 0] - g.x0) / g.step).astype(int)
        iy = np.floor((q[:, 1] - g.y0) / g.step).astype(int)
        ok = (ix >= 0) & (iy >= 0) & (ix < g.size - 1) & (iy < g.size - 1)
        ix, iy = np.where(ok, ix, 0), np.where(ok, iy, 0)
        c = np.stack([h[iy, ix], h[iy, ix + 1], h[iy + 1, ix], h[iy + 1, ix + 1]])
        hit = ok & (c.max(0) > zf + 0.6) & (c.min(0) < zf + v + 0.5)
        layers[iy[hit], ix[hit]] = hole_value
        if hit.any():
            last = max(last, float(ds[hit].max()))
    return last
