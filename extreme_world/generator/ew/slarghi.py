"""Piazzole: di emergenza lungo l'autostrada e panoramiche sulle strade di montagna.

Una piazzola è un allargamento della piattaforma su un lato della strada (`Road.bays`, letto da
`Road.bay_ext`): la modellazione del terreno (`RoadNetwork._stamp`) estende piattaforma e parte
pavimentata con raccordi a S, i guardrail (`structures.guardrails`) e l'arredo (`arredo.py`)
seguono il nuovo bordo. Le posizioni si scelgono qui, sul terreno naturale, dopo il tracciamento
delle strade e prima della modellazione.

- Emergenza (A1): una ogni ~1 km per carreggiata, sul lato destro di chi viaggia, 45 m più i
  raccordi, larga 3 m oltre la banchina; lontano da ponti, gallerie, svincoli e altre strade.
- Panoramiche: dove il terreno scende di oltre 100 m entro 250 m da un lato della strada (o
  c'è un lago in vista), su un tratto quasi rettilineo; slargo di 7 m sul lato con meno movimento
  di terra.
"""

from __future__ import annotations

import numpy as np

EMERGENCY = {"width": 3.0, "length": 45.0, "taper": 25.0, "spacing": 1000.0}
VIEW = {"width": 7.0, "length": 32.0, "taper": 16.0, "min_view": 100.0, "max_earth": 4.5,
        "min_gap": 900.0, "per_road": 2, "max_total": 12}
VIEW_KINDS = ("state", "local", "mountain", "narrow", "gravel")
NO_VIEW = ("PT", "E1", "E2", "F1")


class Planner:
    def __init__(self, net, h0, flats, wet):
        self.net = net
        self.g = net.grid
        self.h0 = h0
        self.flats = flats
        self.wet = wet

    # ------------------------------------------------------------ controlli
    def span_ok(self, road, s0, s1, margin):
        if s0 - margin < 40.0 or s1 + margin > road.length - 40.0:
            return False
        for st in road.structures:
            if st.s1 > s0 - margin and st.s0 < s1 + margin:
                return False
        for _, sj, _ in road.junctions:
            if s0 - margin - 40.0 < sj < s1 + margin + 40.0:
                return False
        for b in road.bays:
            if b["s1"] + b["taper"] > s0 - margin - 60.0 and b["s0"] - b["taper"] < s1 + margin + 60.0:
                return False
        return True

    def outline(self, road, s0, s1, taper, extra):
        """Punti del bordo esterno dell'ultima piazzola aggiunta (raccordi compresi), più `extra`."""
        ss = np.arange(s0 - taper, s1 + taper + 0.1, 4.0)
        k = road.idx(ss)
        side = float(road.bays[-1]["side"])
        lat = road.half_core + road.bay_ext(ss, np.full(len(ss), side)) + extra
        return ss, road.P[k] + road.nor[k] * (side * lat)[:, None]

    def clear(self, road, ss, pts, extra):
        """Nessun'altra strada (né un altro tratto della stessa) vicino alla piazzola."""
        lo, hi = pts.min(0) - 80.0, pts.max(0) + 80.0
        for rid, o in self.net.roads.items():
            if (o.P[:, 0].max() < lo[0] or o.P[:, 0].min() > hi[0] or
                    o.P[:, 1].max() < lo[1] or o.P[:, 1].min() > hi[1]):
                continue
            d, s, _ = o.field.query(pts[:, 0], pts[:, 1], max_dist=o.half_core + extra + 10.0)
            if rid == road.rid:
                bad = (d < o.half_core + extra) & (np.abs(s - ss) > 35.0)
            else:
                bad = d < o.half_core + extra
            if bad.any():
                return False
        return True

    def dry_rural(self, pts):
        for f in self.flats:
            if np.any(np.hypot(*(pts - np.asarray(f["center"])).T) < f["radius"] + 60.0):
                return False
        return not self.wet_any(pts)

    def wet_any(self, pts):
        ix, iy = self.g.to_index(pts[:, 0], pts[:, 1])
        iy = np.clip(np.rint(iy).astype(int), 0, self.wet.shape[0] - 1)
        ix = np.clip(np.rint(ix).astype(int), 0, self.wet.shape[1] - 1)
        return bool(self.wet[iy, ix].any())

    def earthwork(self, road, s0, s1, side, width):
        """Massimo scarto tra terreno naturale e piano della piazzola (m)."""
        ss = np.arange(s0, s1 + 0.1, 4.0)
        k = road.idx(ss)
        worst = 0.0
        for lat in (road.half_core + 0.5 * width, road.half_core + width, road.half_core + width + 2.0):
            Q = road.P[k] + road.nor[k] * side * lat
            zt = self.g.sample(self.h0, Q[:, 0], Q[:, 1])
            zs = road.surface(ss, np.full(len(ss), side * (road.half_paved + width)))
            worst = max(worst, float(np.abs(zt - zs).max()))
        return worst

    def accept(self, road, s_c, side, cfg, kind, max_earth, extra=None):
        L, tp, w = cfg["length"], cfg["taper"], cfg["width"]
        s0, s1 = s_c - L / 2, s_c + L / 2
        if not self.span_ok(road, s0, s1, tp + 20.0):
            return None
        bay = {"side": float(side), "s0": float(s0), "s1": float(s1), "taper": tp, "width": w, "kind": kind}
        road.bays.append(bay)                   # provvisoria: serve a bay_ext per il contorno
        ss, pts = self.outline(road, s0, s1, tp, 6.0)
        ok = (self.clear(road, ss, pts, 14.0 if extra is None else extra) and self.dry_rural(pts)
              and self.earthwork(road, s0, s1, side, w) <= max_earth)
        if not ok:
            road.bays.pop()
            return None
        k = int(road.idx(s_c))
        c = road.P[k] + road.nor[k] * side * (road.half_paved + w / 2)
        bay["pos"] = [round(float(c[0]), 1), round(float(c[1]), 1)]
        return bay

    # ------------------------------------------------------------ piazzole
    def emergency(self, rid):
        road = self.net.roads.get(rid)
        if road is None:
            return []
        out = []
        cfg = EMERGENCY
        # lato -1 (destra nel verso delle s crescenti) e +1 (carreggiata opposta), sfalsate
        for side, first in ((-1.0, 0.4), (1.0, 0.9)):
            for s_c in np.arange(first * cfg["spacing"], road.length - 200.0, cfg["spacing"]):
                for shift in (0.0, 80.0, -80.0, 160.0, -160.0, 240.0, -240.0):
                    b = self.accept(road, s_c + shift, side, cfg, "emergenza", 6.0)
                    if b:
                        out.append(b)
                        break
        return out

    def viewpoints(self):
        cfg = VIEW
        cand = []
        for rid, road in self.net.roads.items():
            if road.kind not in VIEW_KINDS or rid in NO_VIEW or road.dual:
                continue
            th = np.unwrap(np.arctan2(road.tan[:, 1], road.tan[:, 0]))
            for s_c in np.arange(150.0, road.length - 150.0, 20.0):
                ka, k, kb = road.idx(np.array([s_c - 40.0, s_c, s_c + 40.0]))
                if abs(th[kb] - th[ka]) > np.radians(30):
                    continue
                if road.structure_mask(np.array([s_c - 60.0, s_c, s_c + 60.0]), "bridge").any():
                    continue
                z = road.z[k]
                view = {}
                for side in (1.0, -1.0):
                    d = road.half_core + np.array([40.0, 70.0, 100.0, 140.0, 190.0, 250.0])
                    Q = road.P[k][None, :] + road.nor[k][None, :] * side * d[:, None]
                    view[side] = float(z - self.g.sample(self.h0, Q[:, 0], Q[:, 1]).min())
                    if not self.dry_rural(Q[2:]):           # lago in vista (o paese): conta come panorama
                        view[side] += 80.0 if self.wet_any(Q[2:]) else -1e9
                vs = max(view, key=view.get)
                if view[vs] < cfg["min_view"]:
                    continue
                best = min((self.earthwork(road, s_c - cfg["length"] / 2, s_c + cfg["length"] / 2, ps, cfg["width"]), ps)
                           for ps in (1.0, -1.0))
                if best[0] > cfg["max_earth"]:
                    continue
                cand.append((view[vs] - 12.0 * best[0], rid, float(s_c), best[1], vs, view[vs], best[0]))
        cand.sort(reverse=True)
        out, per_road = [], {}
        for score, rid, s_c, ps, vs, view, earth in cand:
            if len(out) >= cfg["max_total"]:
                break
            if per_road.get(rid, 0) >= cfg["per_road"]:
                continue
            road = self.net.roads[rid]
            k = int(road.idx(s_c))
            if any(np.hypot(*(road.P[k] - np.asarray(b["pos"]))) < cfg["min_gap"] for b in out):
                continue
            b = self.accept(road, s_c, ps, cfg, "panoramica", cfg["max_earth"])
            if b:
                b.update(rid=rid, view_side=vs, view_m=round(view), earth_m=round(earth, 1))
                out.append(b)
                per_road[rid] = per_road.get(rid, 0) + 1
        return out


def plan(net, h0, flats, wet) -> dict:
    """Sceglie le piazzole e le registra in `road.bays`. Restituisce il resoconto."""
    pl = Planner(net, h0, flats, wet)
    em = pl.emergency("A1")
    vw = pl.viewpoints()
    return {"emergenza": len(em), "panoramiche": len(vw),
            "elenco_emergenza": [[b["pos"][0], b["pos"][1], int(b["side"])] for b in em],
            "elenco_panoramiche": [{"strada": b["rid"], "pos": b["pos"], "vista_m": b["view_m"],
                                    "scavo_riporto_m": b["earth_m"]} for b in vw]}
