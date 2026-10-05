"""Area di servizio dell'autostrada A1 (due lati): parcheggi, distributore, edificio servizi.

Le corsie di accesso sono strade di roads.json (AS_SUD per la carreggiata in direzione est,
AS_NORD per quella in direzione ovest: decelerazione, tratto parallelo a ~50 m dall'asse,
accelerazione). Qui, nel sistema locale del tratto parallelo (x lungo l'autostrada, y verso
l'esterno), si costruiscono: piazzali livellati e asfaltati, stalli per auto e camion segnati con
DecalRoad (campi come in roads/decals.py), pensilina con isole di erogazione e chiosco, edificio
con vetrine (facciate di ew/edifici.py), area picnic. Mesh con collisione (Visible Mesh Final).
"""

from __future__ import annotations

import numpy as np

from .edifici import Frame, _flat_roof, _level_pad, _paint, _walls, write_textures
from .materials import IDX
from .mesh.collada import Mesh
from .roads.decals import _decal


def _parallel_section(a1, road, min_lat=44.0):
    """Tratto della corsia di servizio lontano dall'autostrada: stazioni e scostamento medio."""
    d, _, off = a1.field.query(road.P[:, 0], road.P[:, 1])
    far = np.abs(off) > min_lat
    idx = np.nonzero(far)[0]
    if len(idx) < 10:
        return None
    return road.s[idx[0]], road.s[idx[-1]], float(np.sign(np.median(off[idx])))


class Area:
    def __init__(self, ctx, rid):
        self.ctx = ctx
        net = ctx["net"]
        self.a1 = net.roads["A1"]
        self.road = net.roads[rid]
        sec = _parallel_section(self.a1, self.road)
        if sec is None:
            raise RuntimeError(f"area di servizio {rid}: tratto parallelo non trovato")
        s0, s1, side = sec
        sm = 0.5 * (s0 + s1)
        k = int(self.road.idx(sm))
        c = self.road.P[k]
        ka = int(self.a1.idx(float(self.a1.field.query(np.array([c[0]]), np.array([c[1]]))[1][0])))
        out = self.a1.nor[ka] * side                     # verso l'esterno (lontano dall'autostrada)
        # riferimento curvilineo sulla corsia: x = stazione dalla mezzeria del tratto, y = distanza
        # dall'asse della corsia verso l'esterno; così piazzali e stalli restano attaccati alla
        # corsia anche dove questa piega verso l'autostrada
        self.sm = sm
        self.v_sign = 1.0 if float(self.road.nor[k] @ out) >= 0 else -1.0
        v = self.road.nor[k] * self.v_sign
        u = np.array([v[1], -v[0]])
        self.x_sign = 1.0 if float(self.road.tan[k] @ u) >= 0 else -1.0
        self.z = float(self.road.surface(np.array([sm]), np.array([0.0]))[0])
        self.half = self.road.half_core
        self.lane_idx = net.order.index(rid)
        self.rid = rid
        self.mesh = Mesh()
        self.decals = []
        self.keepout = []
        self.span = (s1 - s0)

    def lane(self, x):
        """Punto sull'asse della corsia, versori (u lungo x, v verso l'esterno) e quota."""
        r = self.road
        s = float(np.clip(self.sm + self.x_sign * x, 0.0, r.length))
        p = r.point(np.array([s]))[0]
        t = np.array([np.interp(s, r.s, r.tan[:, 0]), np.interp(s, r.s, r.tan[:, 1])])
        t /= np.linalg.norm(t)
        v = np.array([-t[1], t[0]]) * self.v_sign
        u = np.array([v[1], -v[0]])
        return p, u, v, float(r.surface(np.array([s]), np.array([0.0]))[0])

    def world(self, x, y):
        p, _, v, _ = self.lane(x)
        q = p + v * y
        return float(q[0]), float(q[1])

    def frame(self, x, y):
        p, u, v, z = self.lane(x)
        q = p + v * y
        return Frame(q[0], q[1], float(np.arctan2(u[1], u[0])), z)

    def apron(self, x0, x1, y0, y1, layer="ew_asphalt"):
        """Piazzale a pezzi di 8 m lungo la corsia, spianato e dipinto; banchina di raccordo pavimentata."""
        n = max(1, int(np.ceil((x1 - x0) / 8.0)))
        for i in range(n):
            xa, xb = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
            xm = 0.5 * (xa + xb)
            F = self.frame(xm, 0.5 * (y0 + y1))
            w, d = xb - xa + 0.6, y1 - y0
            _level_pad(self.ctx, F, w, d, F.z0 - 0.02, blend=4.0)
            _paint(self.ctx, F, w, d, layer)
            # dal bordo pavimentato della corsia al piazzale: stessa pavimentazione (anche sulla banchina)
            if y0 <= self.half + 2.0:                   # solo i piazzali affacciati sulla corsia
                yb = self.road.half_paved
                Fl = self.frame(xm, 0.5 * (yb + y0))
                self._paint_lane(Fl, w, y0 - yb + 0.4, layer)
            self.keepout.append([*self.world(xm, 0.5 * (y0 + y1)), 0.5 * float(np.hypot(w, d)) + 4.0])

    def _paint_lane(self, F, w, d, layer):
        g = self.ctx["g"]
        core = self.ctx["road_masks"]["core_id"]
        r = max(w, d) / 2 + 2.0
        win = g.window(F.c[0] - r, F.c[1] - r, F.c[0] + r, F.c[1] + r)
        X, Y = g.window_mesh(win)
        dx, dy = X - F.c[0], Y - F.c[1]
        inside = (np.abs(dx * F.u[0] + dy * F.u[1]) <= w / 2) & (np.abs(dx * F.v[0] + dy * F.v[1]) <= d / 2)
        ok = (core[win] < 0) | (core[win] == self.lane_idx)
        sub = self.ctx["layers"][win]
        sub[inside & ok] = IDX[layer]

    def line(self, xa, ya, xb, yb, width=0.12):
        n = max(1, int(np.ceil(np.hypot(xb - xa, yb - ya) / 5.0)))
        nodes = []
        for t in np.linspace(0.0, 1.0, n + 1):
            x, y = xa + (xb - xa) * t, ya + (yb - ya) * t
            q = self.world(x, y)
            nodes.append([q[0], q[1], self.lane(x)[3], width])
        self.decals.append(_decal(nodes, "ew_line_solid", 2, 12, fade=(0, 0)))

    def box(self, mat, x, y, z, sx, sy, sz, ground=False):
        p, u, v, zl = self.lane(x)
        q = p + v * y
        base = float(self.ctx["g"].sample(self.ctx["h"], q[0], q[1])) if ground else zl
        self.mesh.add_box(mat, (q[0], q[1], base + z), (sx, sy, sz), float(np.arctan2(u[1], u[0])))

    # ---------------------------------------------------------------- elementi
    def car_park(self, x0, n, y0):
        """Due file di stalli perpendicolari (2,5 x 5 m) ai lati di una corsia di 7 m."""
        L = n * 2.5
        self.apron(x0, x0 + L, y0, y0 + 17.0 + 2.0)
        for row_y in (y0, y0 + 12.0):
            for k in range(n + 1):
                x = x0 + k * 2.5
                self.line(x, row_y, x, row_y + 5.0)
        self.line(x0, y0 + 5.0, x0 + L, y0 + 5.0)
        self.line(x0, y0 + 12.0, x0 + L, y0 + 12.0)
        return L

    def truck_park(self, x0, x1, y0, n=4):
        self.apron(x0, x1, y0, y0 + n * 4.5 + 2.0)
        for k in range(n + 1):
            y = y0 + 1.0 + k * 4.5
            self.line(x0 + 2.0, y, x1 - 2.0, y)

    def fuel_station(self, x0, y0):
        """Pensilina 24 x 16 m su quattro pilastri, tre isole di erogazione, chiosco."""
        self.apron(x0 - 6.0, x0 + 30.0, y0, y0 + 24.0, layer="ew_concrete")
        cx, cy = x0 + 12.0, y0 + 12.0
        for px in (cx - 9.0, cx + 9.0):
            for py in (cy - 5.0, cy + 5.0):
                self.box("ew_concrete", px, py, 2.6, 0.45, 0.45, 5.2)
        self.box("ew_metal", cx, cy, 5.6, 24.0, 16.0, 0.8)           # copertura
        self.box("ew_plaster_white", cx, cy, 6.15, 24.4, 16.4, 0.3)  # bordo superiore
        for iy in (-4.0, 0.0, 4.0):
            self.box("ew_concrete", cx, cy + iy, 0.12, 14.0, 1.3, 0.25)      # isola
            for ix in (-4.5, -1.5, 1.5, 4.5):
                self.box("ew_metal", cx + ix, cy + iy, 1.05, 0.8, 0.6, 1.6)  # colonnina
        # chiosco dietro la pensilina
        F = self.frame(x0 + 26.0, y0 + 20.0)
        lod1 = Mesh()
        H = _walls(self.mesh, lod1, F, 7.0, 5.0, 1, 0, shops=True, found=0.6)
        _flat_roof((self.mesh, lod1), F, 7.0, 5.0, H, parapet=0.5)

    def service_building(self, x0, y0, w=36.0, d=14.0):
        F = self.frame(x0 + w / 2, y0 + d / 2)
        lod1 = Mesh()
        H = _walls(self.mesh, lod1, F, w, d, 2, 3, shops=True, found=0.8)
        _flat_roof((self.mesh, lod1), F, w, d, H, parapet=0.9)
        self.apron(x0 - 4.0, x0 + w + 4.0, y0 - 6.0, y0 + d + 3.0, layer="ew_concrete")

    def picnic(self, x0, y0, n=6):
        for k in range(n):
            x = x0 + (k % 3) * 8.0
            y = y0 + (k // 3) * 7.0
            self.box("ew_veg_bark", x, y, 0.75, 2.0, 0.8, 0.08, ground=True)          # piano del tavolo
            self.box("ew_veg_bark", x, y, 0.37, 0.12, 0.6, 0.74, ground=True)         # gamba
            for by in (-0.75, 0.75):
                self.box("ew_veg_bark", x, y + by, 0.45, 2.0, 0.3, 0.06, ground=True)  # panche
                self.box("ew_veg_bark", x, y + by, 0.22, 0.1, 0.25, 0.44, ground=True)
        self.keepout.append([*self.world(x0 + 8.0, y0 + 3.5), 16.0])

    def build(self):
        h0 = self.half + 1.0                     # bordo della corsia di servizio
        length = self.car_park(-55.0, 22, h0)    # 55 m di stalli auto, verso un capo del tratto
        self.truck_park(-120.0, -62.0, h0, n=4)
        self.fuel_station(length - 55.0 + 10.0, h0)
        self.service_building(-48.0, h0 + 25.0)
        self.picnic(-110.0, h0 + 30.0)
        sw = self.ctx["sw"]
        sw.emit(f"servizio_{self.rid.lower()}", self.mesh, "MissionGroup/servizio")
        for dcl in self.decals:
            self.ctx["scene"].add(f"MissionGroup/servizio/segnaletica_{self.rid.lower()}", dcl)
        return {"stalli_auto": 44, "stalli_camion": 4, "decal": len(self.decals),
                "triangoli": self.mesh.triangle_count()}


def run(ctx: dict) -> dict:
    """Costruisce le due metà dell'area di servizio. Modifica ctx["h"] e ctx["layers"] sui piazzali."""
    stats, keepout = {}, []
    for rid in ("AS_SUD", "AS_NORD"):
        if rid not in ctx["net"].roads:
            continue
        A = Area(ctx, rid)
        stats[rid] = A.build()
        keepout += A.keepout
    mats = write_textures(ctx["level_dir"], ctx["level_name"], ctx["seed"]) if stats else {}
    return {"materials": mats, "stats": stats, "keepout": keepout}
