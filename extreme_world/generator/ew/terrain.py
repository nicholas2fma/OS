"""Sintesi del rilievo: dal piano geografico (config/landforms.json) a una heightmap in metri.

Fasi a risoluzione "macro" (default 2048, 4 m/vertice):
  1. rilievo regionale interpolato dai punti di controllo
  2. altopiani e calanchi
  3. montagne nominate (picchi con pareti, creste, cratere) e catena di The Wall
  4. rilievo secondario con rumore ridged (molte montagne minori)
  5. valli progettate (servono anche come corridoi stradali)
  6. erosione idraulica + termica, con pareti rocciose protette
  7. bancate rocciose (stratificazione) sulle pareti principali
Fasi a risoluzione piena (4096, 2 m/vertice): dettaglio, canyon, laghi, fiumi (water.py).
"""

from __future__ import annotations

import time

import numpy as np
from scipy import ndimage
from scipy.interpolate import RBFInterpolator

from . import erosion
from .geom import Grid, PolylineField, catmull_rom, polygon_mask, signed_distance, smooth_max, smooth_min, smoothstep
from .noise import Noise


def log(msg: str) -> None:
    print(f"[terreno] {msg}", flush=True)


def interp_attr(values, frac_index):
    """Interpola un attributo definito sui punti di controllo con l'indice frazionario."""
    values = np.asarray(values, dtype=np.float64)
    return np.interp(frac_index, np.arange(len(values)), values)


class PolyFeature:
    """Polilinea liscia con attributi interpolati lungo l'ascissa curvilinea."""

    def __init__(self, line, spacing=4.0):
        P, t = catmull_rom(line, spacing=spacing)
        self.P = P
        self.t = t
        self.field = PolylineField(P)

    def attr(self, values, s):
        """Valore dell'attributo all'ascissa s (attributi definiti sui punti di controllo)."""
        frac = np.interp(s, self.field.s, self.t)
        return interp_attr(values, frac)


class TerrainBuilder:
    def __init__(self, world: dict, landforms: dict):
        self.world = world
        self.lf = landforms
        self.tcfg = world["terrain"]
        self.noise = Noise(world["seed"])
        self.terrain_size = self.tcfg["size"]
        self.square = self.tcfg["square_size"]

    # ------------------------------------------------------------------ base
    def _control_points(self):
        """Punti di controllo espliciti + punti automatici lungo valli e laghi, così il rilievo
        regionale forma già le depressioni e le valli non diventano trincee."""
        auto = []
        feats = []
        for v in self.lf.get("valleys", []):
            feat = PolyFeature(v["line"], spacing=10.0)
            feats.append((feat, v))
            L = feat.field.length
            for s in np.arange(0.0, L + 1.0, 300.0):
                x, y = feat.field.point_at(s)
                auto.append([float(x), float(y), float(feat.attr(v["floor"], s)) + 25.0])
        for lk in self.lf.get("lakes", []):
            if "center" in lk:
                cx, cy = lk["center"]
                auto.append([cx, cy, lk["level"] + 5.0])
        # i punti automatici (valli, laghi) hanno la precedenza: un punto esplicito troppo
        # vicino a una valle la trasformerebbe in una trincea
        out = list(auto)
        for p in self.lf["base_control_points"]:
            near_valley = False
            for feat, v in feats:
                d, s, _ = feat.field.query(np.array([p[0]]), np.array([p[1]]))
                floor = feat.attr(v["floor"], s)[0]
                if d[0] < feat.attr(v["width"], s)[0] / 2.0 + 380.0 and p[2] > floor + 60.0:
                    near_valley = True
                    break
            if not near_valley and all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > 200.0 ** 2 for q in auto):
                out.append(list(p))
        return np.asarray(out, dtype=np.float64)

    def _base(self, g: Grid, X, Y):
        pts = self._control_points()
        rbf = RBFInterpolator(pts[:, :2], pts[:, 2], kernel="thin_plate_spline", smoothing=8.0)
        coarse = 257
        cg = Grid.for_world(self.terrain_size, self.square, size=coarse)
        cx, cy = cg.mesh()
        hc = rbf(np.column_stack([cx.ravel(), cy.ravel()])).reshape(coarse, coarse)
        h = ndimage.zoom(hc, g.size / coarse, order=3)[: g.size, : g.size]
        h = np.maximum(h, 115.0)
        n = self.noise
        h += 26.0 * n.fbm(X, Y, 1900.0, octaves=4, salt=1)
        h += 9.0 * n.fbm(X, Y, 520.0, octaves=4, salt=2)
        return h.astype(np.float64)

    def _plateaus(self, g: Grid, X, Y, h):
        n = self.noise
        for p in self.lf.get("plateaus", []):
            mask = polygon_mask(g, p["poly"])
            sd = signed_distance(mask, g.step)
            w = smoothstep(p["falloff"], -p["falloff"] * 0.3, sd)
            ys = np.asarray(p["poly"])[:, 1]
            tilt = smoothstep(ys.min(), ys.max(), Y)
            surf = p["slope_to"] + (p["height"] - p["slope_to"]) * tilt
            surf = surf + p["roughness"] * n.fbm(X, Y, 700.0, octaves=5, salt=11)
            h[:] = h * (1 - w) + np.maximum(h, surf) * w
        return h

    def _badlands(self, g: Grid, X, Y, h):
        b = self.lf.get("badlands")
        if not b:
            return h
        n = self.noise
        mask = polygon_mask(g, b["poly"])
        sd = signed_distance(mask, g.step)
        w = smoothstep(b["falloff"], -b["falloff"], sd)
        wx, wy = n.warp(X, Y, 900.0, 300.0, salt=31)
        # due scale di calanchi che si alternano, più mesas stratificate
        scale_mix = smoothstep(-0.3, 0.3, n.fbm(X, Y, 1600.0, octaves=2, salt=34))
        r1 = n.ridged(wx, wy, b["wavelength"], octaves=6, sharpness=2.4, salt=32)
        r2 = n.ridged(wx, wy, b["wavelength"] * 0.55, octaves=6, sharpness=2.0, salt=35)
        r = r1 * (1 - scale_mix) + r2 * scale_mix
        gullies = n.ridged(wx, wy, b["wavelength"] * 0.22, octaves=4, sharpness=3.0, salt=33)
        relief = b["relief"] * (r ** 1.3) + 0.22 * b["relief"] * gullies * r
        relief *= 0.6 + 0.6 * smoothstep(-0.4, 0.5, n.fbm(X, Y, 1100.0, octaves=3, salt=36))
        step = 34.0
        q = relief / step
        mesa = (np.floor(q) + smoothstep(0.25, 0.75, q - np.floor(q))) * step
        relief = relief * 0.55 + mesa * 0.45
        h += w * relief
        return h

    def _hills(self, g: Grid, X, Y, base, warpx, warpy, valley_prox):
        """Colline e rilievi minori tra le valli (assenti in pianura e sui fondovalle)."""
        n = self.noise
        amp = 18.0 + 210.0 * smoothstep(175.0, 460.0, base) * (1.0 - smoothstep(800.0, 1100.0, base))
        amp *= 1.0 - 0.85 * valley_prox
        f = n.fbm(warpx, warpy, 950.0, octaves=6, salt=21)
        r = n.ridged(warpx, warpy, 720.0, octaves=6, sharpness=1.8, salt=22)
        return amp * (0.55 * f + 0.45 * (r - 0.38))

    def _valley_proximity(self, X, Y):
        prox = np.zeros_like(X)
        for v in self.lf.get("valleys", []):
            feat = PolyFeature(v["line"], spacing=8.0)
            d, s, _ = feat.field.query(X, Y)
            width = feat.attr(v["width"], s)
            excess = np.maximum(d - width / 2.0, 0.0)
            prox = np.maximum(prox, np.exp(-(excess / 320.0) ** 2))
        for lk in self.lf.get("lakes", []):
            if "center" in lk:
                cx, cy = lk["center"]
                a = max(lk["axes"])
                d = np.hypot(X - cx, Y - cy)
                prox = np.maximum(prox, np.exp(-(np.maximum(d - a, 0) / 350.0) ** 2))
        return prox

    # ------------------------------------------------------------- montagne
    def _peak(self, g: Grid, X, Y, base, pk, warpx, warpy):
        px, py = pk["pos"]
        base_at = float(g.sample(base, px, py))
        rel = pk["height"] - base_at
        dx = warpx - px
        dy = warpy - py
        r = np.hypot(dx, dy)
        theta = np.arctan2(dy, dx)
        R = np.full_like(r, float(pk["radius"]))
        if "face_dir_deg" in pk:
            fd = np.deg2rad(pk["face_dir_deg"])
            half = np.deg2rad(pk["face_width_deg"]) / 2.0
            ang = np.abs((theta - fd + np.pi) % (2 * np.pi) - np.pi)
            wface = smoothstep(half, half * 0.45, ang)
            R = R * (1 - wface) + pk["face_radius"] * wface
        t = np.clip(r / R, 0.0, 1.0)
        prof = pk.get("profile", 1.4)
        if pk.get("smooth"):
            f = 0.5 * (1 + np.cos(np.pi * t))
            f = f ** prof
        else:
            f = (1.0 - t) ** prof
        c = rel * f
        crater = pk.get("crater")
        if crater:
            n = self.noise
            # bordo irregolare: raggio e quota del bordo variano con l'angolo
            ang_noise = n.fbm(np.cos(theta) * 900.0 + px, np.sin(theta) * 900.0 + py, 700.0, octaves=3, salt=42)
            rr = crater["rim_radius"] * (1.0 + 0.22 * ang_noise)
            fr = crater["floor_radius"] * (1.0 + 0.25 * ang_noise)
            rim = (pk["height"] - base_at) * (1.0 + 0.06 * n.fbm(np.cos(theta) * 700.0, np.sin(theta) * 700.0, 500.0, octaves=3, salt=43))
            breach_dir = np.deg2rad(crater.get("breach_dir_deg", -40.0))
            bang = np.abs((theta - breach_dir + np.pi) % (2 * np.pi) - np.pi)
            rim = rim - crater.get("breach_depth", 120.0) * smoothstep(0.45, 0.0, bang)
            tout = np.clip((r - rr) / (pk["radius"] - rr), 0.0, 1.0)
            outer = rim * (1.0 - tout) ** prof
            fl = crater["floor_height"] - base_at + 18.0 * n.fbm(X, Y, 120.0, octaves=3, salt=44)
            tin = smoothstep(fr, rr, r)
            inner = fl + (rim - fl) * tin ** 2.2
            c = np.where(r < rr, inner, outer)
            # canaloni radiali sul fianco esterno
            ng = crater["gullies"]
            jitter = 0.9 * self.noise.fbm(X, Y, 500.0, octaves=3, salt=41)
            gpat = np.maximum(0.0, np.cos(ng * theta + jitter * 3.0)) ** 6
            fade = smoothstep(rr, rr + 120, r) * (1 - smoothstep(pk["radius"] * 0.6, pk["radius"], r))
            c = c - crater["gully_depth"] * gpat * fade
        for rd in pk.get("ridges", []):
            c = smooth_max(c, self._ridge_arm(g, warpx, warpy, base, (px, py), pk["height"], rd), 40.0)
        return c

    def _ridge_arm(self, g, X, Y, base, start, start_h, rd):
        ex, ey = rd["to"]
        feat = PolyFeature([start, [(start[0] + ex) / 2 + 0.08 * (ey - start[1]), (start[1] + ey) / 2 - 0.08 * (ex - start[0])], [ex, ey]], spacing=6.0)
        d, s, _ = feat.field.query(X, Y)
        L = feat.field.length
        u = np.clip(s / L, 0.0, 1.0)
        crest = start_h + (rd["height"] - start_h) * (u ** 0.8)
        bx, by = feat.field.point_at(s)
        base_here = g.sample(base, bx, by)
        rel = np.maximum(crest - base_here, 0.0)
        tw = np.clip(d / rd["width"], 0.0, 1.0)
        end_fade = 1.0 - smoothstep(0.82, 1.0, u) * 0.35
        return rel * (1.0 - tw) ** 1.35 * end_fade

    def _ridge_massif(self, g: Grid, X, Y, base, rg, warpx, warpy):
        n = self.noise
        feat = PolyFeature(rg["line"], spacing=6.0)
        d, s, off = feat.field.query(warpx, warpy)
        L = feat.field.length
        # cresta frastagliata: cime e selle lungo la linea
        crest = feat.attr(rg["heights"], s) + 70.0 * n.fbm(s, np.zeros_like(s) + 3.0, 420.0, octaves=4, salt=45)
        bx, by = feat.field.point_at(s)
        base_here = g.sample(base, bx, by)
        rel = np.maximum(crest - base_here, 0.0)
        steep_right = rg.get("steep_side", "right") == "right"
        on_steep = (off < 0) if steep_right else (off > 0)
        sf = rg["steep_factor"] * (1.0 + 0.35 * n.fbm(s, np.zeros_like(s) - 7.0, 650.0, octaves=3, salt=46))
        deff = np.where(on_steep, d * sf, d)
        t = np.clip(deff / rg["width"], 0.0, 1.0)
        c = rel * (1.0 - t) ** rg.get("profile", 1.4)
        # le estremità si abbassano con naturalezza
        taper = smoothstep(0.0, 380.0, s) * smoothstep(0.0, 380.0, L - s)
        c *= 0.35 + 0.65 * taper
        return c, on_steep & (deff < rg["width"]), d, off

    # ---------------------------------------------------------------- valli
    def _valleys(self, X, Y, h):
        n = self.noise
        # asse leggermente sinuoso e versanti irregolari: niente canali rettilinei
        wx, wy = n.warp(X, Y, 650.0, 45.0, salt=24)
        for i, v in enumerate(self.lf.get("valleys", [])):
            feat = PolyFeature(v["line"], spacing=4.0)
            d, s, off = feat.field.query(wx, wy)
            floor = feat.attr(v["floor"], s)
            width = feat.attr(v["width"], s) * (1.0 + 0.35 * n.fbm(s, np.full_like(s, 9.0 + i), 500.0, octaves=3, salt=25))
            # versanti asimmetrici e variabili (uno più ripido dell'altro)
            side = v["side_slope"] * (1.0 + 0.45 * n.fbm(X, Y, 420.0, octaves=3, salt=26 + i)) * np.where(off > 0, 1.15, 0.85)
            excess = np.maximum(d - width / 2.0, 0.0)
            target = floor + side * excess + excess ** 2 / 380.0
            h[:] = smooth_min(h, target, 26.0)
        return h

    def _fix_peaks(self, g: Grid, h):
        """Riporta ogni cima nominata alla quota di progetto con una correzione morbida."""
        X, Y = g.mesh()
        for pk in self.lf.get("peaks", []):
            if pk.get("crater"):
                continue
            px, py = pk["pos"]
            win = g.window(px - 90, py - 90, px + 90, py + 90)
            cur = float(h[win].max())
            delta = pk["height"] - cur
            sigma = min(pk["radius"] * 0.3, 260.0)
            r2 = (X - px) ** 2 + (Y - py) ** 2
            h += delta * np.exp(-r2 / (2 * sigma ** 2))
        return h

    # ------------------------------------------------------------- pipeline
    def build_macro(self, res: int | None = None) -> dict:
        res = res or self.tcfg["macro_size"]
        g = Grid.for_world(self.terrain_size, self.square, size=res)
        X, Y = g.mesh()
        n = self.noise
        t0 = time.time()
        base = self._base(g, X, Y)
        h = base.copy()
        h = self._plateaus(g, X, Y, h)
        h = self._badlands(g, X, Y, h)
        log(f"base regionale ({time.time() - t0:.1f}s)")

        warpx, warpy = n.warp(X, Y, 1400.0, 170.0, salt=51)
        contrib = np.zeros_like(h)
        cliff = np.zeros_like(h)
        peak_mask = np.zeros_like(h)
        for pk in self.lf.get("peaks", []):
            c = self._peak(g, X, Y, base, pk, warpx, warpy)
            contrib = smooth_max(contrib, c, 50.0)
            cb = pk.get("cliff_bands")
            if cb:
                px, py = pk["pos"]
                r = np.hypot(warpx - px, warpy - py)
                theta = np.arctan2(warpy - py, warpx - px)
                fd = np.deg2rad(pk["face_dir_deg"])
                half = np.deg2rad(pk["face_width_deg"]) / 2.0
                ang = np.abs((theta - fd + np.pi) % (2 * np.pi) - np.pi)
                m = smoothstep(half * 1.1, half * 0.6, ang) * smoothstep(cb["inner"] * 0.5, cb["inner"], r) \
                    * (1 - smoothstep(cb["outer"] * 0.85, cb["outer"], r))
                cliff = np.maximum(cliff, m)
            peak_mask = np.maximum(peak_mask, smoothstep(pk["radius"], pk["radius"] * 0.3,
                                                         np.hypot(X - pk["pos"][0], Y - pk["pos"][1])))
        for rg in self.lf.get("ridges", []):
            c, steep, d, off = self._ridge_massif(g, X, Y, base, rg, warpx, warpy)
            contrib = smooth_max(contrib, c, 50.0)
            cb = rg.get("cliff_bands")
            if cb:
                m = steep * (1 - smoothstep(cb["width"] * 0.6, cb["width"], d)) * smoothstep(15.0, 90.0, d)
                cliff = np.maximum(cliff, ndimage.gaussian_filter(m.astype(np.float64), 6.0))
        log(f"montagne nominate ({time.time() - t0:.1f}s)")

        # rilievo secondario: tante montagne minori nella fascia alpina e sulle pendici
        valley_prox = self._valley_proximity(X, Y)
        alpine = smoothstep(650.0, 1050.0, base) * (1 - 0.55 * peak_mask) * (1 - 0.7 * valley_prox)
        rid = n.ridged(warpx, warpy, 1150.0, octaves=7, sharpness=2.2, salt=61)
        secondary = alpine * (rid - 0.32) * 520.0
        # modulazione delle montagne nominate: creste secondarie e canaloni
        rid2 = n.ridged(warpx * 1.0, warpy * 1.0, 520.0, octaves=6, sharpness=2.0, salt=62)
        mod = 1.0 + 0.30 * (rid2 - 0.45)
        hills = self._hills(g, X, Y, base, warpx, warpy, valley_prox) * (1 - smoothstep(0.0, 300.0, contrib))
        h = h + np.maximum(contrib * mod, 0.0) + secondary + hills
        mountain = np.clip(np.maximum(contrib / 400.0, alpine), 0.0, 1.0)
        log(f"rilievo secondario e colline ({time.time() - t0:.1f}s)")

        h = self._valleys(X, Y, h)
        log(f"valli progettate ({time.time() - t0:.1f}s)")
        # pareti a chiazze: le bancate non coprono uniformemente tutta la parete
        patch = smoothstep(-0.25, 0.25, n.fbm(X, Y, 380.0, octaves=3, salt=73))
        cliff = cliff * (0.45 + 0.55 * patch)

        hardness = (0.15 + 0.35 * mountain + 0.5 * cliff).clip(0, 0.97)
        # bordo della griglia non erodibile: altrimenti diventa un pozzo senza fondo
        border = 10
        hardness[:border, :] = 1.0
        hardness[-border:, :] = 1.0
        hardness[:, :border] = 1.0
        hardness[:, -border:] = 1.0
        hh = h.astype(np.float64).copy()
        drops = int(self.tcfg["erosion_drops"] * (res / 2048.0) ** 2)
        erosion.hydraulic_erosion(hh, hardness, drops, int(self.world["seed"]) % 100000, g.step)
        log(f"erosione idraulica: {drops} gocce ({time.time() - t0:.1f}s)")
        erosion.thermal_erosion(hh, np.tan(np.deg2rad(36.0)), hardness, int(self.tcfg["thermal_iterations"]), g.step)
        log(f"erosione termica ({time.time() - t0:.1f}s)")
        # l'erosione modella, non scava voragini: profondità massima per cella
        hh = np.maximum(hh, h - 80.0)
        # ai bordi della griglia le gocce escono senza depositare: si riprende il rilievo
        # non eroso in una fascia sottile per evitare buche artificiali
        idx = np.arange(res)
        edge = np.minimum.outer(np.minimum(idx, res - 1 - idx), np.minimum(idx, res - 1 - idx))
        wedge = smoothstep(2.0, 14.0, edge.astype(np.float64))
        hh = h * (1 - wedge) + hh * wedge

        # bancate rocciose: gradoni verticali sulle pareti di The Giant e The Wall.
        # Spessore degli strati e quota di partenza variano nello spazio, così le fasce
        # non diventano linee parallele chilometriche.
        step = 58.0 + 22.0 * n.fbm(X, Y, 700.0, octaves=3, salt=71)
        offs = 40.0 * n.fbm(X, Y, 340.0, octaves=4, salt=72)
        q = (hh + offs) / step
        fl = np.floor(q)
        fr = q - fl
        k = 8.0 + 4.0 * n.fbm(X, Y, 500.0, octaves=2, salt=74)
        sig = 1.0 / (1.0 + np.exp(-k * (fr - 0.5)))
        s0, s1 = 1.0 / (1.0 + np.exp(k / 2)), 1.0 / (1.0 + np.exp(-k / 2))
        terr = (fl + (sig - s0) / (s1 - s0)) * step - offs
        cl = ndimage.gaussian_filter(cliff, 2.0)
        hh = hh * (1 - 0.8 * cl) + terr * 0.8 * cl
        log(f"bancate rocciose ({time.time() - t0:.1f}s)")

        # piccole conche (doline) sugli altopiani e sui pascoli d'alta quota
        dol = n.fbm(X, Y, 160.0, octaves=2, salt=81)
        conche = np.clip(dol - 0.45, 0.0, None) * 14.0 * smoothstep(500.0, 700.0, hh) * (1 - mountain)
        hh -= conche

        hh = self._fix_peaks(g, hh)
        # nessuna cima secondaria supera The Giant e tutto resta sotto maxHeight
        giant = next((p for p in self.lf["peaks"] if p["name"] == "The Giant"), None)
        if giant:
            gmask = smoothstep(900.0, 300.0, np.hypot(X - giant["pos"][0], Y - giant["pos"][1]))
            cap = 1560.0 + (giant["height"] + 5.0 - 1560.0) * gmask
            hh = np.where(hh > cap - 60.0, smooth_min(hh, cap, 60.0), hh)
        hh = np.minimum(hh, self.tcfg["max_height"] - 20.0)
        log(f"quote delle cime corrette ({time.time() - t0:.1f}s)")

        return {"grid": g, "h": hh, "base": base, "cliff": cliff, "mountain": mountain, "hardness": hardness}

    def refine(self, macro: dict) -> dict:
        """Porta il rilievo alla risoluzione piena e aggiunge il dettaglio fine."""
        g = Grid.for_world(self.terrain_size, self.square)
        mg = macro["grid"]
        factor = g.size / mg.size
        t0 = time.time()
        h = ndimage.zoom(macro["h"].astype(np.float32), factor, order=3)
        cliff = ndimage.zoom(macro["cliff"].astype(np.float32), factor, order=1)
        mountain = ndimage.zoom(macro["mountain"].astype(np.float32), factor, order=1)
        log(f"ricampionamento a {g.size} ({time.time() - t0:.1f}s)")
        X, Y = g.mesh(np.float32)
        n = self.noise
        gy, gx = np.gradient(h, g.step)
        slope = np.hypot(gx, gy)
        rocky = np.clip(np.maximum(smoothstep(0.55, 1.1, slope), cliff), 0, 1)
        amp_soft = 0.35 + 1.6 * mountain
        h += amp_soft * n.fbm(X, Y, 45.0, octaves=4, salt=91)
        h += rocky * 2.6 * (n.ridged(X, Y, 28.0, octaves=4, sharpness=2.0, salt=92) - 0.35)
        log(f"dettaglio fine ({time.time() - t0:.1f}s)")
        del X, Y
        return {"grid": g, "h": h.astype(np.float32), "cliff": cliff, "mountain": mountain}
