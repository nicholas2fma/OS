"""Edifici e centri abitati: Montalba, Pratolungo, Forra, zona industriale, cascine isolate.

Gli edifici sono mesh generate (pareti per campata e piano con un atlante di facciate disegnato
qui, tetti a falde o piani, capannoni in lamiera, silos, chiesa con campanile) raccolte in
gruppi per celle di 160 m: un .dae per gruppo con due LOD e una mesh di collisione semplice
(nodo Colmesh-1 -> TSStatic.collisionType "Collision Mesh", valori verificati in
docs/FORMATI_BEAMNG.md). Ogni edificio ha uno spiazzo livellato sul terreno (fuori dalle
piattaforme stradali) e una fondazione che scende sotto lo spiazzo.

Posizionamento: lungo le strade dei centri (fronte verso la strada, arretramento oltre la
banchina), con controlli su piattaforme stradali, acqua, fiumi, ponti e gallerie, pendenza e
sovrapposizioni. Nessun edificio nell'area di servizio (modulo dedicato).
"""

from __future__ import annotations

import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from .geom import smoothstep
from .materials import IDX
from .mesh.collada import Mesh, write_dae
from .structures import _relocate
from .textures import TexGen

ART = "art/shapes/ew/edifici"
NS = uuid.UUID("0c8f1d6a-2b7e-4f2c-9e3a-5d1b7a4c8e21")

FLOOR = 3.0          # altezza di un piano
BAY = 3.5            # larghezza indicativa di una campata
# atlante delle facciate: colonne = tipo di campata, righe = colore dell'intonaco
TILE_TYPES = ("finestra", "porta", "negozio", "cieco")
COLORS = ((232, 226, 212), (222, 184, 120), (220, 170, 152), (236, 218, 160))
PLASTER_MATS = ("ew_plaster_white", "ew_plaster_ochre", "ew_plaster_pink", "ew_plaster_ochre")


# ============================================================== texture
def _facade_atlas(path: Path, seed: int, n=256):
    """Atlante 4x4 di riquadri 256 px che rappresentano una campata (3,5 m) per un piano (3 m)."""
    rng = np.random.default_rng(seed)
    tg = TexGen(seed)
    img = Image.new("RGB", (4 * n, 4 * n))
    px = n / BAY                                      # pixel per metro in orizzontale
    py = n / FLOOR
    for row, col in enumerate(COLORS):
        noise = tg.spectral(n, 1.6, 50 + row, fmin=3)
        base = np.clip(np.array(col)[None, None, :] * (1.0 + 0.035 * noise[..., None]), 0, 255).astype(np.uint8)
        shutter = [(62, 98, 66), (110, 72, 44), (70, 86, 110), (96, 104, 60)][row]
        for c, kind in enumerate(TILE_TYPES):
            t = Image.fromarray(base.copy())
            d = ImageDraw.Draw(t)
            # zoccolo scuro solo nei riquadri da piano terra
            if kind in ("porta", "negozio"):
                d.rectangle([0, n - 0.35 * py, n, n], fill=tuple(int(v * 0.72) for v in col))
            # fascia marcapiano in alto
            d.rectangle([0, 0, n, 0.12 * py], fill=tuple(min(255, int(v * 1.06)) for v in col))
            if kind == "finestra":
                w, hgt, sill = 1.1, 1.45, 0.95
                x0 = (BAY - w) / 2 * px
                y1 = n - sill * py
                y0 = y1 - hgt * py
                d.rectangle([x0 - 5, y0 - 5, x0 + w * px + 5, y1 + 7], fill=(238, 236, 228))      # cornice
                d.rectangle([x0, y0, x0 + w * px, y1], fill=(58, 70, 82))
                d.rectangle([x0, y0, x0 + w * px * 0.45, y0 + (y1 - y0) * 0.5], fill=(92, 108, 122))  # riflesso
                d.line([x0 + w * px / 2, y0, x0 + w * px / 2, y1], fill=(220, 220, 214), width=4)
                d.line([x0, y0 + (y1 - y0) * 0.45, x0 + w * px, y0 + (y1 - y0) * 0.45], fill=(220, 220, 214), width=4)
                if rng.random() < 0.85:                                                          # persiane
                    for sx in (x0 - 0.55 * px - 6, x0 + w * px + 6):
                        d.rectangle([sx, y0, sx + 0.55 * px, y1], fill=shutter)
                        for yy in np.arange(y0 + 6, y1, 9):
                            d.line([sx + 3, yy, sx + 0.55 * px - 3, yy], fill=tuple(int(v * 0.8) for v in shutter), width=2)
            elif kind == "porta":
                w, hgt = 1.2, 2.3
                x0 = (BAY - w) / 2 * px
                d.rectangle([x0 - 7, n - hgt * py - 7, x0 + w * px + 7, n - 0.35 * py], fill=(236, 232, 222))
                d.rectangle([x0, n - hgt * py, x0 + w * px, n - 0.35 * py], fill=(104, 66, 38))
                for k in range(2):
                    xx = x0 + (0.12 + 0.46 * k) * w * px
                    d.rectangle([xx, n - hgt * py + 14, xx + 0.36 * w * px, n - 0.35 * py - 16], outline=(80, 50, 28), width=3)
                d.rectangle([x0 - 16, n - hgt * py - 22, x0 + w * px + 16, n - hgt * py - 10], fill=(90, 90, 92))  # pensilina
            elif kind == "negozio":
                x0, x1 = 0.25 * px, (BAY - 0.25) * px
                y0 = n - 2.45 * py
                sign = [(170, 40, 40), (40, 90, 150), (30, 120, 70), (200, 140, 30)][int(rng.integers(0, 4))]
                d.rectangle([x0, y0 - 0.45 * py, x1, y0 - 0.08 * py], fill=sign)                  # insegna
                d.rectangle([x0, y0, x1, n - 0.35 * py], fill=(46, 50, 54))                         # telaio
                d.rectangle([x0 + 8, y0 + 8, x1 - 8, n - 0.35 * py - 8], fill=(70, 88, 100))
                d.rectangle([x0 + 8, y0 + 8, x0 + (x1 - x0) * 0.4, y0 + (n - y0) * 0.35], fill=(110, 130, 142))
                d.line([(x0 + x1) / 2, y0, (x0 + x1) / 2, n - 0.35 * py], fill=(46, 50, 54), width=6)
            img.paste(t, (c * n, row * n))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    return path


def write_textures(level_dir: Path, level_name: str, seed: int) -> dict:
    out = level_dir / ART
    p = _facade_atlas(out / "ew_facciate_b.png", seed + 61)
    tg = TexGen(seed + 62)
    # finestre a nastro e porte dei capannoni
    n = 256
    a = tg.spectral(n, 1.2, 3, fmin=4)
    door = np.stack([150 + 0 * a] * 3, -1) * (0.85 + 0.15 * (np.sin(np.linspace(0, 40 * np.pi, n))[:, None, None] > 0)) \
        * (1 + 0.04 * a[..., None])
    pd = tg.save(out / "ew_portone_b.png", np.clip(door * np.array([0.82, 0.86, 0.9]), 0, 255))
    vp = lambda q: f"/levels/{level_name}/{ART}/{q.name}"  # noqa: E731
    return {
        "ew_facciate": {"name": "ew_facciate", "mapTo": "ew_facciate", "class": "Material", "version": 1.5,
                        "Stages": [{"baseColorMap": vp(p)}, {}, {}, {}]},
        "ew_portone": {"name": "ew_portone", "mapTo": "ew_portone", "class": "Material", "version": 1.5,
                       "Stages": [{"baseColorMap": vp(pd)}, {}, {}, {}]},
    }


# ============================================================== mesh
def _quad(m: Mesh, mat, a, b, c, d, uv, normal):
    """Quadrilatero con facce rivolte verso `normal` (ordine dei vertici corretto qui)."""
    P = np.array([a, b, c, d], dtype=np.float64)
    gn = np.cross(P[1] - P[0], P[2] - P[0])
    tris = [[0, 1, 2], [0, 2, 3]]
    if np.dot(gn, normal) < 0:
        tris = [[0, 2, 1], [0, 3, 2]]
    nrm = np.asarray(normal, dtype=np.float64)
    nrm = nrm / (np.linalg.norm(nrm) or 1.0)
    m.add(mat, P, np.repeat(nrm[None, :], 4, 0), np.asarray(uv, dtype=np.float64), tris)


def _tri(m: Mesh, mat, a, b, c, uv, normal):
    P = np.array([a, b, c], dtype=np.float64)
    gn = np.cross(P[1] - P[0], P[2] - P[0])
    tri = [[0, 1, 2]] if np.dot(gn, normal) >= 0 else [[0, 2, 1]]
    nrm = np.asarray(normal, dtype=np.float64)
    nrm = nrm / (np.linalg.norm(nrm) or 1.0)
    m.add(mat, P, np.repeat(nrm[None, :], 3, 0), np.asarray(uv, dtype=np.float64), tri)


def _atlas_uv(kind, color):
    c = TILE_TYPES.index(kind)
    e = 3.0 / 1024                                   # margine contro le sbavature delle mipmap
    u0, u1 = c / 4 + e, (c + 1) / 4 - e
    # PIL scrive la riga 0 in alto; in Collada/Torque v=0 è in basso
    v1, v0 = 1 - color / 4 - e, 1 - (color + 1) / 4 + e
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]


class Frame:
    """Sistema locale dell'edificio: x lungo la facciata principale, y verso il retro."""

    def __init__(self, cx, cy, yaw, z0):
        self.c = np.array([cx, cy], dtype=np.float64)
        self.u = np.array([np.cos(yaw), np.sin(yaw)])
        self.v = np.array([-np.sin(yaw), np.cos(yaw)])
        self.z0 = z0

    def p(self, x, y, z):
        q = self.c + self.u * x + self.v * y
        return np.array([q[0], q[1], self.z0 + z])

    def n(self, nx, ny, nz=0.0):
        q = self.u * nx + self.v * ny
        return np.array([q[0], q[1], nz])


def _walls(m: Mesh, lod1: Mesh, F: Frame, w, d, floors, color, front_kind="porta", shops=False, found=1.4,
           blank_sides=False):
    """Pareti con una campata per riquadro dell'atlante; lato 0 = facciata su strada (y = -d/2)."""
    hw, hd = w / 2, d / 2
    H = floors * FLOOR
    corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    for side in range(4):
        (x0, y0), (x1, y1) = corners[side], corners[(side + 1) % 4]
        L = float(np.hypot(x1 - x0, y1 - y0))
        nx, ny = (y1 - y0) / L, -(x1 - x0) / L        # normale esterna (vertici in senso antiorario)
        nrm = F.n(nx, ny)
        nb = max(1, int(round(L / BAY)))
        door_bay = nb // 2
        for b in range(nb):
            ta, tb = b / nb, (b + 1) / nb
            xa, ya = x0 + (x1 - x0) * ta, y0 + (y1 - y0) * ta
            xb, yb = x0 + (x1 - x0) * tb, y0 + (y1 - y0) * tb
            for f in range(floors):
                if f == 0 and side == 0:
                    kind = "negozio" if shops else ("porta" if b == door_bay else "finestra")
                    if front_kind == "porta" and b == door_bay:
                        kind = "porta"
                elif blank_sides and side in (1, 3):
                    kind = "cieco"
                else:
                    kind = "finestra"
                za, zb = f * FLOOR, (f + 1) * FLOOR
                _quad(m, "ew_facciate", F.p(xa, ya, za), F.p(xb, yb, za), F.p(xb, yb, zb), F.p(xa, ya, zb),
                      _atlas_uv(kind, color), nrm)
        # fondazione sotto lo spiazzo (scende sotto il terreno sui pendii)
        _quad(m, "ew_concrete_dark", F.p(x0, y0, -found), F.p(x1, y1, -found), F.p(x1, y1, 0), F.p(x0, y0, 0),
              [[0, 0], [L / 2, 0], [L / 2, found / 2], [0, found / 2]], nrm)
        # LOD1 e collisione: una sola faccia per lato
        _quad(lod1, PLASTER_MATS[color], F.p(x0, y0, -found), F.p(x1, y1, -found), F.p(x1, y1, H), F.p(x0, y0, H),
              [[0, 0], [L / 2, 0], [L / 2, (H + found) / 2], [0, (H + found) / 2]], nrm)
    return H


def _gable_roof(meshes, F: Frame, w, d, H, pitch_deg=30.0, ov=0.45, mat="ew_roof_tiles", wall_mat="ew_plaster_white"):
    """Tetto a due falde con colmo parallelo alla facciata; timpani in intonaco."""
    hw, hd = w / 2 + ov, d / 2 + ov
    rh = (d / 2 + ov) * np.tan(np.radians(pitch_deg))
    for m in meshes:
        for sgn in (-1.0, 1.0):                     # falda anteriore (y<0) e posteriore
            a, b = F.p(-hw, sgn * hd, H - ov * np.tan(np.radians(pitch_deg))), F.p(hw, sgn * hd, H - ov * np.tan(np.radians(pitch_deg)))
            c, e = F.p(hw, 0, H + rh - ov * np.tan(np.radians(pitch_deg))), F.p(-hw, 0, H + rh - ov * np.tan(np.radians(pitch_deg)))
            nrm = F.n(0, sgn * np.sin(np.radians(pitch_deg)), np.cos(np.radians(pitch_deg)))
            slope_len = hd / np.cos(np.radians(pitch_deg))
            uv = [[0, 0], [2 * hw / 2, 0], [2 * hw / 2, slope_len / 2], [0, slope_len / 2]]
            _quad(m, mat, a, b, c, e, uv, nrm)
            _quad(m, mat, a, b, c, e, uv, -nrm)     # intradosso della gronda
        rtop = H + (d / 2) * np.tan(np.radians(pitch_deg))
        for sx in (-1.0, 1.0):                      # timpani
            _tri(m, wall_mat, F.p(sx * w / 2, -d / 2, H), F.p(sx * w / 2, d / 2, H), F.p(sx * w / 2, 0, rtop),
                 [[0, 0], [d / 2, 0], [d / 4, (rtop - H) / 2]], F.n(sx, 0))
    return H + rh


def _flat_roof(meshes, F: Frame, w, d, H, parapet=0.8):
    hw, hd = w / 2, d / 2
    for m in meshes:
        _quad(m, "ew_concrete_dark", F.p(-hw, -hd, H + 0.05), F.p(hw, -hd, H + 0.05), F.p(hw, hd, H + 0.05),
              F.p(-hw, hd, H + 0.05), [[0, 0], [w / 2, 0], [w / 2, d / 2], [0, d / 2]], np.array([0, 0, 1.0]))
    # parapetto (solo LOD0)
    m = meshes[0]
    t = 0.25
    for (x0, y0, x1, y1) in ((-hw, -hd, hw, -hd + t), (-hw, hd - t, hw, hd), (-hw, -hd, -hw + t, hd), (hw - t, -hd, hw, hd)):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        q = F.p(cx, cy, H + parapet / 2)
        yaw = float(np.arctan2(F.u[1], F.u[0]))
        m.add_box("ew_concrete", q, (x1 - x0, y1 - y0, parapet), yaw)
    return H + parapet


def house(m, lod1, F, w, d, floors, color, roof="falde", shops=False, blank_sides=False):
    H = _walls(m, lod1, F, w, d, floors, color, shops=shops, blank_sides=blank_sides)
    if roof == "falde":
        return _gable_roof((m, lod1), F, w, d, H, wall_mat=PLASTER_MATS[color])
    return _flat_roof((m, lod1), F, w, d, H)


def warehouse(m, lod1, F, w, d, H, mat):
    """Capannone: pareti in lamiera, zoccolo in cemento, portoni sulla facciata, tetto a bassa pendenza."""
    hw, hd = w / 2, d / 2
    corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    for side in range(4):
        (x0, y0), (x1, y1) = corners[side], corners[(side + 1) % 4]
        L = float(np.hypot(x1 - x0, y1 - y0))
        nrm = F.n((y1 - y0) / L, -(x1 - x0) / L)
        for mm in (m, lod1):
            _quad(mm, "ew_concrete", F.p(x0, y0, -1.5), F.p(x1, y1, -1.5), F.p(x1, y1, 1.2), F.p(x0, y0, 1.2),
                  [[0, 0], [L / 2, 0], [L / 2, 1.35], [0, 1.35]], nrm)
            _quad(mm, mat, F.p(x0, y0, 1.2), F.p(x1, y1, 1.2), F.p(x1, y1, H), F.p(x0, y0, H),
                  [[0, 0], [L / 3, 0], [L / 3, (H - 1.2) / 3], [0, (H - 1.2) / 3]], nrm)
        if side == 0:                                # portoni a rullo sulla facciata
            nd = max(1, int(w // 14))
            for k in range(nd):
                xc = -hw + w * (k + 0.5) / nd
                a, b = xc - 2.5, xc + 2.5
                off = 0.06
                _quad(m, "ew_portone", F.p(a, -hd - off, 0.0), F.p(b, -hd - off, 0.0), F.p(b, -hd - off, 5.0),
                      F.p(a, -hd - off, 5.0), [[0, 0], [1, 0], [1, 1], [0, 1]], F.n(0, -1))
    # tetto a capanna ribassato (10 gradi) in lamiera
    return _gable_roof((m, lod1), F, w, d, H, pitch_deg=10.0, ov=0.3, mat=mat, wall_mat=mat)


def silo(m, lod1, cx, cy, z0, r, H):
    for mm, sides in ((m, 16), (lod1, 8)):
        mm.prism("ew_metal", (cx, cy, z0 - 1.0), r, H + 1.0, sides=sides)
        mm.prism("ew_metal", (cx, cy, z0 + H), r * 0.5, 1.2, sides=sides)


def church(m, lod1, F, color):
    """Chiesa: navata con tetto a falde e campanile con cuspide."""
    w, d = 12.0, 24.0                              # facciata stretta su strada
    Fn = Frame(*(F.c + F.v * 0.0), np.arctan2(F.u[1], F.u[0]), F.z0)
    H = _walls(m, lod1, Fn, w, d, 3, color, blank_sides=True)
    _gable_roof((m, lod1), Fn, w, d, H, pitch_deg=32.0, wall_mat=PLASTER_MATS[color])
    # campanile a lato
    Ft = Frame(*(F.c + F.u * (w / 2 + 3.2) + F.v * (d / 2 - 3.0)), np.arctan2(F.u[1], F.u[0]), F.z0)
    Ht = _walls(m, lod1, Ft, 5.0, 5.0, 8, color, blank_sides=True)
    top = Ft.p(0, 0, Ht + 6.0)
    for k in range(4):
        cs = [(-2.7, -2.7), (2.7, -2.7), (2.7, 2.7), (-2.7, 2.7)]
        (x0, y0), (x1, y1) = cs[k], cs[(k + 1) % 4]
        nrm = Ft.n((y1 - y0) / 5.4, -(x1 - x0) / 5.4, 0.5)
        for mm in (m, lod1):
            _tri(mm, "ew_roof_tiles", Ft.p(x0, y0, Ht), Ft.p(x1, y1, Ht), top, [[0, 0], [2.7, 0], [1.35, 3]], nrm)
    return max(w, d)


# ============================================================== posa
class Site:
    """Raster di occupazione e controlli dell'area edificabile."""

    def __init__(self, ctx):
        g = ctx["g"]
        self.g = g
        self.h = ctx["h"]
        core = ctx["road_masks"]["core_id"] >= 0
        self.core = ndimage.binary_dilation(core, iterations=1)
        water = np.zeros(core.shape, dtype=bool)
        for lk in ctx["lake_masks"].values():
            water |= lk["mask"]
        self.water = ndimage.binary_dilation(water, iterations=4)
        self.river = ctx["river_dist"]
        self.occ = np.zeros(core.shape, dtype=bool)
        # zone vietate: imbocchi delle gallerie, ponti, diga, area di servizio
        self.ban = np.zeros(core.shape, dtype=bool)
        for r in ctx["net"].roads.values():
            for st in r.structures:
                ss = np.arange(st.s0 - 30.0, st.s1 + 30.0, 10.0) if st.kind == "bridge" else np.array([st.s0, st.s1])
                ss = np.clip(ss, 0, r.length)
                for (x, y) in r.point(ss):
                    self._disc(self.ban, x, y, r.half_paved + (25.0 if st.kind == "bridge" else 60.0))
        for fl in ctx["landforms"].get("flats", []):
            if "servizio" in fl["name"].lower():
                self._disc(self.ban, fl["center"][0], fl["center"][1], fl["radius"] + 40.0)
        if ctx.get("dam"):
            a, b = np.array(ctx["dam"]["a"], float), np.array(ctx["dam"]["b"], float)
            for t in np.linspace(-0.3, 1.3, 10):
                p = a + (b - a) * t
                self._disc(self.ban, p[0], p[1], 80.0)

    def _disc(self, arr, x, y, r):
        win = self.g.window(x - r, y - r, x + r, y + r)
        X, Y = self.g.window_mesh(win)
        arr[win] |= (X - x) ** 2 + (Y - y) ** 2 <= r * r

    def footprint(self, F: Frame, w, d, margin):
        xs = np.arange(-w / 2 - margin, w / 2 + margin + 0.01, 1.5)
        ys = np.arange(-d / 2 - margin, d / 2 + margin + 0.01, 1.5)
        XX, YY = np.meshgrid(xs, ys)
        P = F.c[None, None, :] + F.u[None, None, :] * XX[..., None] + F.v[None, None, :] * YY[..., None]
        ix = np.rint((P[..., 0] - self.g.x0) / self.g.step).astype(int)
        iy = np.rint((P[..., 1] - self.g.y0) / self.g.step).astype(int)
        return ix.ravel(), iy.ravel(), P.reshape(-1, 2)

    def check(self, F: Frame, w, d, max_range=3.5, margin=1.0):
        ix, iy, P = self.footprint(F, w, d, margin)
        n = self.g.size
        if (ix < 2).any() or (iy < 2).any() or (ix >= n - 2).any() or (iy >= n - 2).any():
            return None
        if self.core[iy, ix].any() or self.water[iy, ix].any() or self.occ[iy, ix].any() or self.ban[iy, ix].any():
            return None
        if (self.river[iy, ix] < 8.0).any():
            return None
        z = self.h[iy, ix]
        if z.max() - z.min() > max_range:
            return None
        zm = float(np.median(z))
        # nessun pendio ripido addossato ai muri: entro due passi della griglia il terreno non deve
        # superare il pavimento di oltre 1,5 m (altrimenti il triangolo del terreno entra nell'edificio)
        ix2, iy2, _ = self.footprint(F, w, d, margin + 2.0 * self.g.step)
        if (ix2 < 0).any() or (iy2 < 0).any() or (ix2 >= n).any() or (iy2 >= n).any():
            return None
        if (self.h[iy2, ix2] - zm).max() > 1.5:
            return None
        return zm

    def claim(self, F: Frame, w, d, gap):
        ix, iy, _ = self.footprint(F, w, d, gap)
        self.occ[iy, ix] = True


def _level_pad(ctx, F: Frame, w, d, z, blend=5.0):
    """Spiazzo orizzontale sotto l'edificio (+1 m) raccordato al terreno; mai sulle strade."""
    g, h = ctx["g"], ctx["h"]
    core = ctx["road_masks"]["core_id"]
    r = max(w, d) / 2 + 1.0 + blend + 2.0
    win = g.window(F.c[0] - r, F.c[1] - r, F.c[0] + r, F.c[1] + r)
    X, Y = g.window_mesh(win)
    dx, dy = X - F.c[0], Y - F.c[1]
    lx = np.abs(dx * F.u[0] + dy * F.u[1]) - (w / 2 + 1.0)
    ly = np.abs(dx * F.v[0] + dy * F.v[1]) - (d / 2 + 1.0)
    dist = np.hypot(np.maximum(lx, 0), np.maximum(ly, 0))
    wgt = 1.0 - smoothstep(0.0, blend, dist)
    sub = h[win]
    free = core[win] < 0
    # fuori dall'impronta si raccorda solo il terreno vicino alla quota dello spiazzo: scarpate e
    # dirupi restano (la fondazione copre il dislivello)
    near = (dist <= g.step) | (np.abs(sub - z) < 3.0)
    sub[:] = np.where(free & near, sub + (z - sub) * wgt, sub)


def _paint(ctx, F: Frame, w, d, layer, margin=0.0):
    g = ctx["g"]
    lay = ctx["layers"]
    core = ctx["road_masks"]["core_id"]
    r = max(w, d) / 2 + margin + 2.0
    win = g.window(F.c[0] - r, F.c[1] - r, F.c[0] + r, F.c[1] + r)
    X, Y = g.window_mesh(win)
    dx, dy = X - F.c[0], Y - F.c[1]
    inside = (np.abs(dx * F.u[0] + dy * F.u[1]) <= w / 2 + margin) & (np.abs(dx * F.v[0] + dy * F.v[1]) <= d / 2 + margin)
    sub = lay[win]
    sub[inside & (core[win] < 0)] = IDX[layer]


def _junction_stations(net, rid):
    """Stazioni della strada rid dove si innestano altre strade (e i suoi stessi innesti)."""
    out = [s_here for _, s_here, _ in net.roads[rid].junctions]
    for oid, o in net.roads.items():
        for parent, _, s_parent in o.junctions:
            if parent == rid:
                out.append(s_parent)
    return np.array(out)


# tipi di edificio per zona: (larghezza, profondità, piani, tetto, negozi, distacco, arretramento)
ZONES = {
    "centro": dict(w=(16, 28), d=(11, 14), floors=(3, 5), roof="piano", shops=True, gap=(1.5, 3.0), setback=(3.5, 5.0)),
    "semicentro": dict(w=(9, 14), d=(9, 11), floors=(2, 3), roof="falde", shops=False, gap=(2.0, 5.0), setback=(4.0, 7.0)),
    "periferia": dict(w=(8, 12), d=(8, 10), floors=(1, 2), roof="falde", shops=False, gap=(7.0, 14.0), setback=(6.0, 11.0)),
    "paese": dict(w=(8, 13), d=(8, 10), floors=(2, 3), roof="falde", shops=False, gap=(4.0, 14.0), setback=(3.5, 7.0)),
}


class Builder:
    def __init__(self, ctx):
        self.ctx = ctx
        self.site = Site(ctx)
        self.rng = np.random.default_rng(ctx["seed"] + 3131)
        self.cells = {}            # cella 160 m -> (lod0, lod1)
        self.buildings = []        # (x, y, raggio, tipo)
        self.keepout = []

    def mesh_for(self, x, y):
        key = (int(np.floor(x / 160.0)), int(np.floor(y / 160.0)))
        if key not in self.cells:
            self.cells[key] = (Mesh(), Mesh())
        return self.cells[key]

    def place(self, F: Frame, w, d, kind, max_range=3.5, gap=2.0, **kw):
        z = self.site.check(F, w, d, max_range=max_range)
        if z is None:
            return False
        F.z0 = z
        m, l1 = self.mesh_for(*F.c)
        color = int(self.rng.integers(0, len(COLORS)))
        if kind == "casa":
            house(m, l1, F, w, d, kw["floors"], color, roof=kw.get("roof", "falde"), shops=kw.get("shops", False))
        elif kind == "fienile":
            house(m, l1, F, w, d, 2, 1, roof="falde", blank_sides=True)
        elif kind == "capannone":
            warehouse(m, l1, F, w, d, kw["H"], kw["mat"])
        elif kind == "chiesa":
            church(m, l1, F, color)
        _level_pad(self.ctx, F, w, d, z)
        self.site.claim(F, w, d, gap)
        r = 0.5 * float(np.hypot(w, d))
        self.buildings.append((float(F.c[0]), float(F.c[1]), r, kind))
        self.keepout.append([float(F.c[0]), float(F.c[1]), r + 3.0])
        return True

    # ---------------------------------------------------------- fronti stradali
    def frontage(self, rid, center, radius, zone_of, sides=(1.0, -1.0), rows=1):
        net = self.ctx["net"]
        road = net.roads[rid]
        jun = _junction_stations(net, rid)
        d_c = np.hypot(road.P[:, 0] - center[0], road.P[:, 1] - center[1])
        idx = np.nonzero(d_c < radius)[0]
        if len(idx) < 10:
            return 0
        s0, s1 = road.s[idx[0]], road.s[idx[-1]]
        count = 0
        for side in sides:
            s = s0 + self.rng.uniform(0, 6)
            while s < s1:
                k = int(road.idx(s))
                dist_c = float(np.hypot(*(road.P[k] - np.asarray(center))))
                zone = zone_of(dist_c)
                if zone is None or road.structure_mask(np.array([s]), "bridge")[0] or \
                        road.structure_mask(np.array([s]), "tunnel")[0]:
                    s += 10.0
                    continue
                if len(jun) and np.abs(jun - s).min() < 22.0:
                    s += 6.0
                    continue
                Z = ZONES[zone]
                w = self.rng.uniform(*Z["w"])
                d = self.rng.uniform(*Z["d"])
                sc = min(s + w / 2, road.length)
                kc = int(road.idx(sc))
                tan = road.tan[kc]
                nor = road.nor[kc]
                base = road.half_core + self.rng.uniform(*Z["setback"])
                placed = False
                floors = int(self.rng.integers(Z["floors"][0], Z["floors"][1] + 1))
                # facciata verso la strada: asse y locale dal fronte verso il retro
                v = nor * side
                yaw = float(np.arctan2(-v[0], v[1]))
                # arretramenti crescenti: oltre le scarpate della strada si trova lo spiazzo
                for setback in (base, base + 5.0, base + 11.0, base + 18.0):
                    ok = False
                    for row in range(rows):
                        off = setback + d / 2 + row * (d + 7.0)
                        c = road.P[kc] + v * off
                        F = Frame(c[0], c[1], yaw, 0.0)
                        r_ok = self.place(F, w, d, "casa", max_range=3.0 if zone == "centro" else 4.0,
                                          gap=self.rng.uniform(*Z["gap"]) / 2, floors=floors,
                                          roof=Z["roof"], shops=Z["shops"] and row == 0 and setback == base)
                        ok |= r_ok
                        count += r_ok
                        if not r_ok:
                            break
                    if ok:
                        placed = True
                        if zone in ("centro", "semicentro") and setback == base:
                            # marciapiede dal bordo strada alla facciata
                            depth = setback - road.half_paved
                            mid = road.P[kc] + v * (road.half_paved + depth / 2)
                            _paint(self.ctx, Frame(mid[0], mid[1], yaw, 0.0), w + 3.0, depth, "ew_concrete")
                        break
                    if zone == "centro":
                        break                       # in centro il fronte resta allineato alla strada
                s += (w + self.rng.uniform(*Z["gap"])) if placed else 4.0
                _ = tan
        return count

    # ---------------------------------------------------------- zona industriale
    def industrial(self, center, radius, rid):
        road = self.ctx["net"].roads[rid]
        cx, cy = center
        n = 0
        # file di capannoni ai due lati della strada di accesso, poi una seconda fila
        d_c = np.hypot(road.P[:, 0] - cx, road.P[:, 1] - cy)
        idx = np.nonzero(d_c < radius)[0]
        if len(idx) == 0:
            return 0
        for side in (1.0, -1.0):
            for row in range(3):
                s = road.s[idx[0]] + 10.0
                while s < road.s[idx[-1]] - 10.0:
                    w = self.rng.uniform(26, 48)
                    d = self.rng.uniform(20, 34)
                    kc = int(road.idx(s + w / 2))
                    nor = road.nor[kc] * side
                    off = road.half_core + 14.0 + d / 2 + row * (d + 26.0)
                    c = road.P[kc] + nor * off
                    if np.hypot(c[0] - cx, c[1] - cy) > radius * 1.25:
                        s += 12.0
                        continue
                    yaw = float(np.arctan2(-nor[0], nor[1]))
                    F = Frame(c[0], c[1], yaw, 0.0)
                    mat = "ew_metal_sheet_blue" if self.rng.random() < 0.35 else "ew_metal_sheet"
                    if self.place(F, w, d, "capannone", max_range=4.5, gap=6.0, H=float(self.rng.uniform(8, 12)), mat=mat):
                        n += 1
                        # piazzale davanti ai portoni e intorno
                        _paint(self.ctx, Frame(*(c - nor * (d / 2 + 7)), yaw, 0.0), w + 6, 14, "ew_concrete")
                        _paint(self.ctx, F, w, d, "ew_concrete", margin=3.0)
                        if self.rng.random() < 0.3:
                            sp = c + road.tan[kc] * (w / 2 + 10.5) + nor * (d / 4)   # fuori dal margine del capannone
                            m, l1 = self.mesh_for(*sp)
                            for k in range(int(self.rng.integers(1, 4))):
                                q = sp + nor * (k * 7.5)
                                Fs = Frame(q[0], q[1], yaw, 0.0)
                                zs = self.site.check(Fs, 6.0, 6.0, max_range=2.5)
                                if zs is None:
                                    break
                                silo(m, l1, q[0], q[1], zs, 3.0, float(self.rng.uniform(10, 16)))
                                self.site.claim(Fs, 6.0, 6.0, 1.0)
                                self.keepout.append([float(q[0]), float(q[1]), 6.0])
                        s += w + self.rng.uniform(8, 16)
                    else:
                        s += 10.0
        return n

    # ---------------------------------------------------------- cascine
    def farms(self, max_n=12):
        ctx = self.ctx
        net = ctx["net"]
        flats = ctx["landforms"].get("flats", [])
        g = ctx["g"]
        chosen = []
        cand = []
        for rid in ("SP2", "SP8", "SS1", "SP7", "SP11", "SS3", "SP9"):
            if rid not in net.roads:
                continue
            road = net.roads[rid]
            for s in np.arange(150.0, road.length - 150.0, 90.0):
                k = int(road.idx(s))
                p = road.P[k]
                if any(np.hypot(*(p - np.asarray(f["center"]))) < f["radius"] + 350 for f in flats):
                    continue
                for side in (1.0, -1.0):
                    c = p + road.nor[k] * side * (road.half_core + 38.0)
                    hs = g.sample(ctx["h"], np.array([c[0] - 30, c[0] + 30, c[0], c[0]]),
                                  np.array([c[1], c[1], c[1] - 30, c[1] + 30]))
                    if np.ptp(hs) < 6.0:
                        cand.append((float(np.ptp(hs)), rid, s, side, c, road.nor[k] * side))
        self.rng.shuffle(cand)
        cand.sort(key=lambda t: t[0])
        for _, rid, s, side, c, nor in cand:
            if len(chosen) >= max_n:
                break
            if any(np.hypot(*(c - q)) < 650 for q in chosen):
                continue
            yaw = float(np.arctan2(-nor[0], nor[1]))
            tan = np.array([nor[1], -nor[0]])
            ok = self.place(Frame(c[0], c[1], yaw, 0.0), 11.0, 9.0, "casa", max_range=4.0, gap=3.0, floors=2)
            if not ok:
                continue
            chosen.append(c)
            b = c + tan * 20.0 + nor * 6.0
            self.place(Frame(b[0], b[1], yaw, 0.0), 18.0, 12.0, "fienile", max_range=4.5, gap=3.0)
            sh = c - tan * 17.0 + nor * 4.0
            self.place(Frame(sh[0], sh[1], yaw, 0.0), 14.0, 9.0, "capannone", max_range=4.5, gap=3.0, H=5.5,
                       mat="ew_metal_sheet")
            _paint(ctx, Frame(*(c + nor * 2.0), yaw, 0.0), 52.0, 26.0, "ew_gravel")
        return len(chosen)

    # ---------------------------------------------------------- scrittura
    def emit(self):
        ctx = self.ctx
        level_dir, name = ctx["level_dir"], ctx["level_name"]
        tris = 0
        n = 0
        for (i, j), (m, l1) in sorted(self.cells.items()):
            if not m.parts:
                continue
            lo, hi = m.bounds()
            origin = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
            nm = f"edifici_{i}_{j}".replace("-", "m")
            path = level_dir / ART / f"{nm}.dae"
            loc0, loc1 = _relocate(m, origin), _relocate(l1, origin)
            write_dae(path, [(nm, loc0, 400), (nm, loc1, 2)], collision=loc1)
            ctx["scene"].add("MissionGroup/edifici", {
                "class": "TSStatic", "name": nm, "position": origin.tolist(),
                "shapeName": f"/levels/{name}/{ART}/{nm}.dae",
                "rotationMatrix": [1, 0, 0, 0, 1, 0, 0, 0, 1], "scale": [1, 1, 1],
                "collisionType": "Collision Mesh", "decalType": "Collision Mesh"})
            tris += loc0.triangle_count()
            n += 1
        return n, tris


def run(ctx: dict) -> dict:
    """Genera i centri abitati. Modifica ctx["h"] (spiazzi) e ctx["layers"] (piazzali, aie)."""
    B = Builder(ctx)
    flats = {f["name"]: f for f in ctx["landforms"].get("flats", [])}
    net = ctx["net"]
    stats = {}
    # Montalba: centro, semicentro e periferia attorno al Corso
    mon = flats.get("Montalba")
    if mon:
        c, R = mon["center"], mon["radius"]

        def zone_m(dc):
            if dc < 260:
                return "centro"
            if dc < 470:
                return "semicentro"
            return "periferia" if dc < R * 1.05 else None
        # la chiesa prima di tutto, sul Corso vicino al centro
        road = net.roads["U1"]
        k = int(np.argmin(np.hypot(road.P[:, 0] - c[0], road.P[:, 1] - c[1])))
        for ds in (60.0, -60.0, 120.0, -120.0):
            kk = int(road.idx(road.s[k] + ds))
            nor = road.nor[kk]
            cc = road.P[kk] + nor * (road.half_core + 4.0 + 12.0)
            if B.place(Frame(cc[0], cc[1], float(np.arctan2(-nor[0], nor[1])), 0.0), 18.0, 24.0, "chiesa",
                       max_range=3.0, gap=6.0):
                _paint(ctx, Frame(*(cc - nor * 16.0), float(np.arctan2(-nor[0], nor[1])), 0.0), 26.0, 10.0, "ew_concrete")
                break
        n = B.frontage("U1", c, R, zone_m, rows=2)
        for rid in ("SS1", "SP8", "SP9", "SP2"):
            if rid in net.roads:
                n += B.frontage(rid, c, R, lambda dc: zone_m(dc) if dc > 200 else "semicentro", rows=1)
        stats["Montalba"] = n
    for vname, roads in (("Pratolungo", ("SP2",)), ("Forra", ("SP11", "SP2"))):
        v = flats.get(vname)
        if not v:
            continue
        n = 0
        for rid in roads:
            if rid in net.roads:
                n += B.frontage(rid, v["center"], v["radius"] * 1.15,
                                lambda dc, R=v["radius"]: "paese" if dc < R * 1.15 else None, rows=1)
        stats[vname] = n
    zi = flats.get("Zona Industriale")
    if zi and "SP9" in net.roads:
        stats["Zona Industriale"] = B.industrial(zi["center"], zi["radius"], "SP9")
    stats["cascine"] = B.farms()
    mats = write_textures(ctx["level_dir"], ctx["level_name"], ctx["seed"])
    n_obj, tris = B.emit()
    stats.update({"edifici": len(B.buildings), "oggetti": n_obj, "triangoli_lod0": tris})
    return {"materials": mats, "stats": stats, "keepout": B.keepout}
