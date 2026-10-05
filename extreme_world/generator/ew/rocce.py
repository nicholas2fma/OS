"""Percorsi speciali F e H: salita quasi impossibile e passaggio tra le rocce.

F ("Salita Impossibile", strada F1 di roads.json, tipo climb): il tracciato è stato scelto con
una ricerca sul terreno reale (diramazioni dalle strade delle regioni A, E, F; tratti di 300-700 m
con pendenza media 35-55%, niente pareti verticali, arrivo su una cima). Qui la superficie diventa
pietraia/roccia e si aggiungono alcuni gradini di roccia trasversali per i fuoristrada.

H ("Passaggio tra le rocce", sul sentiero E2): grandi massi generati (4-14 m) ai due lati del
sentiero formano tre strettoie con luce libera misurata sulle mesh (2,8-3,4 m tra 0,1 e 2,5 m
dal suolo), poi un giardino di massi con gradini da scavalcare. Collisione Visible Mesh Final.
"""

from __future__ import annotations

import numpy as np

from .materials import IDX
from .mesh.collada import Mesh
from .vegetation import mesh_rock

SQUEEZE = (2.8, 3.4)          # luce libera ammessa nelle strettoie (m)
BAND = (0.1, 2.5)             # fascia d'altezza dal suolo in cui si misura la luce


def _rock(seed, size, sub=2):
    """Masso grande: icosfera deformata (vegetation.mesh_rock) scalata in modo anisotropo."""
    m = mesh_rock(seed, sub=sub)
    part = m.parts["ew_rock_wall"]
    P = part["p"][0].copy()
    P[:, 2] -= 0.3                                       # base a z = 0 circa
    P *= np.asarray(size) / np.array([1.8, 1.5, 1.2])
    N = part["n"][0] / np.asarray(size)                  # normali di una scala anisotropa
    N /= np.linalg.norm(N, axis=1)[:, None]
    return P, N, part["uv"][0] * (np.mean(size) / 1.5), part["i"][0]


def _place(P, N, yaw, origin):
    c, s = np.cos(yaw), np.sin(yaw)
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])
    return P @ R.T + origin, N @ R.T


class Passage:
    def __init__(self, ctx, rid, s0, s1, rng):
        self.ctx = ctx
        self.road = ctx["net"].roads[rid]
        self.s0, self.s1 = s0, s1
        self.rng = rng
        self.mesh = Mesh()
        self.report = []

    def frame(self, s):
        k = int(self.road.idx(s))
        p = self.road.point(np.array([s]))[0]
        z = float(self.road.surface(np.array([s]), np.array([0.0]))[0])
        return p, self.road.tan[k], self.road.nor[k], z

    def squeeze(self, s, target):
        """Due massi ai lati con luce libera `target`; corregge le posizioni misurando le mesh."""
        p, t, n, z = self.frame(s)
        rocks = []
        for side in (1.0, -1.0):
            size = (self.rng.uniform(8, 14), self.rng.uniform(4.0, 7.0), self.rng.uniform(6.0, 12.0))
            P, N, UV, I = _rock(int(self.rng.integers(0, 1 << 30)), size)
            yaw = float(np.arctan2(t[1], t[0])) + self.rng.uniform(-0.35, 0.35)
            rocks.append([side, P, N, UV, I, yaw])
        off = [target / 2 + 2.0, target / 2 + 2.0]
        for _ in range(12):
            placed = []
            for j, (side, P, N, UV, I, yaw) in enumerate(rocks):
                o = p + n * side * off[j]
                ground = float(self.ctx["g"].sample(self.ctx["h"], o[0], o[1]))
                W, Wn = _place(P, N, yaw, np.array([o[0], o[1], min(ground, z) - 0.12 * P[:, 2].max()]))
                placed.append((W, Wn))
            # coordinate laterali dei vertici nella fascia del veicolo, vicino alla strettoia
            lat = []
            for (W, _), (side, *_rest) in zip(placed, rocks):
                rel = W[:, :2] - p
                along = rel @ t
                lateral = rel @ n
                hz = W[:, 2] - z
                sel = (np.abs(along) < 6.0) & (hz > BAND[0]) & (hz < BAND[1])
                lat.append(lateral[sel] if sel.any() else np.array([side * 99.0]))
            left_min = float(lat[0].min())          # masso a sinistra (laterale > 0)
            right_max = float(lat[1].max())
            clear = left_min - right_max
            err = target - clear
            if abs(err) < 0.04:
                break
            off[0] += err / 2
            off[1] += err / 2
        for (W, Wn), (side, P, N, UV, I, yaw) in zip(placed, rocks):
            self.mesh.add("ew_rock_wall", W, Wn, UV, I)
        # massi di contorno dietro ciascun lato: formano una parete senza restringere la luce
        limits = (left_min, right_max)
        for j, side in enumerate((1.0, -1.0)):
            for da in (-1.0, 1.0):
                size = (self.rng.uniform(6, 11), self.rng.uniform(4, 7), self.rng.uniform(4, 9))
                Pc, Nc, UVc, Ic = _rock(int(self.rng.integers(0, 1 << 30)), size)
                lat0 = off[j] + self.rng.uniform(2.5, 4.5)
                for _ in range(8):
                    o = p + t * da * self.rng.uniform(5.0, 8.0) + n * side * lat0
                    ground = float(self.ctx["g"].sample(self.ctx["h"], o[0], o[1]))
                    W, Wn = _place(Pc, Nc, self.rng.uniform(0, np.pi), np.array([o[0], o[1], ground - 0.15 * size[2]]))
                    rel = W[:, :2] - p
                    hz = W[:, 2] - z
                    sel = (np.abs(rel @ t) < 9.0) & (hz > BAND[0]) & (hz < BAND[1])
                    lat = rel[sel] @ n
                    if not sel.any() or (side > 0 and lat.min() >= limits[0]) or (side < 0 and lat.max() <= limits[1]):
                        self.mesh.add("ew_rock_wall", W, Wn, UVc, Ic)
                        break
                    lat0 += 1.0
        self.report.append({"s": round(float(s)), "luce_m": round(clear, 2)})
        return clear

    def garden(self, sa, sb, n=14):
        """Massi bassi sul sentiero, sfalsati: gradini da 0,3-0,8 m da scavalcare."""
        for k in range(n):
            s = sa + (sb - sa) * (k + self.rng.uniform(0.2, 0.8)) / n
            p, t, nv, z = self.frame(s)
            o = self.rng.uniform(-1.6, 1.6)
            size = (self.rng.uniform(1.0, 2.2), self.rng.uniform(0.9, 1.8), self.rng.uniform(0.6, 1.3))
            P, N, UV, I = _rock(int(self.rng.integers(0, 1 << 30)), size, sub=1)
            c = p + nv * o
            W, Wn = _place(P, N, self.rng.uniform(0, np.pi), np.array([c[0], c[1], z - 0.4 * size[2]]))
            self.mesh.add("ew_rock_wall", W, Wn, UV, I)

    def scatter(self, sa, sb, n=10):
        """Altri massi grandi fuori dal sentiero, per l'ambientazione."""
        for k in range(n):
            s = self.rng.uniform(sa, sb)
            p, t, nv, z = self.frame(s)
            side = 1.0 if k % 2 else -1.0
            size = (self.rng.uniform(4, 9), self.rng.uniform(3, 7), self.rng.uniform(3, 9))
            c = p + nv * side * self.rng.uniform(8.0, 22.0)
            ground = float(self.ctx["g"].sample(self.ctx["h"], c[0], c[1]))
            P, N, UV, I = _rock(int(self.rng.integers(0, 1 << 30)), size)
            W, Wn = _place(P, N, self.rng.uniform(0, np.pi), np.array([c[0], c[1], ground - 0.3 * size[2]]))
            self.mesh.add("ew_rock_wall", W, Wn, UV, I)


def _paint_road(ctx, road, layer_fn):
    core = ctx["road_masks"]["core_id"]
    idx = ctx["net"].order.index(road.rid)
    sel = core == idx
    ys, xs = np.nonzero(sel)
    if len(ys) == 0:
        return 0
    layer_fn(ys, xs)
    return len(ys)


def run(ctx: dict) -> dict:
    """Percorsi F (F1) e H (E2). Ridipinge la superficie di F1 sulla layer map."""
    net = ctx["net"]
    rng = np.random.default_rng(ctx["seed"] + 4401)
    stats, keep = {}, []
    if "E2" in net.roads:
        e2 = net.roads["E2"]
        # tratto più dolce del sentiero (pendenza max ~24%, quasi rettilineo)
        s0 = 2325.0 if e2.length > 2800 else e2.length * 0.45
        H = Passage(ctx, "E2", s0, s0 + 320.0, rng)
        clears = [H.squeeze(s0 + d, float(rng.uniform(SQUEEZE[0] + 0.1, SQUEEZE[1] - 0.1))) for d in (40.0, 110.0, 180.0)]
        H.garden(s0 + 220.0, s0 + 300.0)
        H.scatter(s0, s0 + 320.0)
        ctx["sw"].emit("rocce_passaggio_e2", H.mesh, "MissionGroup/percorsi/H_passaggio_rocce")
        stats["H"] = {"strettoie": H.report, "triangoli": H.mesh.triangle_count(),
                      "luce_ok": all(SQUEEZE[0] - 0.05 <= c <= SQUEEZE[1] + 0.05 for c in clears)}
        for s in np.arange(s0, s0 + 321.0, 20.0):
            x, y = H.frame(s)[0]
            keep.append([float(x), float(y), 25.0])
    if "F1" in net.roads:
        f1 = net.roads["F1"]
        lay = ctx["layers"]
        g = ctx["g"]

        def rough(ys, xs):
            x = g.x0 + xs * g.step
            y = g.y0 + ys * g.step
            n = ctx["noise"].fbm(x.astype(np.float64), y.astype(np.float64), 9.0, octaves=2, salt=4411)
            lay[ys, xs] = np.where(n > 0.1, IDX["ew_rock"], IDX["ew_scree"])
        cells = _paint_road(ctx, f1, rough)
        # gradini di roccia trasversali (affioramenti) lungo la salita
        mesh = Mesh()
        for s in np.arange(60.0, f1.length - 30.0, 55.0):
            k = int(f1.idx(s))
            p, t, nv = f1.P[k], f1.tan[k], f1.nor[k]
            z = float(f1.surface(np.array([s]), np.array([0.0]))[0])
            for o in np.linspace(-2.2, 2.2, 3) + rng.uniform(-0.4, 0.4):
                size = (rng.uniform(1.2, 2.2), rng.uniform(1.0, 1.6), rng.uniform(0.5, 0.9))
                P, N, UV, I = _rock(int(rng.integers(0, 1 << 30)), size, sub=1)
                c = p + nv * o
                W, Wn = _place(P, N, float(np.arctan2(t[1], t[0])), np.array([c[0], c[1], z - 0.45 * size[2]]))
                mesh.add("ew_rock_wall", W, Wn, UV, I)
        ctx["sw"].emit("rocce_salita_f1", mesh, "MissionGroup/percorsi/F_salita_impossibile")
        grade = np.abs(np.diff(f1.z) / np.diff(f1.s))
        stats["F"] = {"lunghezza_m": round(f1.length), "dislivello_m": round(float(f1.z.max() - f1.z.min()), 1),
                      "pendenza_media": round(float((f1.z[-1] - f1.z[0]) / f1.length), 3),
                      "pendenza_max_20m": round(float(np.max(np.abs(f1.z[10:] - f1.z[:-10]) / (f1.s[10:] - f1.s[:-10]))), 3),
                      "celle_ridipinte": cells, "triangoli": mesh.triangle_count()}
        _ = grade
    return {"materials": {}, "stats": stats, "keepout": keep}
