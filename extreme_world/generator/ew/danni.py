"""Danni stradali con geometria reale: buche, ondulazioni, avvallamenti, bordi sbrecciati,
cedimenti, frane e detriti. Solo sulla pista prove PT e sulla strada distrutta E1.

La griglia del terreno (2 m) è troppo grossolana per una buca: i tratti danneggiati sono mesh di
superficie (TSStatic con collisione Visible Mesh Final) che seguono la piattaforma stradale
(road.surface + 4 cm) con passo di 0.3 m e portano le deformazioni. Ai lati la mesh scende sotto
il terreno (bordo non urtabile), alle estremità si raccorda; ha un proprio materiale d'asfalto
invecchiato, perché la DecalRoad della strada si proietta sul terreno e resta coperta.
Su E1 anche cedimenti del terreno sotto la carreggiata, cumuli di frana e detriti.
"""

from __future__ import annotations

import numpy as np

from .geom import smoothstep
from .mesh.collada import Mesh
from .textures import TexGen, surf_asphalt
from .vegetation import mesh_rock

ART = "art/shapes/ew/danni"
STEP = 0.3          # passo della griglia di superficie
LIFT = 0.04         # spessore sopra la piattaforma nei tratti integri


def write_material(level_dir, level_name, seed):
    tg = TexGen(seed + 7001)
    rgb, hgt, rough = surf_asphalt(tg, 512, 41, old=True)
    hgt = (hgt - hgt.min()) / max(hgt.max() - hgt.min(), 1e-9)
    out = level_dir / ART
    b = tg.save(out / "ew_asfalto_rovinato_b.png", rgb)
    nm = tg.save(out / "ew_asfalto_rovinato_nm.png", tg.normal_from_height(hgt, 3.0))
    r = tg.save(out / "ew_asfalto_rovinato_r.png", (np.clip(rough, 0, 1) * 255).astype(np.uint8), "L")
    vp = lambda p: f"/levels/{level_name}/{ART}/{p.name}"  # noqa: E731
    return {"ew_asfalto_rovinato": {"name": "ew_asfalto_rovinato", "mapTo": "ew_asfalto_rovinato", "class": "Material",
                                    "version": 1.5,
                                    "Stages": [{"baseColorMap": vp(b), "normalMap": vp(nm), "roughnessMap": vp(r)}, {}, {}, {}]}}


# ================================================================ deformazioni
class Damage:
    """Somma di deformazioni definite in coordinate stradali (s, scostamento laterale)."""

    def __init__(self, rng, hp):
        self.rng = rng
        self.hp = hp                       # semilarghezza pavimentata
        self.holes = []                    # (s, o, rx, ry, prof, angolo)
        self.waves = []                    # (s0, s1, ampiezza, lunghezza d'onda)
        self.sinks = []                    # (s, o, rx, ry, prof)
        self.edges = []                    # (s0, s1, lato, larghezza, prof)

    def potholes(self, s0, s1, density, r_range, depth_range, edge_bias=0.0):
        area = (s1 - s0) * 2 * self.hp
        for _ in range(self.rng.poisson(density * area)):
            o = self.rng.uniform(-self.hp + 0.3, self.hp - 0.3)
            if edge_bias and self.rng.random() < edge_bias:
                o = np.sign(o) * self.rng.uniform(self.hp - 1.2, self.hp - 0.3)
            r = self.rng.uniform(*r_range)
            self.holes.append((self.rng.uniform(s0 + 3.5, s1 - 3.5), o, r * self.rng.uniform(0.8, 1.4), r,
                               self.rng.uniform(*depth_range), self.rng.uniform(0, np.pi)))

    def dz(self, S, O):
        z = np.zeros_like(S)
        for s, o, rx, ry, d, a in self.holes:
            near = (np.abs(S - s) < rx + 0.5) & (np.abs(O - o) < rx + 0.5)
            if not near.any():
                continue
            ds, do = S[near] - s, O[near] - o
            u = (ds * np.cos(a) + do * np.sin(a)) / rx
            v = (-ds * np.sin(a) + do * np.cos(a)) / ry
            r = np.sqrt(u * u + v * v)
            # fondo quasi piatto, pareti ripide sull'ultimo 20% del raggio, bordo leggermente rialzato
            z[near] += -d * (1.0 - smoothstep(0.78, 1.0, r)) + 0.012 * np.exp(-((r - 1.08) / 0.08) ** 2)
        for s0, s1, amp, lam in self.waves:
            inside = (S > s0) & (S < s1) & (np.abs(O) < self.hp)
            env = smoothstep(s0, s0 + 3, S) * (1 - smoothstep(s1 - 3, s1, S)) * (1 - smoothstep(self.hp - 0.6, self.hp, np.abs(O)))
            z += np.where(inside, -amp * (0.5 + 0.5 * np.sin(2 * np.pi * (S - s0) / lam)) * env, 0.0)
        for s, o, rx, ry, d in self.sinks:
            r = np.sqrt(((S - s) / rx) ** 2 + ((O - o) / ry) ** 2)
            z += -d * (1.0 - smoothstep(0.35, 1.0, r))
        for s0, s1, side, wdt, d in self.edges:
            inside = (S > s0) & (S < s1)
            jag = 0.25 * np.sin(S * 2.1) + 0.15 * np.sin(S * 5.3 + 1.0)
            lim = self.hp - wdt + jag
            br = inside & (O * side > lim)
            z += np.where(br, -d * smoothstep(lim, lim + 0.12, O * side) * smoothstep(s0, s0 + 1.5, S)
                          * (1 - smoothstep(s1 - 1.5, s1, S)), 0.0)
        return z


def _normals_at(road, S):
    """Normale sinistra interpolata con continuità lungo s (niente salti fra i nodi a 2 m)."""
    tx = np.interp(S, road.s, road.tan[:, 0])
    ty = np.interp(S, road.s, road.tan[:, 1])
    n = np.hypot(tx, ty)
    return np.stack([-ty / n, tx / n], axis=-1)


def overlay_z(road, S, O, dmg: Damage, s0, s1):
    """Quota della superficie danneggiata (senza la gonna) in coordinate stradali."""
    hp = road.half_paved
    base = road.surface(np.ravel(S), np.clip(np.ravel(O), -hp, hp)).reshape(np.shape(S))
    edge = smoothstep(hp + 0.05, hp + 0.45, np.abs(O))
    ends = np.minimum(smoothstep(s0, s0 + 0.9, S), 1.0 - smoothstep(s1 - 0.9, s1, S))
    return base, edge, ends, base + LIFT + dmg.dz(S, O) * (1.0 - edge) * ends


def overlay_mesh(ctx, road, s0, s1, dmg: Damage, mat="ew_asfalto_rovinato"):
    """Griglia di superficie tra s0 e s1 con le deformazioni di dmg; bordi sotto il terreno."""
    hp = road.half_paved
    ss = np.arange(s0, s1 + 1e-6, STEP)
    oo = np.arange(-hp - 0.9, hp + 0.9 + 1e-6, STEP)
    S, O = np.meshgrid(ss, oo, indexing="ij")                    # [lungo, trasversale]
    P = road.point(S.ravel()).reshape(S.shape + (2,))
    XY = P + _normals_at(road, S) * O[..., None]
    base, edge, ends, Zd = overlay_z(road, S, O, dmg, s0, s1)
    # +4 cm sulla carreggiata; oltre i bordi e alle estremità la gonna scende 0,3 m sotto la
    # piattaforma e comunque 0,15 m sotto il terreno reale (scarpate di riporto, terreno abbassato)
    skirt = np.maximum(edge, 1.0 - ends)
    terr = ctx["g"].sample(ctx["h"], XY[..., 0].ravel(), XY[..., 1].ravel()).reshape(S.shape)
    low = np.minimum(base - 0.30, terr - 0.15)
    Z = Zd + (low - Zd) * skirt
    V = np.dstack([XY, Z])                                         # (ns, no, 3)
    ns, no = S.shape
    # normali dalla griglia
    dvs = np.gradient(V, axis=0)
    dvo = np.gradient(V, axis=1)
    N = np.cross(dvs, dvo)
    # la normale deve puntare verso l'alto
    N *= np.sign(N[..., 2:3] + 1e-12)
    N /= np.linalg.norm(N, axis=2, keepdims=True)
    UV = np.dstack([S / 4.0, O / 4.0])
    idx = np.arange(ns * no).reshape(ns, no)
    a, b, c, d = idx[:-1, :-1].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel(), idx[:-1, 1:].ravel()
    tris = np.concatenate([np.stack([a, b, c], 1), np.stack([a, c, d], 1)])
    Pf = V.reshape(-1, 3)
    # orientamento coerente con le normali verso l'alto
    gn = np.cross(Pf[tris[:, 1]] - Pf[tris[:, 0]], Pf[tris[:, 2]] - Pf[tris[:, 0]])
    flip = gn[:, 2] < 0
    tris[flip] = tris[flip][:, [0, 2, 1]]
    m = Mesh()
    m.add(mat, Pf, N.reshape(-1, 3), UV.reshape(-1, 2), tris)
    return m, Z - base


def sink_terrain(ctx, road, s0, s1, depth=0.5):
    """Abbassa il terreno sotto la mesh di superficie (carreggiata), così buche e avvallamenti
    non sono coperti né bloccati dal terreno: ruote e vista incontrano solo la mesh."""
    g, h = ctx["g"], ctx["h"]
    hp = road.half_paved
    i0, i1 = int(road.idx(s0)), int(road.idx(s1))
    P = road.P[i0:i1 + 1]
    win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=hp + 4)
    X, Y = g.window_mesh(win)
    d, sq, off = road.field.query(X, Y, max_dist=hp + 4)
    # profondità piena dove la mesh ha i danni (da s0 + 0,9 a s1 - 0,9 e fino a hp + 0,45)
    along = smoothstep(s0 - 0.6, s0 + 0.9, sq) * (1.0 - smoothstep(s1 - 0.9, s1 + 0.6, sq))
    across = 1.0 - smoothstep(hp + 0.45, hp + 1.6, np.abs(off))
    sub = h[win]
    sub -= (depth * along * across).astype(sub.dtype)


# ================================================================ terreno di E1
def collapse(ctx, road, s, side, length, depth, width):
    """Cedimento: abbassa il terreno su metà carreggiata e sulla banchina (strada distrutta)."""
    g, h = ctx["g"], ctx["h"]
    p = road.point(np.array([s]))[0]
    R = length + width + 6
    win = g.window(p[0] - R, p[1] - R, p[0] + R, p[1] + R)
    X, Y = g.window_mesh(win)
    d, sq, off = road.field.query(X, Y, max_dist=R)
    u = (sq - s) / (length / 2)
    lat = (off * side - (road.half_paved - width)) / (width + road.t["verge"] + 3.0)
    w = (1.0 - smoothstep(0.6, 1.0, np.abs(u))) * smoothstep(-0.25, 0.35, lat) * (1.0 - smoothstep(1.0, 1.4, lat))
    sub = h[win]
    sub -= (depth * w).astype(sub.dtype)


def landslide(ctx, road, s, side, rng, mesh_rocks: Mesh):
    """Cumulo di frana da un lato, che invade parte di una corsia; massi sopra."""
    g, h = ctx["g"], ctx["h"]
    k = int(road.idx(s))
    c = road.P[k] + road.nor[k] * side * (road.half_paved + 1.5)
    R = 14.0
    win = g.window(c[0] - R, c[1] - R, c[0] + R, c[1] + R)
    X, Y = g.window_mesh(win)
    r = np.hypot(X - c[0], Y - c[1])
    sub = h[win]
    sub += (1.4 * (1.0 - smoothstep(0.0, 8.5, r)) ** 1.5).astype(sub.dtype)
    for j in range(int(rng.integers(4, 8))):
        q = c + rng.normal(0, 2.5, 2)
        sc = rng.uniform(0.4, 1.0)
        rock = mesh_rock(int(rng.integers(0, 10_000)), sub=1)
        P = rock.parts["ew_rock_wall"]["p"][0] * sc
        P[:, :2] += q
        P[:, 2] += float(g.sample(h, q[0], q[1])) - 0.35 * sc
        mesh_rocks.add("ew_rock_wall", P, rock.parts["ew_rock_wall"]["n"][0], rock.parts["ew_rock_wall"]["uv"][0],
                       rock.parts["ew_rock_wall"]["i"][0])
    return c


def debris(ctx, road, s0, s1, dmg: Damage, rng, m: Mesh, n=12):
    """Detriti sulla superficie danneggiata del tratto [s0, s1]: lastre d'asfalto e sassi."""
    hp = road.half_paved
    for _ in range(n):
        s = rng.uniform(s0 + 2.0, s1 - 2.0)
        o = rng.uniform(-hp + 0.4, hp - 0.4)
        p = road.point(np.array([s]))[0] + _normals_at(road, np.array([s]))[0] * o
        # quota minima della superficie sotto l'oggetto (niente pezzi sospesi sopra le buche)
        S = s + np.array([-0.5, 0.0, 0.5, 0.0, 0.0])
        O = o + np.array([0.0, 0.0, 0.0, -0.4, 0.4])
        z = float(overlay_z(road, S, O, dmg, s0, s1)[3].min())
        if rng.random() < 0.5:
            yaw = rng.uniform(0, np.pi)
            m.add_box("ew_asfalto_rovinato", (p[0], p[1], z + 0.025), (rng.uniform(0.4, 1.1), rng.uniform(0.3, 0.8), 0.07), yaw)
        else:
            sc = rng.uniform(0.15, 0.35)
            rock = mesh_rock(int(rng.integers(0, 10_000)), sub=1)
            part = rock.parts["ew_rock_wall"]
            P = part["p"][0] * sc
            P[:, :2] += p
            P[:, 2] += z - 0.1 * sc                     # base di mesh_rock a z = 0 circa
            m.add("ew_rock_wall", P, part["n"][0], part["uv"][0], part["i"][0])


# ================================================================ modulo
def _emit(ctx, name, mesh, group):
    if mesh.parts:
        ctx["sw"].emit(name, mesh, group)
        return mesh.triangle_count()
    return 0


def _zone_ok(ctx, road, s0, s1, taken):
    """Tratto utilizzabile: niente ponti o gallerie (con margine), nessun altro ramo della stessa
    strada né altre strade entro la mesh di superficie, nessuna sovrapposizione con altri tratti."""
    if s0 < 40.0 or s1 > road.length - 40.0:
        return False
    ss = np.arange(s0 - 15.0, s1 + 15.0, 2.0)
    if road.structure_mask(ss, "bridge").any() or road.structure_mask(ss, "tunnel").any():
        return False
    if any(s0 < b + 20.0 and s1 > a - 20.0 for a, b in taken):
        return False
    for _, sj, _ in road.junctions:
        if s0 - 25.0 < sj < s1 + 25.0:
            return False
    lat = road.half_paved + 1.5
    S = np.repeat(np.arange(s0, s1 + 0.1, 3.0), 3)
    O = np.tile(np.array([-lat, 0.0, lat]), len(S) // 3)
    XY = road.point(S) + _normals_at(road, S) * O[:, None]
    _, sq, _ = road.field.query(XY[:, 0], XY[:, 1])
    if (np.abs(sq - S) > 20.0).any():                 # un altro ramo della stessa strada è più vicino
        return False
    g = ctx["g"]
    core = ctx["road_masks"]["core_id"]
    me = ctx["net"].order.index(road.rid)
    ix, iy = g.to_index(XY[:, 0], XY[:, 1])
    cid = core[np.clip(np.rint(iy).astype(int), 0, core.shape[0] - 1), np.clip(np.rint(ix).astype(int), 0, core.shape[1] - 1)]
    return not ((cid >= 0) & (cid != me)).any()


def _place_zone(ctx, road, s_want, length, taken):
    """Prima posizione valida vicina a s_want (spostamenti fino a ±240 m)."""
    for shift in [0.0] + [d * k for k in range(1, 25) for d in (10.0, -10.0)]:
        s0 = s_want + shift
        if _zone_ok(ctx, road, s0, s0 + length, taken):
            return s0
    return None


def _has_rail(ctx, road, s, side):
    """Vero se in quel punto c'è (o potrebbe esserci) un guardrail sul lato: stesso criterio di
    structures.guardrails (dislivello oltre la piattaforma), con margine."""
    g, h = ctx["g"], ctx["h"]
    ss = np.arange(s - 24.0, s + 24.1, 2.0)
    k = road.idx(ss)
    z_edge = road.surface(ss, np.full(len(ss), side * road.half_paved))
    drop = np.zeros(len(ss))
    for o in (3.0, 6.0, 10.0):
        Q = road.P[k] + road.nor[k] * side * (road.half_core + o)
        drop = np.maximum(drop, z_edge - g.sample(h, Q[:, 0], Q[:, 1]) - 0.35 * o)
    return bool((drop > 1.2).any())


def run(ctx: dict) -> dict:
    """Danni su PT (pista prove) ed E1 (strada distrutta). Modifica ctx["h"] sotto i tratti."""
    net = ctx["net"]
    rng = np.random.default_rng(ctx["seed"] + 9091)
    stats = {"tratti": 0, "buche": 0, "triangoli": 0, "cedimenti_frane": 0,
             "strade": [r for r in ("PT", "E1") if r in net.roads], "zone": []}
    zones = []
    taken = {}
    if "PT" in net.roads:
        pt = net.roads["PT"]
        # sei zone di gravità crescente, lontane da incroci, ponti e altre strade
        plan = [("buche piccole", dict(potholes=(0.06, (0.18, 0.32), (0.05, 0.08)))),
                ("buche medie", dict(potholes=(0.07, (0.3, 0.55), (0.08, 0.12)))),
                ("buche grandi e fitte", dict(potholes=(0.10, (0.4, 0.9), (0.10, 0.18)))),
                ("ondulazioni", dict(waves=(0.06, 0.8))),
                ("avvallamenti", dict(sinks=(4, (1.5, 3.0), (0.10, 0.25)))),
                ("bordi sbrecciati", dict(edges=(0.9, 0.16), potholes=(0.04, (0.25, 0.6), (0.06, 0.12), 0.6)))]
        starts = np.linspace(180.0, pt.length - 200.0, len(plan))
        for (label, spec), s_want in zip(plan, starts):
            s0 = _place_zone(ctx, pt, s_want, 100.0, taken.setdefault("PT", []))
            if s0 is not None:
                taken["PT"].append((s0, s0 + 100.0))
                zones.append((pt, s0, s0 + 100.0, label, spec))
    if "E1" in net.roads:
        e1 = net.roads["E1"]
        for i, s_want in enumerate(np.linspace(350.0, e1.length - 450.0, 10)):
            spec = dict(potholes=(0.09, (0.3, 0.8), (0.08, 0.2), 0.3))
            if i % 3 == 1:
                spec["edges"] = (1.2, 0.2)
            if i % 4 == 2:
                spec["sinks"] = (2, (1.5, 3.5), (0.12, 0.3))
            s0 = _place_zone(ctx, e1, s_want, 45.0, taken.setdefault("E1", []))
            if s0 is not None:
                taken["E1"].append((s0, s0 + 45.0))
                zones.append((e1, s0, s0 + 45.0, f"E1 tratto {i + 1}", spec))
    dmgs = []
    for road, s0, s1, label, spec in zones:
        dmg = Damage(rng, road.half_paved)
        if "potholes" in spec:
            dens, rr, dd, *bias = spec["potholes"]
            dmg.potholes(s0, s1, dens, rr, dd, bias[0] if bias else 0.0)
        if "waves" in spec:
            dmg.waves.append((s0 + 5, s1 - 5, *spec["waves"]))
        if "sinks" in spec:
            n, rr, dd = spec["sinks"]
            for _ in range(n):
                dmg.sinks.append((rng.uniform(s0 + 8, s1 - 8), rng.uniform(-road.half_paved + 1, road.half_paved - 1),
                                  rng.uniform(*rr) * 1.6, rng.uniform(*rr), rng.uniform(*dd)))
        if "edges" in spec:
            wdt, d = spec["edges"]
            for side in (1.0, -1.0):
                a = rng.uniform(s0 + 3, s0 + 0.6 * (s1 - s0))
                dmg.edges.append((a, min(a + rng.uniform(20, 50), s1 - 1.0), side, wdt, d))
        sink_terrain(ctx, road, s0, s1)             # prima la quota del terreno, poi la mesh che lo segue
        m, dz = overlay_mesh(ctx, road, s0, s1, dmg)
        name = f"danni_{road.rid.lower()}_{int(s0)}"
        stats["triangoli"] += _emit(ctx, name, m, f"MissionGroup/danni/{road.rid}")
        stats["tratti"] += 1
        stats["buche"] += len(dmg.holes)
        stats["zone"].append([road.rid, label, round(s0), round(s1)])
        dmgs.append(dmg)
    # E1: cedimenti, frane, detriti
    if "E1" in net.roads:
        e1 = net.roads["E1"]
        free = [s for s in np.arange(300.0, e1.length - 300.0, 20.0)
                if not any(s0 - 30 < s < s1 + 30 for r, s0, s1, _, _ in zones if r is e1)
                and _zone_ok(ctx, e1, s - 15.0, s + 15.0, [])]
        rng.shuffle(free)
        picked = []
        for s in free:
            if len(picked) >= 7:
                break
            side = 1.0 if len(picked) % 2 else -1.0
            if not all(abs(s - q) > 250 for q, _ in picked):
                continue
            if _has_rail(ctx, e1, s, side):
                side = -side
                if _has_rail(ctx, e1, s, side):
                    continue
            picked.append((s, side))
        for j, (s, side) in enumerate(sorted(picked)):
            if j % 3 == 2:
                rocks = Mesh()
                landslide(ctx, e1, s, side, rng, rocks)
                stats["triangoli"] += _emit(ctx, f"danni_e1_frana_{int(s)}", rocks, "MissionGroup/danni/E1")
            else:
                collapse(ctx, e1, s, side, rng.uniform(5, 12), rng.uniform(0.3, 1.0), rng.uniform(1.5, 3.0))
        for (r, s0, s1, _, _), dmg in zip(zones, dmgs):
            if r is e1:
                deb = Mesh()
                debris(ctx, e1, s0, s1, dmg, rng, deb)
                stats["triangoli"] += _emit(ctx, f"danni_e1_detriti_{int(s0)}", deb, "MissionGroup/danni/E1")
        stats["cedimenti_frane"] = len(picked)
    mats = write_material(ctx["level_dir"], ctx["level_name"], ctx["seed"])
    return {"materials": mats, "stats": stats, "keepout": []}
