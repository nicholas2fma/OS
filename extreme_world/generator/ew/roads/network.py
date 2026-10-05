"""Rete stradale: tracciati, profili altimetrici, ponti/gallerie e modellazione del terreno.

Principio fisico: in BeamNG la DecalRoad è solo grafica, la superficie su cui girano le
ruote è il terreno. Per questo ogni strada viene "stampata" nella heightmap: piattaforma alla
quota di progetto (con superelevazione in curva e pendenza trasversale), scarpate in scavo e
in riporto raccordate al terreno naturale, nessun gradino agli incroci.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage, sparse
from scipy.sparse.linalg import spsolve

from ..geom import Grid, PolylineField, catmull_rom, resample_polyline
from . import router

DS = 2.0  # passo di campionamento del tracciato (m)

TYPE_RANK = {"highway": 100, "ring": 95, "state": 80, "ramp": 78, "urban": 70, "mountain": 60, "local": 55,
             "narrow": 45, "broken": 40, "gravel": 35, "dirt": 25, "trail": 15, "climb": 10}


def log(msg):
    print(f"[strade] {msg}", flush=True)


@dataclass
class Structure:
    kind: str          # "bridge" | "tunnel"
    s0: float
    s1: float
    reason: str = ""


@dataclass
class Road:
    rid: str
    name: str
    kind: str
    t: dict
    spec: dict
    P: np.ndarray = None
    s: np.ndarray = None
    z: np.ndarray = None
    bank: np.ndarray = None
    ground: np.ndarray = None
    structures: list = field(default_factory=list)
    anchors: list = field(default_factory=list)       # (s, z, motivo)
    zmin: np.ndarray = None
    junctions: list = field(default_factory=list)     # (rid altro, s qui, s altro)
    crossings: list = field(default_factory=list)     # dict con dettagli degli incroci a livelli sfalsati
    river_crossings: list = field(default_factory=list)
    fords: list = field(default_factory=list)

    # ----------------------------------------------------------- geometria
    @property
    def dual(self) -> bool:
        return bool(self.t.get("dual"))

    @property
    def half_paved(self) -> float:
        if self.dual:
            return self.t["carriageway"] + self.t["median"] / 2.0
        return self.spec.get("width", self.t["width"]) / 2.0

    @property
    def half_core(self) -> float:
        return self.half_paved + self.t["verge"]

    @property
    def length(self) -> float:
        return float(self.s[-1])

    @property
    def rank(self) -> int:
        return self.spec.get("rank", TYPE_RANK[self.kind])

    def build_field(self):
        self.field = PolylineField(self.P)
        d = np.gradient(self.P, axis=0)
        self.tan = d / np.maximum(np.linalg.norm(d, axis=1), 1e-9)[:, None]
        self.nor = np.column_stack([-self.tan[:, 1], self.tan[:, 0]])  # sinistra

    def idx(self, s):
        return np.clip(np.rint(np.asarray(s) / DS).astype(np.int64), 0, len(self.s) - 1)

    def z_at(self, s):
        return np.interp(s, self.s, self.z)

    def surface(self, s, off):
        """Quota della superficie stradale alla stazione s e allo scostamento laterale off."""
        z = np.interp(s, self.s, self.z)
        b = np.interp(s, self.s, self.bank)
        crown = self.t.get("crown", 0.0)
        return z + b * off - crown * np.minimum(np.abs(off), self.half_paved)

    def point(self, s):
        return np.column_stack(self.field.point_at(s))

    def structure_mask(self, s, kind):
        m = np.zeros(np.shape(s), dtype=bool)
        for st in self.structures:
            if st.kind == kind:
                m |= (s >= st.s0) & (s <= st.s1)
        return m


# ======================================================================= utilità
def segment_intersections(A: np.ndarray, B: np.ndarray):
    """Intersezioni tra due polilinee: lista di (indice segmento A, t_A, indice segmento B, t_B)."""
    out = []
    a0 = A[:-1]
    a1 = A[1:]
    amin = np.minimum(a0, a1)
    amax = np.maximum(a0, a1)
    for j in range(len(B) - 1):
        b0, b1 = B[j], B[j + 1]
        bmin = np.minimum(b0, b1)
        bmax = np.maximum(b0, b1)
        cand = np.nonzero((amax[:, 0] >= bmin[0]) & (amin[:, 0] <= bmax[0]) &
                          (amax[:, 1] >= bmin[1]) & (amin[:, 1] <= bmax[1]))[0]
        for i in cand:
            p, r = a0[i], a1[i] - a0[i]
            q, sv = b0, b1 - b0
            den = r[0] * sv[1] - r[1] * sv[0]
            if abs(den) < 1e-12:
                continue
            qp = q - p
            t = (qp[0] * sv[1] - qp[1] * sv[0]) / den
            u = (qp[0] * r[1] - qp[1] * r[0]) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                out.append((i, t, j, u))
    return out


def solve_profile(g, weights, lam, anchors_idx, anchors_z, anchor_w=1e6):
    """Minimi quadrati: vicino al terreno (pesi) + seconda derivata piccola + ancoraggi."""
    n = len(g)
    if n < 3:
        return g.copy()
    main = np.asarray(weights, dtype=np.float64).copy()
    rhs = main * g
    for i, z in zip(anchors_idx, anchors_z):
        main[i] += anchor_w
        rhs[i] += anchor_w * z
    D = sparse.diags([np.ones(n - 2), -2 * np.ones(n - 2), np.ones(n - 2)], [0, 1, 2], shape=(n - 2, n))
    A = sparse.diags(main) + lam * (D.T @ D)
    return spsolve(A.tocsc(), rhs)


def clamp_grade(z, ds, gmax, anchors_idx, anchors_z, zmin=None, iterations=4):
    """Impone |pendenza| <= gmax rispettando ancoraggi e quote minime."""
    z = z.copy()
    n = len(z)
    if anchors_idx:
        ai = np.asarray(anchors_idx)
        az = np.asarray(anchors_z)
        pos = np.arange(n)[:, None]
        dist = np.abs(pos - ai[None, :]) * ds
        lower = np.max(az[None, :] - gmax * dist, axis=1)
        upper = np.min(az[None, :] + gmax * dist, axis=1)
    else:
        lower = np.full(n, -np.inf)
        upper = np.full(n, np.inf)
    step = gmax * ds
    fixed = np.zeros(n, dtype=bool)
    for i in anchors_idx:
        fixed[i] = True
    floor = np.full(n, -np.inf) if zmin is None else np.minimum(np.asarray(zmin, dtype=np.float64), upper)
    for _ in range(max(iterations, 3)):
        z = np.maximum(z, floor)
        z = np.clip(z, lower, upper)
        for i, v in zip(anchors_idx, anchors_z):
            z[i] = v
        # le passate propagano il vincolo dagli ancoraggi senza mai spostarli; la quota minima
        # resta un pavimento, così la passata all'indietro alza il tratto che la precede
        for i in range(1, n):
            if not fixed[i]:
                z[i] = max(min(max(z[i], z[i - 1] - step), z[i - 1] + step), floor[i])
        for i in range(n - 2, -1, -1):
            if not fixed[i]:
                z[i] = max(min(max(z[i], z[i + 1] - step), z[i + 1] + step), floor[i])
    return z


def runs(mask):
    """Intervalli [i0, i1] contigui dove mask è vero."""
    m = np.concatenate([[False], mask, [False]])
    d = np.diff(m.astype(np.int8))
    starts = np.nonzero(d == 1)[0]
    ends = np.nonzero(d == -1)[0] - 1
    return list(zip(starts, ends))


# ======================================================================= rete
class RoadNetwork:
    def __init__(self, grid: Grid, h_natural: np.ndarray, road_types: dict, rivers=None, lakes=None, avoid=None,
                 lines=None, dam=None):
        self.lines = lines or {}
        self.dam = dam
        self.grid = grid
        self.h0 = h_natural
        self.types = road_types
        self.rivers = rivers or []
        self.lakes = lakes or {}
        self.roads: dict[str, Road] = {}
        self.order: list[str] = []
        self.avoid = avoid

    def _lake_distance(self, name):
        """Distanza (m) dalla superficie del lago, calcolata una volta sola."""
        if not hasattr(self, "_lake_dist"):
            self._lake_dist = {}
        if name not in self._lake_dist:
            from ..water import lake_mask
            m = lake_mask(self.grid, self.h0, self.lakes[name])
            self._lake_dist[name] = (ndimage.distance_transform_edt(~m) * self.grid.step).astype(np.float32)
        return self._lake_dist[name]

    # ------------------------------------------------------------ tracciato
    def _resolve_point(self, wp, toward=None):
        """Un waypoint è [x, y] oppure {"on": strada, "near": [x, y]} (aggancio a una strada esistente)."""
        if isinstance(wp, dict):
            parent = self.roads[wp["on"]]
            near = wp.get("near", toward)
            d, s, _ = parent.field.query(np.array([near[0]]), np.array([near[1]]))
            p = parent.point(s)[0]
            if "offset" in wp:  # aggancio a una carreggiata (rampe)
                k = parent.idx(s[0])
                p = p + parent.nor[k] * wp["offset"]
            return np.array(p, dtype=np.float64), (wp["on"], float(s[0]), wp)
        return np.array(wp[:2], dtype=np.float64), None

    def _expand_follow(self, wp):
        """{"follow": nome linea, "offset": m, "from": [x,y], "to": [x,y], "step": m} ->
        punti della linea (valle/fiume/canyon) spostata lateralmente (offset > 0 a sinistra)."""
        line = self.lines[wp["follow"]]
        P, _ = catmull_rom(line, spacing=4.0)
        f = PolylineField(P)
        s_a = float(f.query(np.array([wp["from"][0]]), np.array([wp["from"][1]]))[1][0]) if "from" in wp else 0.0
        s_b = float(f.query(np.array([wp["to"][0]]), np.array([wp["to"][1]]))[1][0]) if "to" in wp else f.length
        step = wp.get("step", 50.0)
        n = max(2, int(abs(s_b - s_a) / step) + 1)
        ss = np.linspace(s_a, s_b, n)
        x, y = f.point_at(ss)
        tg = f.tangent_at(ss)
        nor = np.column_stack([-tg[:, 1], tg[:, 0]])
        off = wp.get("offset", 0.0)
        return [np.array([x[i], y[i]]) + nor[i] * off for i in range(n)]

    def _expand_shore(self, wp):
        """{"shore": lago, "offset": m, "from": [x,y], "to": [x,y], "step": m, "reverse": bool} ->
        punti della riva spostata verso terra di `offset` metri, nel tratto tra from e to."""
        from skimage import measure
        from ..water import lake_mask
        lk = self.lakes[wp["shore"]]
        g = self.grid
        m = lake_mask(g, self.h0, lk)
        sy, sx = lk["window"]
        pad = int(wp.get("offset", 20.0) / g.step) + 20
        ys = slice(max(sy.start - pad, 0), min(sy.stop + pad, g.size))
        xs = slice(max(sx.start - pad, 0), min(sx.stop + pad, g.size))
        dist = ndimage.distance_transform_edt(~m[ys, xs]) * g.step
        dist = ndimage.gaussian_filter(dist, 3.0)
        cs = measure.find_contours(dist, wp.get("offset", 20.0))
        sub_m = m[ys, xs]

        def on_land(c):
            ii = np.clip(np.rint(c).astype(int), 0, np.array(sub_m.shape) - 1)
            return 1.0 - sub_m[ii[:, 0], ii[:, 1]].mean()
        # il contorno di riva giusto sta sulla terraferma (non attorno a isole o buchi)
        cs = [c for c in cs if on_land(c) > 0.98] or cs
        c = max(cs, key=len)
        X = g.x0 + (c[:, 1] + xs.start) * g.step
        Y = g.y0 + (c[:, 0] + ys.start) * g.step
        ring = np.column_stack([X, Y])
        ia = int(np.argmin(np.hypot(*(ring - np.asarray(wp["from"])).T)))
        ib = int(np.argmin(np.hypot(*(ring - np.asarray(wp["to"])).T)))
        arc1 = ring[ia:ib + 1] if ib >= ia else np.vstack([ring[ia:], ring[:ib + 1]])
        arc2 = (ring[ib:ia + 1] if ia >= ib else np.vstack([ring[ib:], ring[:ia + 1]]))[::-1]
        if "via" in wp:
            via = np.asarray(wp["via"])
            d1 = np.min(np.hypot(*(arc1 - via).T))
            d2 = np.min(np.hypot(*(arc2 - via).T))
            arc = arc1 if d1 <= d2 else arc2
        else:
            arc = arc1 if len(arc1) <= len(arc2) else arc2
        arc, _, _ = resample_polyline(arc, 4.0)
        arc = ndimage.gaussian_filter1d(arc, 4.0, axis=0, mode="nearest")
        arc, _, _ = resample_polyline(arc, wp.get("step", 30.0))
        return [p for p in arc]

    def _expand_rim(self, wp):
        """{"crater_rim": [cx, cy], "r0", "r1", "from_deg", "to_deg"}: linea di cresta del bordo."""
        cx, cy = wp["crater_rim"]
        a0, a1 = np.deg2rad(wp["from_deg"]), np.deg2rad(wp["to_deg"])
        n = max(8, int(abs(a1 - a0) * wp.get("r1", 600) / 25.0))
        rs = np.linspace(wp.get("r0", 300.0), wp.get("r1", 600.0), 60)
        hs = ndimage.gaussian_filter(self.h0, 4.0)
        pts = []
        for a in np.linspace(a0, a1, n):
            xs = cx + rs * np.cos(a)
            ys = cy + rs * np.sin(a)
            z = self.grid.sample(hs, xs, ys)
            r = rs[int(np.argmax(z))] + wp.get("inset", 0.0)
            pts.append([cx + r * np.cos(a), cy + r * np.sin(a)])
        P = np.array(pts)
        P = ndimage.gaussian_filter1d(P, 1.5, axis=0, mode="nearest")
        return [p for p in P]

    def _expand_curl(self, wp):
        """{"curl": [x, y], "heading_deg", "radius", "lead"}: rettilineo, curva a sinistra di 270°
        e uscita che scavalca il tratto di ingresso (percorso a spirale con autoattraversamento)."""
        x0, y0 = wp["curl"]
        th = np.deg2rad(wp.get("heading_deg", 0.0))
        R = wp.get("radius", 50.0)
        lead = wp.get("lead", 120.0)
        t = np.array([np.cos(th), np.sin(th)])
        n = np.array([-t[1], t[0]])
        A = np.array([x0, y0])
        B = A + t * lead
        C = B + n * R
        pts = [A + t * d for d in np.linspace(0, lead, 6)]
        for a in np.linspace(-np.pi / 2, np.pi, 28)[1:]:
            pts.append(C + R * (np.cos(a) * t + np.sin(a) * n))
        end = pts[-1]
        exit_dir = -n
        for d in np.linspace(0, R + wp.get("tail", 140.0), 8)[1:]:
            pts.append(end + exit_dir * d)
        return pts

    def _expand_contour(self, wp):
        """{"contour": quota, "from": [x,y], "to": [x,y], "smooth": m, "step": m}: segue una curva
        di livello del terreno livellato (strade di mezzacosta e cenge scavate nelle pareti)."""
        from skimage import measure
        g = self.grid
        fx, fy = wp["from"]
        tx, ty = wp["to"]
        pad = wp.get("margin", 500.0)
        win = g.window(min(fx, tx), min(fy, ty), max(fx, tx), max(fy, ty), pad=pad)
        sub = ndimage.gaussian_filter(self.h0[win], wp.get("smooth", 15.0) / g.step)
        best = None
        via = np.asarray(wp["via"]) if "via" in wp else None
        for c in measure.find_contours(sub, wp["contour"]):
            X = g.x0 + (c[:, 1] + win[1].start) * g.step
            Y = g.y0 + (c[:, 0] + win[0].start) * g.step
            ring = np.column_stack([X, Y])
            da = np.hypot(*(ring - np.array([fx, fy])).T)
            db = np.hypot(*(ring - np.array([tx, ty])).T)
            ia, ib = int(np.argmin(da)), int(np.argmin(db))
            closed = np.hypot(*(ring[0] - ring[-1])) < 2 * g.step
            cands = [ring[min(ia, ib):max(ia, ib) + 1] if ia <= ib else ring[ib:ia + 1][::-1]]
            if ia > ib:
                cands = [ring[ib:ia + 1][::-1]]
            if closed:
                other = np.vstack([ring[max(ia, ib):], ring[:min(ia, ib) + 1]])
                cands.append(other if ia > ib else other[::-1])
            for arc in cands:
                score = da.min() + db.min()
                if via is not None:
                    score += np.min(np.hypot(*(arc - via).T))
                if best is None or score < best[0]:
                    if np.hypot(*(arc[0] - np.array([fx, fy]))) > np.hypot(*(arc[-1] - np.array([fx, fy]))):
                        arc = arc[::-1]
                    best = (score, arc)
        if best is None or best[0] > 900:
            raise RuntimeError(f"curva di livello {wp['contour']} non trovata tra {wp['from']} e {wp['to']}")
        arc, _, _ = resample_polyline(best[1], 4.0)
        arc = ndimage.gaussian_filter1d(arc, 3.0, axis=0, mode="nearest")
        arc, _, _ = resample_polyline(arc, wp.get("step", 30.0))
        return [p for p in arc]

    def _expand_dam(self, spec):
        """Punti del coronamento della diga (arco verso monte, 3 m a valle del paramento)."""
        d = self.dam
        a = np.array(d["a"], dtype=np.float64)
        b = np.array(d["b"], dtype=np.float64)
        L = float(np.linalg.norm(b - a))
        t = (b - a) / L
        up = np.array([-t[1], t[0]])
        ext = d.get("ext", 14.0)
        ss = np.linspace(-ext, L + ext, 12)
        arch = 18.0 * (1 - ((ss - L / 2) / (L / 2 + d.get("ext_arch", 40.0))) ** 2)
        pts = [a + t * s_ + up * (ar - 3.0) for s_, ar in zip(ss, arch)]
        spec["_dam_pts"] = (pts[1], pts[-2], d["crest"])
        return pts

    def _centerline(self, spec, t):
        wps = []
        for wp in spec["points"]:
            if isinstance(wp, dict) and "dam_crest" in wp:
                wps.extend([list(p) for p in self._expand_dam(spec)])
            elif isinstance(wp, dict) and "contour" in wp:
                wps.extend([list(p) for p in self._expand_contour(wp)])
            elif isinstance(wp, dict) and "crater_rim" in wp:
                wps.extend([list(p) for p in self._expand_rim(wp)])
            elif isinstance(wp, dict) and "curl" in wp:
                spec["_has_curl"] = True
                wps.extend([list(p) for p in self._expand_curl(wp)])
            elif isinstance(wp, dict) and "shore" in wp:
                wps.extend([list(p) for p in self._expand_shore(wp)])
            elif isinstance(wp, dict) and "follow" in wp:
                wps.extend([list(p) for p in self._expand_follow(wp)])
            else:
                wps.append(wp)
        pts = []
        links = []
        routed = []   # routed[i] = il tratto da i-1 a i va instradato con A*
        mode = spec.get("mode", "spline")
        for i, wp in enumerate(wps):
            is_route = mode == "route" and i > 0
            if isinstance(wp, dict) and "route_to" in wp:
                wp = wp["route_to"]
                is_route = True
            if isinstance(wp, dict) and "switchbacks_to" in wp:
                is_route = wp
                wp = wp["switchbacks_to"]
            toward = None
            if isinstance(wp, dict) and "near" not in wp:
                nb = wps[i + 1] if i + 1 < len(wps) else wps[i - 1]
                if isinstance(nb, dict):
                    nb = nb.get("near", nb.get("route_to", nb.get("switchbacks_to")))
                toward = nb
            p, link = self._resolve_point(wp, toward)
            pts.append(p)
            links.append(link)
            routed.append(is_route)
        pts = np.array(pts)
        pieces = []
        cur = [pts[0]]
        for i in range(1, len(pts)):
            if isinstance(routed[i], dict):
                if len(cur) > 1:
                    pieces.append(catmull_rom(np.array(cur), spacing=DS / 2)[0])
                sw = routed[i]
                seg, nturn = router.switchbacks(self.grid, self.h0, pts[i - 1], pts[i], grade=t["max_grade"] * sw.get("grade", 0.85),
                                                width=sw["width"], min_radius=t["min_radius"],
                                                first_side=1.0 if sw.get("first_side", "left") == "left" else -1.0,
                                                seed=sw.get("seed", len(self.order) + 7),
                                                width_jitter=sw.get("jitter", 0.22))
                log(f"  {spec['id']}: {nturn} tornanti")
                pieces.append(seg)
                cur = [pts[i]]
            elif routed[i]:
                if len(cur) > 1:
                    pieces.append(catmull_rom(np.array(cur), spacing=DS / 2)[0])
                seg = router.route(self.grid, self.h0, pts[i - 1], pts[i],
                                   max_grade=t["max_grade"] * spec.get("route_grade", 0.92),
                                   min_radius=t["min_radius"], cell=spec.get("route_cell", 4.0),
                                   margin=spec.get("route_margin", 450.0), avoid=self.avoid,
                                   w_cross=spec.get("w_cross", 6.0), w_turn=spec.get("w_turn", 3.0),
                                   z_target=spec.get("route_z", 0.0), w_z=spec.get("w_z", 0.0))
                seg = router.chaikin(seg, spec.get("chaikin", 3))
                pieces.append(seg)
                cur = [pts[i]]
            else:
                cur.append(pts[i])
        if len(cur) > 1:
            pieces.append(catmull_rom(np.array(cur), spacing=DS / 2)[0])
        P = pieces[0]
        for pc in pieces[1:]:
            P = np.vstack([P, pc[1:]])
        P, _, _ = resample_polyline(P, DS)
        if any(routed):
            k = 3
            if len(P) > 2 * k + 2:
                Q = P.copy()
                Q[k:-k] = ndimage.uniform_filter1d(P, 2 * k + 1, axis=0)[k:-k]
                P = Q
        P, s, _ = resample_polyline(P, DS)
        return P, s, links

    # -------------------------------------------------------------- profilo
    def _ground_profile(self, road):
        g = self.grid
        P = road.P
        hc = road.half_core
        gc = g.sample(self.h0, P[:, 0], P[:, 1])
        L = P + road.nor * hc
        R = P - road.nor * hc
        gl = g.sample(self.h0, L[:, 0], L[:, 1])
        gr = g.sample(self.h0, R[:, 0], R[:, 1])
        return gc, np.minimum(np.minimum(gl, gr), gc), np.maximum(np.maximum(gl, gr), gc)

    def _junction_anchor(self, road, parent_id, at_end):
        parent = self.roads[parent_id]
        d, sp, off = parent.field.query(road.P[:, 0], road.P[:, 1])
        n = len(road.P)
        order = range(n - 1, -1, -1) if at_end else range(n)
        edge = parent.half_core
        for i in order:
            if d[i] >= edge:
                z = float(parent.surface(sp[i], np.clip(off[i], -parent.half_paved, parent.half_paved)))
                road.anchors.append((float(road.s[i]), z, f"incrocio {parent_id}"))
                road.junctions.append((parent_id, float(road.s[i]), float(sp[i])))
                # anche l'estremo interno resta alla quota della strada principale
                j = n - 1 if at_end else 0
                zj = float(parent.surface(sp[j], np.clip(off[j], -parent.half_paved, parent.half_paved)))
                road.anchors.append((float(road.s[j]), zj, f"asse {parent_id}"))
                return
        log(f"  attenzione: {road.rid} non esce dalla piattaforma di {parent_id}")

    def _crossings(self, road):
        """Incroci con strade già progettate (a raso o sfalsati) e con i fiumi."""
        spec = road.spec
        over = {c if isinstance(c, str) else c["road"]: c for c in spec.get("over", [])}
        at_grade = set(spec.get("at_grade", []))
        zmin = np.full(len(road.s), -np.inf)
        forced = []
        for other_id in list(over.keys()) + list(at_grade):
            other = self.roads[other_id]
            hits = segment_intersections(road.P, other.P)
            for (i, ti, j, tj) in hits:
                s_here = road.s[i] + ti * (road.s[i + 1] - road.s[i])
                s_other = other.s[j] + tj * (other.s[j + 1] - other.s[j])
                ang = abs(np.cross(road.tan[i], other.tan[j]))
                ang = max(ang, 0.35)
                if other_id in over:
                    cfg = over[other_id] if isinstance(over[other_id], dict) else {}
                    clearance = cfg.get("clearance", 7.2 if other.dual else 6.6)
                    z_req = float(other.z_at(s_other)) + clearance
                    half = (other.half_core + 9.0) / ang + 5.0
                    sel = np.abs(road.s - s_here) <= half
                    zmin[sel] = np.maximum(zmin[sel], z_req)
                    road.anchors.append((float(s_here), z_req + cfg.get("extra", 0.0), f"cavalcavia su {other_id}"))
                    forced.append(Structure("bridge", s_here - half, s_here + half, f"cavalcavia su {other_id}"))
                    road.crossings.append({"type": "over", "other": other_id, "s": float(s_here), "s_other": float(s_other)})
                    other.crossings.append({"type": "under", "other": road.rid, "s": float(s_other), "s_other": float(s_here)})
                else:
                    zc = float(other.z_at(s_other))
                    road.anchors.append((float(s_here), zc, f"incrocio a raso {other_id}"))
                    road.junctions.append((other_id, float(s_here), float(s_other)))
        # la strada che scavalca se stessa (ricciolo): il secondo passaggio è un ponte
        for (i, ti, j, tj) in (segment_intersections(road.P, road.P) if spec.get("_has_curl") else []):
            if j <= i + 10:
                continue
            s_a = road.s[i] + ti * DS
            s_b = road.s[j] + tj * DS
            lo, hi = min(s_a, s_b), max(s_a, s_b)
            if hi - lo < 60.0:
                continue
            half = road.half_core + 9.0
            sel = np.abs(road.s - hi) <= half + 6.0
            forced.append(Structure("bridge", hi - half - 6.0, hi + half + 6.0, "sovrappasso del ricciolo"))
            road.crossings.append({"type": "self", "s_low": float(lo), "s_high": float(hi)})
            road._self_cross = getattr(road, "_self_cross", []) + [(float(lo), float(hi))]
        # fiumi
        for rv in self.rivers:
            Pr = rv["P"]
            hits = segment_intersections(road.P, Pr[:, :2])
            for (i, ti, j, tj) in hits:
                s_here = road.s[i] + ti * (road.s[i + 1] - road.s[i])
                zr = Pr[j, 2] + tj * (Pr[j + 1, 2] - Pr[j, 2])
                wr = float(rv["width"][min(j, len(rv["width"]) - 1)])
                tr = Pr[j + 1, :2] - Pr[j, :2]
                tr = tr / max(np.linalg.norm(tr), 1e-9)
                ang = max(abs(np.cross(road.tan[i], tr)), 0.4)
                if road.t.get("bridge_fill", 99) >= 99:
                    # strade sterrate: guado nell'alveo
                    road.fords.append({"s": float(s_here), "z_water": float(zr), "river": rv["name"], "width": wr})
                    road.anchors.append((float(s_here), float(zr) - 0.35, f"guado {rv['name']}"))
                    continue
                half = (wr / 2.0 + 7.0) / ang + 3.0
                z_req = zr + (4.5 if road.rank >= 70 else 3.5)
                sel = np.abs(road.s - s_here) <= half
                zmin[sel] = np.maximum(zmin[sel], z_req)
                forced.append(Structure("bridge", s_here - half, s_here + half, f"ponte su {rv['name']}"))
                road.river_crossings.append({"s": float(s_here), "river": rv["name"], "z_water": float(zr)})
        # strade lungo i laghi: mai sotto il livello dell'acqua, salvo i tratti allagati voluti
        # (automatico per tutti i laghi entro 40 m: una trincea sotto il livello aprirebbe la sponda;
        # banda e franco maggiori per le strade che lo dichiarano esplicitamente)
        explicit = set(spec.get("above_lakes", []))
        for lname in self.lakes:
            lvl = self.lakes[lname]["level"]
            dist = self._lake_distance(lname)
            dl = self.grid.sample(dist, road.P[:, 0], road.P[:, 1])
            band = spec.get("lake_band", 80.0) if lname in explicit else 25.0
            near = dl < band
            if not near.any():
                continue
            zmin[near] = np.maximum(zmin[near], lvl + (spec.get("lake_margin", 1.4) if lname in explicit else 1.0))
        for fl in spec.get("flood", []):
            fa = float(road.field.query(np.array([fl["from"][0]]), np.array([fl["from"][1]]))[1][0])
            fb = float(road.field.query(np.array([fl["to"][0]]), np.array([fl["to"][1]]))[1][0])
            fa, fb = min(fa, fb), max(fa, fb)
            lvl = self.lakes[fl["lake"]]["level"]
            sel = (road.s >= fa) & (road.s <= fb)
            zmin[sel] = -np.inf
            mid = 0.5 * (fa + fb)
            road.anchors.append((mid, lvl - fl.get("depth", 0.35), f"tratto allagato {fl['lake']}"))
            road.fords.append({"s": mid, "z_water": lvl, "lake": fl["lake"], "s0": fa, "s1": fb})
        road.zmin = zmin
        return forced

    def _profile(self, road, forced):
        t = road.t
        gc, glo, ghi = road.ground
        n = len(gc)
        ds = DS
        smooth = road.spec.get("smooth", t["smooth"])
        lam = (smooth / (2 * np.pi * ds)) ** 4
        w = np.ones(n)
        for st in forced:
            w[(road.s >= st.s0) & (road.s <= st.s1)] = 0.02
        # gli ancoraggi vicini (meno di 4 m) vengono fusi
        anchors = sorted(road.anchors, key=lambda a: a[0])
        ai, az = [], []
        for s_a, z_a, _ in anchors:
            i = int(road.idx(s_a))
            if ai and abs(i - ai[-1]) < 4:
                continue
            ai.append(i)
            az.append(z_a)
        z = solve_profile(gc, w, lam, ai, az)
        # ancoraggi fissi incompatibili con la pendenza massima: la pendenza ammessa sale quel
        # tanto che basta, così l'eccesso si distribuisce invece di concentrarsi in un gradino
        gmax = t["max_grade"]
        if len(ai) >= 2:
            pairs = sorted(zip(ai, az))
            need = max(abs(z2 - z1) / max((i2 - i1) * ds, ds) for (i1, z1), (i2, z2) in zip(pairs, pairs[1:]))
            if need > gmax:
                log(f"  attenzione: {road.rid}: ancoraggi richiedono pendenza {need * 100:.1f}% "
                    f"(massima {gmax * 100:.1f}%)")
                gmax = need * 1.04
        z = clamp_grade(z, ds, gmax, ai, az, zmin=road.zmin)
        z = ndimage.gaussian_filter1d(z, max(1.0, 6.0 / ds), mode="nearest")
        z = clamp_grade(z, ds, gmax * 1.02, ai, az, zmin=road.zmin, iterations=2)
        road.z = z

    def _bank(self, road):
        t = road.t
        th = np.unwrap(np.arctan2(road.tan[:, 1], road.tan[:, 0]))
        k = np.gradient(th, DS)
        k = ndimage.gaussian_filter1d(k, 4.0, mode="nearest")
        v = t.get("speed_kmh", 50)
        R = 1.0 / np.maximum(np.abs(k), 1e-6)
        e = np.minimum(t.get("bank_max", 0.0), v * v / (127.0 * R))
        bank = -np.sign(k) * e
        bank = ndimage.gaussian_filter1d(bank, 10.0, mode="nearest")
        taper = np.ones(len(bank))
        for _, s_j, _ in road.junctions:
            taper = np.minimum(taper, np.clip((np.abs(road.s - s_j) - 8.0) / 25.0, 0, 1))
        road.bank = bank * taper

    def _structures(self, road, forced):
        t = road.t
        gc, glo, ghi = road.ground
        z = road.z
        fill = z - glo
        cut = ghi - z
        out = []
        if t["bridge_fill"] < 99:
            # ponte se il vuoto è sotto l'asse; un solo lato più basso (strade di sponda o di
            # mezzacosta) si risolve con riporto e muro di sostegno
            fill_c = z - gc
            need = fill_c > t["bridge_fill"]
            for i0, i1 in runs(need):
                # estende finché il riporto torna modesto
                while i0 > 0 and fill[i0 - 1] > t["bridge_fill"] * 0.45:
                    i0 -= 1
                while i1 < len(z) - 1 and fill[i1 + 1] > t["bridge_fill"] * 0.45:
                    i1 += 1
                if road.s[i1] - road.s[i0] >= 14.0:
                    out.append(Structure("bridge", road.s[i0], road.s[i1], f"viadotto (riporto max {fill[i0:i1 + 1].max():.0f} m)"))
        if t["tunnel_cut"] < 99 and not road.spec.get("no_tunnels"):
            # la galleria si estende finché la copertura minima sulla larghezza (anche sul lato
            # a valle dei versanti) supera la volta di 4 m; oltre, trincea a mezzacosta
            r_tube = (t["carriageway"] + 2.4) / 2.0 if road.dual else road.half_paved + 1.2
            ext = 5.2 + 0.55 * r_tube + 4.0
            cover = glo - z
            for i0, i1 in runs(cut > t["tunnel_cut"]):
                while i0 > 0 and cover[i0 - 1] > ext:
                    i0 -= 1
                while i1 < len(z) - 1 and cover[i1 + 1] > ext:
                    i1 += 1
                if road.s[i1] - road.s[i0] >= 60.0:
                    out.append(Structure("tunnel", road.s[i0], road.s[i1], f"galleria (copertura max {cut[i0:i1 + 1].max():.0f} m)"))
        for st in road.spec.get("force_structures", []):
            if "from" in st:
                sa = float(road.field.query(np.array([st["from"][0]]), np.array([st["from"][1]]))[1][0])
                sb = float(road.field.query(np.array([st["to"][0]]), np.array([st["to"][1]]))[1][0])
                out.append(Structure(st["kind"], min(sa, sb), max(sa, sb), st.get("why", "imposto")))
            else:
                out.append(Structure(st["kind"], st["s0"], st["s1"], st.get("why", "imposto")))
        out += forced
        # unione degli intervalli dello stesso tipo
        merged = []
        for kind in ("bridge", "tunnel"):
            iv = sorted([(st.s0, st.s1, st.reason) for st in out if st.kind == kind])
            for s0, s1, why in iv:
                s0 = max(0.0, s0)
                s1 = min(road.length, s1)
                if merged and merged[-1].kind == kind and s0 <= merged[-1].s1 + 25.0:
                    merged[-1].s1 = max(merged[-1].s1, s1)
                    if why not in merged[-1].reason:
                        merged[-1].reason += "; " + why
                else:
                    merged.append(Structure(kind, s0, s1, why))
        road.structures = merged

    # --------------------------------------------------------------- build
    def add_any(self, spec: dict):
        """Aggiunge una voce di roads.json: strada, rotatoria o svincolo."""
        if spec.get("interchange") == "diamond":
            return [self.add(sp) for sp in self.interchange_specs(spec)]
        if "center" in spec and "radius" in spec:
            return [self.add(self.loop_spec(spec))]
        return [self.add(spec)]

    def add(self, spec: dict):
        kind = spec["type"]
        t = dict(self.types[kind])
        for key in ("max_grade", "smooth", "min_radius", "bridge_fill", "tunnel_cut", "max_fill_width"):
            if key in spec:
                t[key] = spec[key]
        road = Road(spec["id"], spec.get("name", spec["id"]), kind, t, spec)
        P, s, links = self._centerline(spec, t)
        road.P, road.s = P, s
        road.build_field()
        road.ground = self._ground_profile(road)
        for k, link in enumerate(links):
            if link is not None:
                self._junction_anchor(road, link[0], at_end=(k == len(links) - 1))
        if "_dam_pts" in spec:
            pa, pb, crest = spec["_dam_pts"]
            sa = float(road.field.query(np.array([pa[0]]), np.array([pa[1]]))[1][0])
            sb = float(road.field.query(np.array([pb[0]]), np.array([pb[1]]))[1][0])
            for s_k in np.linspace(sa, sb, 6):
                road.anchors.append((float(s_k), crest + 0.15, "coronamento della diga"))
            spec.setdefault("force_structures", []).append({"kind": "bridge", "s0": sa, "s1": sb})
        for a in spec.get("anchors", []):
            s_a = a["s"] if "s" in a else float(road.field.query(np.array([a["at"][0]]), np.array([a["at"][1]]))[1][0])
            road.anchors.append((min(float(s_a), road.length), a["z"], "imposto"))
        forced = self._crossings(road)
        self._profile(road, forced)
        for lo, hi in getattr(road, "_self_cross", []):
            z_lo = float(road.z_at(lo))
            need = z_lo + (7.0 if road.rank < 70 else 7.5)
            if road.z_at(hi) < need:
                road.anchors.append((hi, need, "franco del ricciolo"))
                road.anchors.append((lo, z_lo, "passaggio inferiore del ricciolo"))
                self._profile(road, forced)
        self._bank(road)
        self._structures(road, forced)
        self.roads[road.rid] = road
        self.order.append(road.rid)
        br = sum(st.s1 - st.s0 for st in road.structures if st.kind == "bridge")
        tu = sum(st.s1 - st.s0 for st in road.structures if st.kind == "tunnel")
        grade = np.abs(np.diff(road.z)) / DS
        log(f"{road.rid:<22} {kind:<9} {road.length:7.0f} m  quota {road.z.min():5.0f}-{road.z.max():5.0f}  "
            f"pend.max {grade.max() * 100:4.1f}%  ponti {br:5.0f} m  gallerie {tu:5.0f} m")
        return road

    # ------------------------------------------------------------- svincoli
    def interchange_specs(self, spec: dict) -> list:
        """Svincolo a rombo: la strada `cross` scavalca la strada a carreggiate separate `main`;
        quattro rampe a senso unico collegano ogni carreggiata alla strada trasversale, con
        tratto parallelo iniziale/finale (corsia di decelerazione/accelerazione)."""
        main = self.roads[spec["main"]]
        cross = self.roads[spec["cross"]]
        hits = segment_intersections(main.P, cross.P)
        if not hits:
            raise RuntimeError(f"svincolo {spec['id']}: {spec['cross']} non incrocia {spec['main']}")
        i, ti, j, tj = hits[0]
        sc = main.s[i] + ti * (main.s[i + 1] - main.s[i])
        scr = cross.s[j] + tj * (cross.s[j + 1] - cross.s[j])
        C = main.point(np.array([sc]))[0]
        t = main.tan[i]
        n = main.nor[i]
        u = cross.tan[j]
        if np.dot(u, -n) < 0:
            u = -u                       # u verso il lato destro della strada principale
        L = spec.get("ramp_len", 320.0)
        spread = spec.get("spread", 75.0)
        oc = main.t["median"] / 2.0 + main.t["carriageway"] / 2.0 + 1.6   # corsia esterna
        out_off = main.half_paved + spec.get("ramp_gap", 16.0)

        def on_cross(dist):
            s_q = float(np.clip(scr + dist * (1 if np.dot(cross.tan[j], u) > 0 else -1), 0, cross.length))
            return [float(v) for v in cross.point(np.array([s_q]))[0]]

        pid = spec["id"]
        ramp = {"type": "ramp", "rank": 78}
        if "ramp_grade" in spec:             # rampe in terreno montano (pendenza ammessa maggiore)
            ramp["max_grade"] = spec["ramp_grade"]
        P = lambda v: [float(v[0]), float(v[1])]  # noqa: E731
        z_main = float(main.z_at(sc))

        def zc(E):
            d, s_q, _ = cross.field.query(np.array([E[0]]), np.array([E[1]]))
            return float(cross.z_at(s_q[0]))

        # lunghezza di ogni rampa adeguata al dislivello (pendenza media ~5%), ma con
        # l'innesto fuori da gallerie e viadotti della strada principale
        def room(sign):
            lim = main.length - sc if sign > 0 else sc
            for st in main.structures:
                d = (st.s0 - sc) if sign > 0 else (sc - st.s1)
                if d > 0:
                    lim = min(lim, d)
            return lim - 40.0

        def side(sign):
            """Punto d'innesto sulla trasversale e lunghezze delle due rampe di un lato.
            Se lo spazio lungo la principale non basta per il dislivello, l'innesto sulla
            trasversale si avvicina all'incrocio (dove la quota è più vicina a quella del
            cavalcavia e quindi della principale)."""
            g_ramp = spec.get("ramp_grade", self.types["ramp"]["max_grade"]) - 0.01
            best = None
            for sp in np.arange(spread, 54.0, -10.0):
                E = on_cross(sign * sp)
                want = max(L, abs(zc(E) - z_main) / 0.05 + 260.0)
                Lb = max(260.0, min(want, room(-1)))
                Lf = max(260.0, min(want, room(+1)))
                # dislivello sul tratto fuori dalla piattaforma (dopo la corsia parallela)
                excess = max(abs(zc(E) - float(main.z_at(sc + d))) - g_ramp * (abs(d) - 190.0 + 0.7 * sp)
                             for d in (-Lb, Lf))
                cand = (excess, E, Lb, Lf)
                if best is None or cand[0] < best[0]:
                    best = cand
                if excess <= 1.5:            # stima prudente: il profilo reale ha margine
                    return E, Lb, Lf
            log(f"  attenzione: svincolo {pid}: rampe corte per il dislivello (stima {best[0]:+.1f} m)")
            return best[1], best[2], best[3]

        E_r, L_rb, L_rf = side(1.0)
        E_l, L_lb, L_lf = side(-1.0)

        def at(ds, lat):
            """Punto della strada principale a distanza ds dall'incrocio, scostato di lat
            (positivo a sinistra): le rampe seguono la curvatura del tracciato."""
            s_q = float(np.clip(sc + ds, 0.0, main.length))
            k = int(main.idx(s_q))
            return P(main.point(np.array([s_q]))[0] + main.nor[k] * lat)

        specs = [
            # carreggiata destra (marcia lungo +t): uscita prima dell'incrocio, entrata dopo
            {**ramp, "id": f"{pid}_uscita_d", "name": f"{pid} uscita", "points": [
                {"on": main.rid, "near": at(-L_rb, 0.0), "offset": -oc}, at(-(L_rb - 120), -(oc + 4)),
                at(-(L_rb - 220), -out_off), P(np.array(E_r) - t * 28), {"on": cross.rid, "near": E_r}]},
            {**ramp, "id": f"{pid}_entrata_d", "name": f"{pid} entrata", "points": [
                {"on": cross.rid, "near": E_r}, P(np.array(E_r) + t * 28), at(L_rf - 220, -out_off),
                at(L_rf - 120, -(oc + 4)), {"on": main.rid, "near": at(L_rf, 0.0), "offset": -oc}]},
            # carreggiata sinistra (marcia lungo -t)
            {**ramp, "id": f"{pid}_uscita_s", "name": f"{pid} uscita", "points": [
                {"on": main.rid, "near": at(L_lf, 0.0), "offset": oc}, at(L_lf - 120, oc + 4),
                at(L_lf - 220, out_off), P(np.array(E_l) + t * 28), {"on": cross.rid, "near": E_l}]},
            {**ramp, "id": f"{pid}_entrata_s", "name": f"{pid} entrata", "points": [
                {"on": cross.rid, "near": E_l}, P(np.array(E_l) - t * 28), at(-(L_lb - 220), out_off),
                at(-(L_lb - 120), oc + 4), {"on": main.rid, "near": at(-L_lb, 0.0), "offset": oc}]},
        ]
        return specs

    def loop_spec(self, spec: dict) -> dict:
        """Rotatoria: anello chiuso piano, percorso in senso antiorario (circolazione a destra)."""
        cx, cy = spec["center"]
        r = spec["radius"]
        a0 = np.deg2rad(spec.get("start_deg", -90.0))
        ang = a0 + np.linspace(0, 2 * np.pi, 49)
        pts = [[float(cx + r * np.cos(a)), float(cy + r * np.sin(a))] for a in ang]
        z = spec.get("z", float(self.grid.sample(self.h0, cx, cy)))
        out = {k: v for k, v in spec.items() if k not in ("center", "radius")}
        out["points"] = pts
        out["anchors"] = [{"s": 0.0, "z": z}, {"s": 2 * np.pi * r, "z": z}] + \
                         [{"s": 2 * np.pi * r * k / 8, "z": z} for k in range(1, 8)]
        out["looped"] = True
        out.setdefault("smooth", 30)
        out.setdefault("bridge_fill", 99.0)   # rotatoria su rilevato, mai su ponte
        out.setdefault("max_fill_width", 40.0)
        return out

    # ---------------------------------------------------------------- stamp
    def stamp_all(self, h: np.ndarray):
        """Modella il terreno lungo tutte le strade (dalla classe più bassa alla più alta)."""
        g = self.grid
        core_id = np.full(h.shape, -1, dtype=np.int16)
        verge = np.zeros(h.shape, dtype=bool)
        slope_cut = np.zeros(h.shape, dtype=np.float32)
        slope_fill = np.zeros(h.shape, dtype=np.float32)
        ids = sorted(self.order, key=lambda r: self.roads[r].rank)
        for rid in ids:
            road = self.roads[rid]
            self._stamp(road, h, core_id, verge, slope_cut, slope_fill, self.order.index(rid))
        return {"core_id": core_id, "verge": verge, "cut": slope_cut, "fill": slope_fill}

    def _stamp(self, road, h, core_id, verge_m, slope_cut, slope_fill, index):
        g = self.grid
        t = road.t
        hc = road.half_core
        hp = road.half_paved
        side = max(t["max_fill_width"], 20.0)
        R = hc + side + 2.0
        P = road.P
        win = g.window(P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max(), pad=R + 4)
        sy, sx = win
        X, Y = g.window_mesh(win)
        dbest = np.full(X.shape, np.inf)
        sbest = np.zeros(X.shape)
        obest = np.zeros(X.shape)
        chunk = 160
        for c0 in range(0, len(P) - 1, chunk):
            c1 = min(len(P), c0 + chunk + 1)
            Pc = P[c0:c1]
            if len(Pc) < 2:
                continue
            cw = g.window(Pc[:, 0].min(), Pc[:, 1].min(), Pc[:, 0].max(), Pc[:, 1].max(), pad=R + 2)
            ly = slice(cw[0].start - sy.start, cw[0].stop - sy.start)
            lx = slice(cw[1].start - sx.start, cw[1].stop - sx.start)
            fieldc = PolylineField(Pc)
            d, s, off = fieldc.query(X[ly, lx], Y[ly, lx], max_dist=R)
            s = s + road.s[c0]
            better = d < dbest[ly, lx]
            dbest[ly, lx] = np.where(better, d, dbest[ly, lx])
            sbest[ly, lx] = np.where(better, s, sbest[ly, lx])
            obest[ly, lx] = np.where(better, off, obest[ly, lx])
        near = dbest <= R
        if not near.any():
            return
        sub = h[sy, sx]
        s_ = sbest
        on_bridge = road.structure_mask(s_, "bridge")
        in_tunnel = road.structure_mask(s_, "tunnel")
        # oltre gli estremi della strada niente piattaforma: solo raccordo morbido
        beyond = (s_ <= 0.01) | (s_ >= road.length - 0.01)
        skip = on_bridge | in_tunnel
        # sotto le testate dei ponti il terreno scende di poco: l'impalcato prende il contatto
        lower = np.zeros(X.shape)
        for st in road.structures:
            if st.kind != "bridge":
                continue
            for edge, sign in ((st.s0, 1.0), (st.s1, -1.0)):
                u = (s_ - edge) * sign  # >0 dentro il ponte
                lower = np.maximum(lower, np.where((u > -4.0) & (u <= 0.0), 0.18 * (u + 4.0) / 4.0, 0.0))
        off_c = np.clip(obest, -hc, hc)
        zs = road.surface(s_, off_c) - lower
        core = near & (dbest <= hc) & ~skip & ~beyond
        # piattaforma
        sub[core] = zs[core]
        core_id[sy, sx][core] = index
        verge_m[sy, sx] |= core & (dbest > hp)
        # scarpate
        e = np.maximum(dbest - hc, 0.0)
        side_zone = near & (dbest > hc) & ~skip
        side_zone |= near & beyond & ~skip & (dbest > 0)
        e = np.where(beyond, dbest, e)
        cut_t = zs + e * t["cut"]
        fill_t = zs - e * t["fill"]
        orig = sub.copy()
        above = orig > zs
        new = np.where(above, np.minimum(orig, cut_t), np.maximum(orig, fill_t))
        # riporti troncati oltre max_fill_width (muro di sostegno)
        trunc = (~above) & (e > t["max_fill_width"])
        new = np.where(trunc, orig, new)
        # raccordo morbido agli estremi liberi
        if road.spec.get("open_ends", True):
            fade = np.clip(1.0 - dbest / R, 0.0, 1.0)
            new = np.where(beyond, orig + (new - orig) * fade, new)
        sub[side_zone] = new[side_zone]
        slope_cut[sy, sx][side_zone] = np.maximum(slope_cut[sy, sx][side_zone], np.maximum(orig - new, 0)[side_zone])
        slope_fill[sy, sx][side_zone] = np.maximum(slope_fill[sy, sx][side_zone], np.maximum(new - orig, 0)[side_zone])
