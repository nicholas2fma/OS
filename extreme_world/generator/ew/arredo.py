"""Arredo stradale: cartelli di direzione, segnali autostradali, frecce di curva, segnali di
pericolo, lampioni, muri di sostegno e delineatori.

Tutto è geometria (TSStatic con collisione Visible Mesh Final, gruppi per strada e tratto di
500 m). I testi dei cartelli sono disegnati con PIL (font di sistema in grassetto: DejaVu o Arial)
in atlanti di riquadri; colori secondo le convenzioni italiane: verde autostrada, blu extraurbane, bianco
urbane/locali, marrone per i percorsi speciali. Nessun oggetto luce: solo i corpi illuminanti.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .mesh.collada import Mesh

ART = "art/shapes/ew/arredo"
# font in grassetto di sistema (Linux, macOS, Windows); in mancanza il font predefinito di Pillow
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
         "/Library/Fonts/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
         "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/DejaVuSans-Bold.ttf"]


def _font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size=size)


SLOT_W, SLOT_H = 512, 256                       # riquadro di un pannello nell'atlante (2:1)
COLS, ROWS = 2, 8                               # 16 riquadri per atlante 1024 x 2048

STYLE = {   # sfondo, testo/bordo
    "verde": ((22, 110, 60), (255, 255, 255)),
    "blu": ((24, 70, 150), (255, 255, 255)),
    "bianco": ((242, 242, 238), (20, 20, 20)),
    "marrone": ((120, 70, 36), (255, 255, 255)),
    "pericolo": ((246, 246, 240), (200, 24, 24)),
}


class Atlas:
    """Raccoglie i pannelli da disegnare e assegna a ciascuno un riquadro."""

    def __init__(self):
        self.items = []
        self.cache = {}

    def add(self, style, lines, arrow=0, kind="testo"):
        key = (style, tuple(lines), arrow, kind)          # pannelli identici condividono il riquadro
        if key not in self.cache:
            self.items.append((style, lines, arrow, kind))
            k = len(self.items) - 1
            self.cache[key] = (k // (COLS * ROWS), k % (COLS * ROWS))
        return self.cache[key]

    def uv(self, slot):
        c, r = slot % COLS, slot // COLS
        e = 2.0
        u0, u1 = (c * SLOT_W + e) / (COLS * SLOT_W), ((c + 1) * SLOT_W - e) / (COLS * SLOT_W)
        # riga 0 in alto nell'immagine; in Collada v = 0 in basso (Torque inverte v all'importazione)
        v1 = 1 - (r * SLOT_H + e) / (ROWS * SLOT_H)
        v0 = 1 - ((r + 1) * SLOT_H - e) / (ROWS * SLOT_H)
        return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]

    def _draw(self, style, lines, arrow, kind):
        bg, fg = STYLE[style]
        img = Image.new("RGB", (SLOT_W, SLOT_H), bg)
        d = ImageDraw.Draw(img)
        if kind == "chevron":
            img.paste((200, 24, 24), (0, 0, SLOT_W, SLOT_H))
            for k in range(3):
                x = 120 + k * 120
                pts = [(x, 30), (x + 90, SLOT_H / 2), (x, SLOT_H - 30), (x - 45, SLOT_H - 30), (x + 45, SLOT_H / 2), (x - 45, 30)]
                if arrow < 0:
                    pts = [(SLOT_W - px, py) for px, py in pts]
                d.polygon(pts, fill=(255, 255, 255))
            return img
        d.rectangle([6, 6, SLOT_W - 7, SLOT_H - 7], outline=fg, width=8)
        x_text = 34
        if kind == "pericolo":
            # triangolo a sinistra, testo a destra
            d.polygon([(110, 34), (190, 200), (30, 200)], fill=(255, 255, 255), outline=(200, 24, 24))
            d.line([(110, 34), (190, 200), (30, 200), (110, 34)], fill=(200, 24, 24), width=14)
            d.text((104, 92), "!", font=_font(80), fill=(20, 20, 20))
            fg = (20, 20, 20)
            x_text = 215
        if arrow:
            ax = SLOT_W - 80 if arrow > 0 else 80
            sgn = 1 if arrow > 0 else -1
            d.polygon([(ax + sgn * 55, SLOT_H / 2), (ax - sgn * 5, SLOT_H / 2 - 55), (ax - sgn * 5, SLOT_H / 2 - 22),
                       (ax - sgn * 50, SLOT_H / 2 - 22), (ax - sgn * 50, SLOT_H / 2 + 22), (ax - sgn * 5, SLOT_H / 2 + 22),
                       (ax - sgn * 5, SLOT_H / 2 + 55)], fill=fg)
            if arrow < 0:
                x_text = 165
        width = SLOT_W - x_text - (150 if arrow > 0 else 34)
        n = len(lines)
        for i, text in enumerate(lines):
            size = 64 if n == 1 else 50
            font = _font(size)
            while font.getlength(text) > width and size > 18:
                size -= 2
                font = _font(size)
            y = SLOT_H / 2 + (i - (n - 1) / 2) * (size + 16) - size * 0.6
            d.text((x_text, y), text, font=font, fill=fg)
        return img

    def write(self, level_dir, level_name):
        mats = {}
        out = level_dir / ART
        out.mkdir(parents=True, exist_ok=True)
        per = COLS * ROWS
        for a in range((len(self.items) + per - 1) // per):
            img = Image.new("RGB", (COLS * SLOT_W, ROWS * SLOT_H), (128, 128, 128))
            for k, it in enumerate(self.items[a * per:(a + 1) * per]):
                img.paste(self._draw(*it), ((k % COLS) * SLOT_W, (k // COLS) * SLOT_H))
            p = out / f"ew_cartelli_{a}_b.png"
            img.save(p, optimize=True)
            name = f"ew_cartelli_{a}"
            mats[name] = {"name": name, "mapTo": name, "class": "Material", "version": 1.5,
                          "Stages": [{"baseColorMap": f"/levels/{level_name}/{ART}/{p.name}"}, {}, {}, {}]}
        return mats


class Chunks:
    """Mesh raccolte per (gruppo, strada, tratto di 500 m)."""

    def __init__(self):
        self.m = {}

    def get(self, group, rid, s):
        key = (group, rid, int(s // 500))
        if key not in self.m:
            self.m[key] = Mesh()
        return self.m[key]

    def emit(self, sw):
        tris = 0
        for (group, rid, k), mesh in sorted(self.m.items()):
            if mesh.parts:
                sw.emit(f"arredo_{group}_{rid.lower()}_{k}", mesh, f"MissionGroup/arredo/{group}")
                tris += mesh.triangle_count()
        return tris


def _quad(m, mat, a, b, c, d, uv, normal):
    P = np.array([a, b, c, d], dtype=np.float64)
    gn = np.cross(P[1] - P[0], P[2] - P[0])
    tris = [[0, 1, 2], [0, 2, 3]] if np.dot(gn, normal) >= 0 else [[0, 2, 1], [0, 3, 2]]
    n = np.asarray(normal, dtype=np.float64)
    m.add(mat, P, np.repeat((n / np.linalg.norm(n))[None, :], 4, 0), np.asarray(uv, dtype=np.float64), tris)


def sign_panel(m, atlas_slot, atlas, base, facing, w, hgt, bottom, posts=2, ground=None):
    """Pannello piatto con la faccia stampata rivolta a `facing` (direzione verso chi arriva)."""
    a_idx, slot = atlas_slot
    f = np.array([facing[0], facing[1], 0.0])
    f /= np.linalg.norm(f)
    c = np.array([base[0], base[1], base[2]])
    z0, z1 = bottom, bottom + hgt
    # chi arriva guarda il pannello nella direzione -f: la sua destra è (-f) x z = (-f_y, f_x)
    right = np.array([-f[1], f[0], 0.0])
    p = lambda u, z: c + right * u + np.array([0, 0, z])  # noqa: E731
    _quad(m, f"ew_cartelli_{a_idx}", p(-w / 2, z0) + f * 0.04, p(w / 2, z0) + f * 0.04, p(w / 2, z1) + f * 0.04,
          p(-w / 2, z1) + f * 0.04, atlas.uv(slot), f)
    # retro e spessore in lamiera
    yaw = float(np.arctan2(right[1], right[0]))
    m.add_box("ew_metal", tuple(c + np.array([0, 0, (z0 + z1) / 2])), (w, 0.06, hgt), yaw)
    for k in range(posts):
        u = 0.0 if posts == 1 else (-w / 2 + 0.25 + k * (w - 0.5) / (posts - 1))
        q = c + right * u - f * 0.06
        zg = min(c[2], ground(q[0], q[1])) if ground else c[2]      # piede di ogni palo nel terreno
        bot, top = zg - 0.45, c[2] + z0 + 0.15
        m.add_box("ew_metal", (q[0], q[1], 0.5 * (bot + top)), (0.08, 0.08, top - bot), yaw)


def _bench(m, c, z, look):
    """Panchina in cemento con schienale: chi siede guarda nella direzione `look`."""
    f = np.array([look[0], look[1]]) / np.linalg.norm(look[:2])
    right = np.array([-f[1], f[0]])
    yaw = float(np.arctan2(right[1], right[0]))           # asse x della scatola lungo la seduta
    m.add_box("ew_concrete", (c[0], c[1], z + 0.45), (1.8, 0.45, 0.07), yaw)
    b = c - f * 0.22
    m.add_box("ew_concrete", (b[0], b[1], z + 0.78), (1.8, 0.06, 0.42), yaw)
    for u in (-0.7, 0.7):
        q = c + right * u
        m.add_box("ew_concrete_dark", (q[0], q[1], z + 0.2), (0.12, 0.42, 0.48), yaw)


def _wall(m, C, out, tan, bot, top, thick=0.6, mat="ew_concrete"):
    """Muro continuo lungo la linea C: piede a quota `bot` e sommità a quota `top` stazione per
    stazione (sommità che segue il ciglio del riporto), facce interna, esterna, superiore e
    testate chiuse."""
    top = np.maximum(top, bot + 1.0)
    ci = C - out * (thick / 2)
    co = C + out * (thick / 2)
    P3 = lambda q, z: np.array([q[0], q[1], z])  # noqa: E731
    u = 0.0
    for a in range(len(C) - 1):
        b = a + 1
        L = float(np.hypot(*(C[b] - C[a])))
        uv = lambda h0, h1: [[u / 3, h0 / 3], [(u + L) / 3, h0 / 3], [(u + L) / 3, h1 / 3], [u / 3, h1 / 3]]  # noqa: E731
        n_in = np.array([-(out[a][0] + out[b][0]), -(out[a][1] + out[b][1]), 0.0])
        _quad(m, mat, P3(ci[a], bot[a]), P3(ci[b], bot[b]), P3(ci[b], top[b]), P3(ci[a], top[a]), uv(0, 3), n_in)
        _quad(m, mat, P3(co[a], bot[a]), P3(co[b], bot[b]), P3(co[b], top[b]), P3(co[a], top[a]), uv(0, 3), -n_in)
        _quad(m, mat, P3(ci[a], top[a]), P3(ci[b], top[b]), P3(co[b], top[b]), P3(co[a], top[a]), uv(0, 0.6), [0, 0, 1.0])
        u += L
    for k, sgn in ((0, -1.0), (len(C) - 1, 1.0)):            # testate
        _quad(m, mat, P3(ci[k], bot[k]), P3(co[k], bot[k]), P3(co[k], top[k]), P3(ci[k], top[k]),
              [[0, 0], [0.2, 0], [0.2, 1], [0, 1]], [tan[k][0] * sgn, tan[k][1] * sgn, 0.0])


def _ok_station(road, s, margin=20.0):
    if s < margin or s > road.length - margin:
        return False
    sa = np.array([s - 10, s, s + 10])
    return not (road.structure_mask(sa, "bridge").any() or road.structure_mask(sa, "tunnel").any())


def _ext(road, s, side):
    """Allargamento della piattaforma (piazzole) alla stazione s sul lato `side`."""
    return float(road.bay_ext(np.array([s]), side)[0]) if road.bays else 0.0


def _ground(ctx, x, y):
    return float(ctx["g"].sample(ctx["h"], x, y))


def short_name(road):
    name = road.spec.get("name", road.rid)
    parts = name.split(" ", 1)
    if len(parts) == 2 and parts[0][:2] in ("SP", "SS", "A1", "T1", "U1", "E1", "E2", "F1", "PT"):
        return [parts[0], parts[1]]
    return [name]


def run(ctx: dict) -> dict:
    net = ctx["net"]
    g = ctx["g"]
    sw = ctx["sw"]
    rng = np.random.default_rng(ctx["seed"] + 2727)
    atlas = Atlas()
    ch = Chunks()
    stats = {"cartelli": 0, "segnali_autostrada": 0, "frecce_curva": 0, "pericolo": 0, "lampioni": 0,
             "muri_m": 0.0, "delineatori": 0}
    flats = ctx["landforms"].get("flats", [])

    def in_town(p, extra=1.0):
        return any(np.hypot(*(p - np.asarray(f["center"]))) < f["radius"] * extra for f in flats)

    special = {"E1": "STRADA DISSESTATA", "E2": "SENTIERO FUORISTRADA", "F1": "SALITA ESTREMA",
               "SP5": "STRADA SUL PRECIPIZIO", "SP13": "STRADA DI CRESTA", "PT": "PISTA PROVE BUCHE"}
    core = ctx["road_masks"]["core_id"]
    gfn = lambda x, y: _ground(ctx, x, y)  # noqa: E731
    jst = {rid: [] for rid in net.roads}                 # stazioni degli innesti su ogni strada
    for rid, r in net.roads.items():
        for pid, s_here, s_par in r.junctions:
            jst[rid].append(s_here)
            if pid in jst:
                jst[pid].append(s_par)

    def clear(rid, pos, rad=0.6):
        """Vero se il punto (e un intorno di rad) non è sulla piattaforma di un'altra strada."""
        me = net.order.index(rid)
        for dx, dy in ((0.0, 0.0), (rad, 0.0), (-rad, 0.0), (0.0, rad), (0.0, -rad)):
            ix, iy = g.to_index(pos[0] + dx, pos[1] + dy)
            c = core[int(np.clip(round(float(iy)), 0, core.shape[0] - 1)), int(np.clip(round(float(ix)), 0, core.shape[1] - 1))]
            if c >= 0 and c != me:
                return False
        return True

    def near_junction(rid, s, dist=14.0):
        return any(abs(s - sj) < dist for sj in jst[rid])

    # ------------------------------------------------ cartelli agli innesti
    for rid, r in net.roads.items():
        if r.kind in ("ramp",) or rid.startswith("AS_"):
            continue
        for pid, s_here, s_par in r.junctions:
            if not (s_here < 30 or s_here > r.length - 30):
                continue
            p = net.roads[pid]
            if p.dual or p.kind in ("ramp", "highway") or p.spec.get("looped"):
                continue
            k = int(p.idx(s_par))
            j = r.point(np.array([min(max(s_here + (25 if s_here < 30 else -25), 0), r.length)]))[0]
            dvec = j - p.P[k]
            turn = float(np.sign(p.tan[k][0] * dvec[1] - p.tan[k][1] * dvec[0]))    # +1 sinistra
            style = "marrone" if rid in special else ("bianco" if r.kind in ("urban", "local") and in_town(p.P[k], 1.2)
                                                      else "blu")
            for direction in (1.0, -1.0):
                s = s_par - direction * 70.0
                if not _ok_station(p, s):
                    continue
                kk = int(p.idx(s))
                right = -p.nor[kk] * direction                      # lato destro di chi arriva
                pos = p.P[kk] + right * (p.half_paved + 1.6 + _ext(p, s, -direction))
                if not clear(pid, pos, 1.4):
                    continue
                arrow = int(-turn * direction)                       # freccia a sinistra = -1 per chi arriva
                slot = atlas.add(style, short_name(r), arrow=arrow)
                m = ch.get("cartelli", pid, s)
                sign_panel(m, slot, atlas, (pos[0], pos[1], _ground(ctx, *pos)), -p.tan[kk] * direction, 2.6, 1.3, 1.5,
                           ground=gfn)
                stats["cartelli"] += 1
            if rid in special:
                for direction in (1.0, -1.0):
                    s = s_par - direction * 140.0
                    if not _ok_station(p, s):
                        continue
                    kk = int(p.idx(s))
                    right = -p.nor[kk] * direction
                    pos = p.P[kk] + right * (p.half_paved + 1.6 + _ext(p, s, -direction))
                    if not clear(pid, pos, 1.3):
                        continue
                    slot = atlas.add("pericolo", [special[rid]], kind="pericolo")
                    sign_panel(ch.get("pericolo", pid, s), slot, atlas, (pos[0], pos[1], _ground(ctx, *pos)),
                               -p.tan[kk] * direction, 2.4, 1.2, 1.4, ground=gfn)
                    stats["pericolo"] += 1
    # ------------------------------------------------ autostrada: uscite e area di servizio
    if "A1" in net.roads:
        a1 = net.roads["A1"]
        for rid, r in net.roads.items():
            if not (("_uscita_" in rid) or rid.startswith("AS_")) or "A1" not in [j[0] for j in r.junctions]:
                continue
            d, s0, off = a1.field.query(r.P[:1, 0], r.P[:1, 1])
            s0, off = float(s0[0]), float(off[0])
            direction = -1.0 if off > 0 else 1.0                     # carreggiata sinistra: marcia verso s decrescenti
            if rid.startswith("AS_"):
                text = ["AREA DI SERVIZIO", "Montalba"]
            else:
                cross = [pid for pid, _, _ in r.junctions if pid != "A1"]
                cr = net.roads[cross[0]] if cross else None
                text = ["USCITA", short_name(cr)[-1] if cr else rid]
            for back in (400.0, 60.0):
                s = s0 - direction * back
                if not _ok_station(a1, s, 30.0):
                    continue
                kk = int(a1.idx(s))
                right = -a1.nor[kk] * direction
                pos = a1.P[kk] + right * (a1.half_paved + 2.2 + _ext(a1, s, -direction))
                if not clear("A1", pos, 2.3):
                    continue
                slot = atlas.add("verde", text)
                sign_panel(ch.get("autostrada", "A1", s), slot, atlas, (pos[0], pos[1], _ground(ctx, *pos)),
                           -a1.tan[kk] * direction, 4.4, 2.2, 2.2, ground=gfn)
                stats["segnali_autostrada"] += 1
    # ------------------------------------------------ frecce sui tornanti
    for rid, r in net.roads.items():
        if r.kind not in ("mountain", "narrow", "gravel"):
            continue
        th = np.unwrap(np.arctan2(r.tan[:, 1], r.tan[:, 0]))
        curv = np.gradient(th, r.s)
        tight = np.abs(curv) > 1.0 / 25.0
        idx = np.nonzero(tight)[0]
        if not len(idx):
            continue
        # un gruppo di frecce per ogni curva stretta (apice = curvatura massima del tratto)
        groups = np.split(idx, np.nonzero(np.diff(idx) > 5)[0] + 1)
        for grp in groups:
            if len(grp) < 3 or abs(th[grp[-1]] - th[grp[0]]) < np.radians(70):
                continue
            k = grp[np.argmax(np.abs(curv[grp]))]
            if not _ok_station(r, r.s[k], 15.0):
                continue
            sgn = float(np.sign(curv[k]))                           # +1 curva a sinistra
            for direction in (1.0, -1.0):
                for dk in (-6, 0, 6):
                    kk = int(np.clip(k + dk, 0, len(r.s) - 1))
                    # lato esterno della curva alla stazione del pannello (la normale ruota lungo il tornante)
                    pos = r.P[kk] - r.nor[kk] * sgn * (r.half_paved + 1.4 + _ext(r, r.s[kk], -sgn))
                    if not clear(rid, pos, 0.5):
                        continue
                    arrow = int(-sgn * direction)                    # le frecce indicano il verso della curva
                    slot = atlas.add("pericolo", [""], arrow=arrow, kind="chevron")
                    sign_panel(ch.get("frecce", rid, r.s[kk]), slot, atlas, (pos[0], pos[1], _ground(ctx, *pos)),
                               -r.tan[kk] * direction, 0.9, 0.45, 0.9, posts=1, ground=gfn)
                    stats["frecce_curva"] += 1
                break                                               # frecce leggibili da un senso solo
    # ------------------------------------------------ lampioni nei centri abitati
    for rid, r in net.roads.items():
        if r.kind not in ("urban", "state", "local", "ring") or r.dual and r.kind != "ring":
            continue
        side = 1.0
        for s in np.arange(15.0, r.length - 15.0, 32.0):
            k = int(r.idx(s))
            if not in_town(r.P[k], 1.0 if r.kind != "urban" else 1.4) or not _ok_station(r, s, 15.0):
                continue
            side = -side
            base = r.P[k] + r.nor[k] * side * (r.half_paved + 1.0 + _ext(r, s, side))
            if near_junction(rid, s, r.half_core + 10.0) or not clear(rid, base, 0.6):
                continue
            z = _ground(ctx, *base)
            m = ch.get("lampioni", rid, s)
            m.prism("ew_metal", (base[0], base[1], z - 0.4), 0.09, 8.4, sides=8)
            inward = -r.nor[k] * side
            arm = base + inward * 0.9
            yaw = float(np.arctan2(inward[1], inward[0]))
            m.add_box("ew_metal", (arm[0], arm[1], z + 7.9), (1.8, 0.1, 0.1), yaw)
            head = base + inward * 1.7
            m.add_box("ew_concrete_dark", (head[0], head[1], z + 7.8), (0.7, 0.3, 0.18), yaw)
            stats["lampioni"] += 1
    # ------------------------------------------------ muri di sostegno dove il riporto è troncato
    h = ctx["h"]
    for rid, r in net.roads.items():
        if r.kind in ("trail", "climb", "dirt") or r.t.get("max_fill_width", 99) > 60:
            continue
        W = r.t["max_fill_width"]
        n = len(r.s)
        ground_ok = ~(r.structure_mask(r.s, "bridge") | r.structure_mask(r.s, "tunnel"))
        for side in (1.0, -1.0):
            ext = r.bay_ext(r.s, side)
            lat_in = r.half_core + W - 1.0 + ext
            lat_out = r.half_core + W + 2.5 + ext
            Qi = r.P + r.nor * (side * lat_in)[:, None]
            Qo = r.P + r.nor * (side * lat_out)[:, None]
            zi = g.sample(h, Qi[:, 0], Qi[:, 1])
            zo = g.sample(h, Qo[:, 0], Qo[:, 1])
            drop = zi - zo
            fill = ctx["road_masks"]["fill"]
            fi = g.sample(fill, Qi[:, 0], Qi[:, 1])
            need = ground_ok & (drop > 2.5) & (fi > 1.0)        # solo dove c'è davvero un riporto
            from scipy import ndimage
            need = ndimage.binary_opening(need, iterations=2)
            lab, nl = ndimage.label(need)
            for li in range(1, nl + 1):
                sel = np.nonzero(lab == li)[0]
                if len(sel) < 5:
                    continue
                m = ch.get("muri", rid, r.s[sel[0]])
                _wall(m, r.P[sel] + r.nor[sel] * (side * (lat_in[sel] + 0.8))[:, None], r.nor[sel] * side, r.tan[sel],
                      zo[sel] - 0.8, zi[sel] + 0.5)
                stats["muri_m"] += float(r.s[sel[-1]] - r.s[sel[0]])
    # ------------------------------------------------ delineatori fuori dai centri
    for rid, r in net.roads.items():
        if r.kind not in ("state", "local", "mountain", "narrow"):
            continue
        for s in np.arange(25.0, r.length - 25.0, 50.0):
            k = int(r.idx(s))
            if in_town(r.P[k], 1.05) or not _ok_station(r, s, 10.0) or near_junction(rid, s, r.half_core + 12.0):
                continue
            m = ch.get("delineatori", rid, s)
            for side in (1.0, -1.0):
                q = r.P[k] + r.nor[k] * side * (r.half_paved + 0.8 + _ext(r, s, side))
                if not clear(rid, q, 0.4):
                    continue
                z = _ground(ctx, *q)
                yaw = float(np.arctan2(r.tan[k][1], r.tan[k][0]))
                m.add_box("ew_plaster_white", (q[0], q[1], z + 0.45), (0.1, 0.12, 1.3), yaw)
                m.add_box("ew_concrete_dark", (q[0], q[1], z + 0.95), (0.11, 0.13, 0.2), yaw)
                stats["delineatori"] += 1
    # ------------------------------------------------ piazzole (ew/slarghi.py): cartelli e panchine
    stats["cartelli_piazzole"] = 0
    stats["panchine"] = 0
    for rid, r in net.roads.items():
        for b in r.bays:
            side = b["side"]
            if b["kind"] == "emergenza":
                # la piazzola è a destra di chi la usa: lato -1 = marcia verso le s crescenti
                dirs, style, text = [-side], "blu", ["PIAZZOLA SOS", "150 m"]
            else:
                dirs, style, text = [1.0, -1.0], "marrone", ["PUNTO PANORAMICO", "150 m"]
            for direction in dirs:
                s = (b["s0"] if direction > 0 else b["s1"]) - direction * (150.0 + b["taper"])
                if not _ok_station(r, s, 30.0):
                    continue
                kk = int(r.idx(s))
                pos = r.P[kk] - r.nor[kk] * direction * (r.half_paved + (2.2 if r.dual else 1.6) + _ext(r, s, -direction))
                if not clear(rid, pos, 1.6):
                    continue
                big = r.dual
                sign_panel(ch.get("piazzole", rid, s), atlas.add(style, text), atlas, (pos[0], pos[1], _ground(ctx, *pos)),
                           -r.tan[kk] * direction, 3.2 if big else 2.4, 1.6 if big else 1.2, 1.8 if big else 1.4,
                           ground=gfn)
                stats["cartelli_piazzole"] += 1
            if b["kind"] != "panoramica":
                continue
            s_c = 0.5 * (b["s0"] + b["s1"])
            for ds in (-4.0, 4.0):
                k = int(r.idx(s_c + ds))
                c = r.P[k] + r.nor[k] * side * (r.half_paved + b["width"] - 1.2)
                look = r.nor[k] * side * (1.0 if b.get("view_side", side) == side else -1.0)
                _bench(ch.get("piazzole", rid, s_c), c, _ground(ctx, *c), look)
                stats["panchine"] += 1
    mats = atlas.write(ctx["level_dir"], ctx["level_name"])
    stats["triangoli"] = ch.emit(sw)
    stats["muri_m"] = round(stats["muri_m"])
    return {"materials": mats, "stats": stats, "keepout": []}
