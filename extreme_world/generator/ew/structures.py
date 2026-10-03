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
        if road.kind in ("trail", "climb", "dirt", "urban"):
            continue
        n = len(road.s)
        ground = ~(road.structure_mask(road.s, "bridge") | road.structure_mask(road.s, "tunnel"))
        fast = road.kind in ("highway", "ring", "ramp")
        for side in (1.0, -1.0):
            edge = side * (road.half_paved + 0.55)
            z_edge = road.surface(road.s, np.full(n, np.clip(edge, -road.half_paved, road.half_paved)))
            drop = np.zeros(n)
            for o in (3.0, 6.0, 10.0):
                Q = road.P + road.nor * (side * (road.half_core + o))
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
                    P = road.P[sel] + road.nor[sel] * edge
                    path = np.column_stack([P, z_edge[sel]])
                    m = Mesh()
                    # lama (profilo a doppia onda semplificato) + paletti ogni 4 m
                    rail = [(-0.02, 0.55), (0.06, 0.62), (0.02, 0.70), (0.06, 0.78), (-0.02, 0.85), (-0.06, 0.85), (-0.06, 0.55)]
                    if side < 0:
                        rail = [(-x, y) for x, y in rail][::-1]
                    m.sweep("ew_metal", path, rail, closed_profile=True)
                    for j in range(0, len(sel), 2):
                        i = sel[j]
                        x, y = road.P[i] + road.nor[i] * (edge + side * 0.12)
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
