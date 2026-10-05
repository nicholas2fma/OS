"""Vegetazione: alberi, cespugli e massi procedurali come oggetti della Forest di BeamNG.

Formati (vedi docs/FORMATI_BEAMNG.md):
- forest/<tipo>.forest4.json: una riga JSON per istanza {pos, rotationMatrix, scale, type}
  (livello Utah2);
- art/forest/managedItemData.json: definizioni TSForestItemData con `shapeFile` e parametri
  di collisione/vento (campi letti dall'importatore di livelli BeamNG e definiti in
  Torque3D forestItem.cpp);
- nella scena un unico oggetto Forest.

Le mesh sono generate qui (nessun asset esterno): tronchi a prisma, chiome a "carte" con
texture RGBA (materiali alphaTest + doubleSided), LOD più semplice, impostore automatico
(nodo bb_autobillboard<px>, gestito da tsShapeLoader.cpp) e nulldetail per la distanza
massima. La collisione è sul solo tronco (nodo Colmesh-1 -> dettaglio "Collision").
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from .geom import polygon_mask, smoothstep
from .mesh.collada import Mesh, write_dae
from .textures import TexGen

VEG = "art/shapes/ew/veg"
NS = uuid.UUID("6f2b8d3e-41a7-4c55-9a51-0e7f6a3c2b19")


# ======================================================================= texture
def _ss_canvas(w, h, k=2):
    img = Image.new("RGBA", (w * k, h * k), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img), k


def _finish(img, w, h, path, bleed_rgb):
    """Riduce (antialias), soglia morbida dell'alfa e colore di fondo uniforme sotto le parti
    trasparenti (evita aloni scuri con il filtraggio delle mipmap)."""
    img = img.resize((w, h), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    alpha = a[..., 3:4] / 255.0
    rgb = a[..., :3] / np.maximum(alpha, 1e-3)
    # riempie il colore delle zone trasparenti con la media sfocata delle zone piene
    w8 = ndimage.gaussian_filter(alpha[..., 0], 6) + 1e-4
    fill = np.stack([ndimage.gaussian_filter(rgb[..., c] * alpha[..., 0], 6) / w8 for c in range(3)], -1)
    fill = np.where(w8[..., None] > 0.02, fill, np.array(bleed_rgb, dtype=np.float32))
    rgb = np.where(alpha > 0.05, rgb, fill)
    out = np.concatenate([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)], -1).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGBA").save(path, optimize=True)
    return path


def tex_spruce(path, rng, w=512, h=256):
    """Ramo d'abete visto dall'alto: asse lungo u (0 = tronco), rametti con aghi."""
    img, d, k = _ss_canvas(w, h)
    cy = h * k / 2
    L = w * k * 0.97
    d.polygon([(0, cy - 4 * k), (L, cy - 1 * k), (L, cy + 1 * k), (0, cy + 4 * k)], fill=(70, 50, 34, 255))
    for t in np.linspace(0.06, 0.96, 16):
        x0 = t * L
        span = (0.25 + 0.75 * np.sin(np.pi * min(t * 1.15, 1.0))) * (h * k * 0.45)
        for side in (-1, 1):
            ang = np.deg2rad(rng.uniform(35, 55))
            ln = span / np.sin(ang) * rng.uniform(0.75, 1.0)
            x1 = x0 + ln * np.cos(ang)
            y1 = cy + side * ln * np.sin(ang)
            d.line([(x0, cy), (x1, y1)], fill=(64, 48, 32, 255), width=int(2 * k))
            for s in np.linspace(0.08, 1.0, int(ln / (3.2 * k))):
                px, py = x0 + (x1 - x0) * s, cy + (y1 - cy) * s
                for nside in (-1, 1):
                    na = np.arctan2(y1 - cy, x1 - x0) + nside * np.deg2rad(rng.uniform(45, 75))
                    nl = rng.uniform(9, 14) * k * (1.0 - 0.35 * s)
                    g = rng.uniform(0.8, 1.15)
                    col = (int(30 * g), int(62 * g), int(34 * g), 255) if rng.random() > 0.15 else \
                        (int(52 * g), int(86 * g), int(44 * g), 255)
                    d.line([(px, py), (px + nl * np.cos(na), py + nl * np.sin(na))], fill=col, width=int(2 * k))
    return _finish(img, w, h, path, (34, 62, 36))


def tex_leaves(path, rng, w=512, base=(70, 110, 45), leaf=(22, 11), count=1100, dome=False):
    """Mazzo di foglie (chioma delle latifoglie, cespugli): ellissi ruotate su un disco."""
    img, d, k = _ss_canvas(w, w)
    c = w * k / 2
    R = c * 0.94
    # rametti sotto le foglie
    for _ in range(9):
        a = rng.uniform(0, 2 * np.pi)
        r1 = R * rng.uniform(0.6, 0.95)
        d.line([(c, c * (1.4 if dome else 1.0)), (c + r1 * np.cos(a), c + r1 * np.sin(a))],
               fill=(78, 60, 42, 255), width=int(3 * k))
    lw, lh = leaf
    for _ in range(count):
        r = R * np.sqrt(rng.random()) ** 0.85
        a = rng.uniform(0, 2 * np.pi)
        x, y = c + r * np.cos(a), c + r * np.sin(a)
        if dome and y > c + R * 0.55:
            continue
        g = rng.uniform(0.72, 1.18)
        shade = 0.82 + 0.3 * (1 - (y / (2 * c)))       # più chiaro in alto
        col = tuple(int(np.clip(b * g * shade, 0, 255)) for b in base) + (255,)
        ang = rng.uniform(0, np.pi)
        ex, ey = lw * k / 2 * rng.uniform(0.8, 1.2), lh * k / 2 * rng.uniform(0.8, 1.2)
        t = np.linspace(0, 2 * np.pi, 10, endpoint=False)
        px = x + ex * np.cos(t) * np.cos(ang) - ey * np.sin(t) * np.sin(ang)
        py = y + ex * np.cos(t) * np.sin(ang) + ey * np.sin(t) * np.cos(ang)
        d.polygon(list(zip(px, py)), fill=col)
    return _finish(img, w, w, path, base)


def tex_needle_tuft(path, rng, w=512, base=(44, 74, 42)):
    """Ciuffi di aghi (pino silvestre, pino mugo): raggiere su un disco."""
    img, d, k = _ss_canvas(w, w)
    c = w * k / 2
    R = c * 0.92
    for _ in range(12):
        r = R * 0.66 * np.sqrt(rng.random())
        a = rng.uniform(0, 2 * np.pi)
        cx, cy = c + r * np.cos(a), c + r * np.sin(a)
        d.line([(c, c), (cx, cy)], fill=(92, 60, 40, 255), width=int(3 * k))
        for _ in range(70):
            na = rng.uniform(0, 2 * np.pi)
            nl = rng.uniform(0.22, 0.40) * R
            g = rng.uniform(0.8, 1.2)
            col = tuple(int(np.clip(b * g, 0, 255)) for b in base) + (255,)
            d.line([(cx, cy), (cx + nl * np.cos(na), cy + nl * np.sin(na))], fill=col, width=int(2 * k))
    return _finish(img, w, w, path, base)


def tex_bark(tg: TexGen, n, salt, tone):
    a = tg.spectral(n, 1.2, salt, fmin=3, aniso=(1.0, 0.12))
    b = tg.spectral(n, 2.0, salt + 1, fmin=2)
    fiss = np.clip(1.0 - np.abs(a) * 2.2, 0, 1) ** 3
    lum = 1.0 + 0.08 * b - 0.45 * fiss
    rgb = np.array(tone)[None, None, :] * lum[..., None]
    hgt = 0.6 - 0.5 * fiss + 0.05 * b
    return rgb, hgt


def write_vegetation_textures(level_dir: Path, level_name: str, seed: int) -> dict:
    """Scrive le texture e restituisce i materiali (per art/shapes/ew/main.materials.json)."""
    out = level_dir / VEG
    rng = np.random.default_rng(seed + 4242)
    tg = TexGen(seed + 4243)
    vp = lambda p: f"/levels/{level_name}/{VEG}/{p.name}"  # noqa: E731
    cards = {
        "ew_veg_spruce": tex_spruce(out / "ew_veg_spruce_b.png", rng),
        "ew_veg_leaves": tex_leaves(out / "ew_veg_leaves_b.png", rng),
        "ew_veg_pine": tex_needle_tuft(out / "ew_veg_pine_b.png", rng),
        "ew_veg_bush": tex_leaves(out / "ew_veg_bush_b.png", rng, base=(58, 96, 40), leaf=(15, 9), count=1500, dome=True),
        "ew_veg_bush_dry": tex_leaves(out / "ew_veg_bush_dry_b.png", rng, base=(128, 112, 62), leaf=(15, 8), count=1900,
                                      dome=True),
    }
    mats = {}
    for name, p in cards.items():
        mats[name] = {"name": name, "mapTo": name, "class": "Material", "version": 1.5,
                      "alphaTest": True, "alphaRef": 110, "doubleSided": True,
                      "Stages": [{"baseColorMap": vp(p)}, {}, {}, {}]}
    for name, tone, salt in (("ew_veg_core_conifer", (32, 54, 33), 14), ("ew_veg_core_leaf", (46, 70, 32), 15)):
        a = tg.spectral(128, 1.0, salt, fmin=4)
        rgb = np.array(tone)[None, None, :] * (1.0 + 0.18 * a[..., None])
        b = tg.save(out / f"{name}_b.png", rgb)
        mats[name] = {"name": name, "mapTo": name, "class": "Material", "version": 1.5,
                      "Stages": [{"baseColorMap": vp(b)}, {}, {}, {}]}
    for name, tone, salt in (("ew_veg_bark", (92, 72, 58), 11), ("ew_veg_bark_grey", (128, 124, 114), 12),
                             ("ew_veg_bark_dead", (150, 142, 128), 13)):
        rgb, hgt = tex_bark(tg, 256, salt, tone)
        hgt = (hgt - hgt.min()) / max(hgt.max() - hgt.min(), 1e-9)
        b = tg.save(out / f"{name}_b.png", rgb)
        nm = tg.save(out / f"{name}_nm.png", tg.normal_from_height(hgt, 3.0))
        mats[name] = {"name": name, "mapTo": name, "class": "Material", "version": 1.5,
                      "Stages": [{"baseColorMap": vp(b), "normalMap": vp(nm)}, {}, {}, {}]}
    return mats


# ======================================================================= mesh
def _tube(m: Mesh, mat, pts, radii, sides=8, uv_c=1.0, uv_v=2.0, caps=False):
    """Prisma rastremato lungo una polilinea 3D (tronchi, rami)."""
    pts = np.asarray(pts, dtype=np.float64)
    n = len(pts)
    t = np.gradient(pts, axis=0)
    t /= np.linalg.norm(t, axis=1)[:, None]
    ref = np.array([1.0, 0.0, 0.0]) if abs(t[0, 2]) > 0.9 else np.array([0.0, 0.0, 1.0])
    P, N, UV = [], [], []
    vacc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    for i in range(n):
        a = np.cross(t[i], ref)
        a /= np.linalg.norm(a)
        b = np.cross(t[i], a)
        for j in range(sides + 1):
            th = 2 * np.pi * j / sides
            dirv = a * np.cos(th) + b * np.sin(th)
            P.append(pts[i] + dirv * radii[i])
            N.append(dirv)
            UV.append([j / sides * uv_c, vacc[i] / uv_v])
    tris = []
    for i in range(n - 1):
        for j in range(sides):
            p0 = i * (sides + 1) + j
            p1 = p0 + 1
            q0 = p0 + sides + 1
            q1 = q0 + 1
            tris += [[p0, p1, q1], [p0, q1, q0]]
    m.add(mat, np.array(P), np.array(N), np.array(UV), tris)
    # verifica dell'orientamento: le normali radiali devono concordare con le facce
    if caps:
        for i, sgn in ((0, -1.0), (n - 1, 1.0)):
            ring = np.array(P[i * (sides + 1): i * (sides + 1) + sides])
            ctr = pts[i]
            nn = t[i] * sgn
            Pc = np.vstack([ctr[None, :], ring])
            tri = [[0, 1 + j, 1 + (j + 1) % sides] for j in range(sides)]
            g0 = np.cross(Pc[tri[0][1]] - Pc[0], Pc[tri[0][2]] - Pc[0])
            if np.dot(g0, nn) < 0:
                tri = [[a, c, b] for a, b, c in tri]
            m.add(mat, Pc, np.repeat(nn[None, :], len(Pc), 0), np.zeros((len(Pc), 2)), tri)


def _fix_winding(m: Mesh):
    """Riordina i triangoli perché la normale geometrica concordi con quella assegnata."""
    for part in m.parts.values():
        for k, (P, N, I) in enumerate(zip(part["p"], part["n"], part["i"])):
            base = I.min() if len(I) else 0
            loc = I - base
            a, b, c = P[loc[:, 0]], P[loc[:, 1]], P[loc[:, 2]]
            gn = np.cross(b - a, c - a)
            nv = N[loc[:, 0]] + N[loc[:, 1]] + N[loc[:, 2]]
            flip = np.einsum("ij,ij->i", gn, nv) < 0
            I2 = I.copy()
            I2[flip, 1], I2[flip, 2] = I[flip, 2], I[flip, 1]
            part["i"][k] = I2


def _card(m: Mesh, mat, rows, uvs, normal):
    """Carta a strisce: rows = lista di (sinistra, destra) 3D lungo la carta."""
    P, UV = [], []
    for (l, r), v in zip(rows, uvs):
        P += [l, r]
        UV += [[v, 0.0], [v, 1.0]]
    tris = []
    for i in range(len(rows) - 1):
        a, b, c, d = 2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3
        tris += [[a, c, d], [a, d, b]]
    nrm = np.asarray(normal, dtype=np.float64)
    nrm = nrm / np.linalg.norm(nrm)
    m.add(mat, np.array(P), np.repeat(nrm[None, :], len(P), 0), np.array(UV), tris)


def _quad_card(m: Mesh, mat, center, u, v, su, sv, normal):
    """Carta quadrata centrata (u, v versori del piano, su/sv semilati)."""
    c = np.asarray(center, dtype=np.float64)
    rows = [(c - u * su - v * sv, c - u * su + v * sv), (c + u * su - v * sv, c + u * su + v * sv)]
    _card(m, mat, rows, [0.0, 1.0], normal)


def _trunk_collision(r, h=3.0):
    m = Mesh()
    _tube(m, "ew_veg_bark", [[0, 0, -0.6], [0, 0, h]], [r, r * 0.9], sides=6, caps=True)
    return m


def _core(m: Mesh, mat, center, radii, sub=0):
    """Volume interno opaco della chioma (riempie i vuoti tra le carte viste da lontano)."""
    V, F = _icosphere(sub)
    P = np.asarray(center) + V * np.asarray(radii)
    m.add(mat, P, V, np.column_stack([V[:, 0] + V[:, 1], V[:, 2]]) * 0.5 + 0.5, F)


def mesh_spruce(rng, H=18.0, lod=0):
    m = Mesh()
    r0 = 0.30
    _tube(m, "ew_veg_bark", [[0, 0, -0.4], [0, 0, H * 0.45], [0, 0, H]], [r0, r0 * 0.55, 0.03], sides=8 if lod == 0 else 5,
          uv_c=1.0, uv_v=2.0)
    nw = 17 if lod == 0 else 8
    per = 7 if lod == 0 else 5
    z0, z1 = 1.6, H - 0.9
    R0 = 3.6
    # cono interno scuro
    _tube(m, "ew_veg_core_conifer", [[0, 0, z0 + 0.4], [0, 0, H - 1.2]], [R0 * 0.42, 0.15], sides=8 if lod == 0 else 6)
    golden = np.pi * (3 - np.sqrt(5))
    k = 0
    for wi, zk in enumerate(np.linspace(z0, z1, nw)):
        f = (zk - z0) / (z1 - z0)
        rk = R0 * (1.0 - f) ** 0.9 + 0.35
        for ci in range(per):
            phi = golden * k + ci * 2 * np.pi / per + rng.uniform(-0.2, 0.2)
            k += 1
            dvec = np.array([np.cos(phi), np.sin(phi), 0.0])
            e = np.array([-dvec[1], dvec[0], 0.0])
            alpha = np.deg2rad(24.0 if ci % 2 == 0 else -24.0)
            ew = e * np.cos(alpha) + np.array([0, 0, 1.0]) * np.sin(alpha)
            wdt = 1.25 * rk + 0.5
            rr = rk * rng.uniform(0.92, 1.1)
            if lod == 0:
                stations = [(0.1, 0.05, 0.2), (0.55 * rr, -0.05 * rr, 0.5), (rr, -0.28 * rr, 0.42)]
                uvs = [0.0, 0.55, 1.0]
            else:
                stations = [(0.1, 0.0, 0.32), (rr, -0.24 * rr, 0.46)]
                uvs = [0.0, 1.0]
            rows = []
            for rad, dz, hw in stations:
                c = dvec * rad + np.array([0, 0, zk + dz])
                rows.append((c - ew * hw * wdt, c + ew * hw * wdt))
            _card(m, "ew_veg_spruce", rows, uvs, dvec * 0.45 + np.array([0, 0, 0.9]))
    # cima
    for a in (0.0, np.pi / 3, 2 * np.pi / 3):
        u = np.array([np.cos(a), np.sin(a), 0.0])
        _card(m, "ew_veg_spruce", [(np.array([0, 0, H - 1.8]) - u * 0.45, np.array([0, 0, H - 1.8]) + u * 0.45),
                                   (np.array([0, 0, H + 0.3]) - u * 0.06, np.array([0, 0, H + 0.3]) + u * 0.06)],
              [0.0, 1.0], np.array([0, 0, 1.0]) + u * 0.2)
    _fix_winding(m)
    return m


def mesh_pine(rng, H=17.0, lod=0):
    m = Mesh()
    lean = np.array([rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0.0])
    pts = [np.array([0, 0, -0.4]), np.array([0, 0, H * 0.5]) + lean * 0.4, np.array([0, 0, H * 0.93]) + lean]
    _tube(m, "ew_veg_bark", pts, [0.32, 0.2, 0.06], sides=8 if lod == 0 else 5)
    top = pts[-1]
    ctr = np.array([0, 0, H * 0.82]) + lean * 0.85
    _core(m, "ew_veg_core_conifer", ctr + np.array([0, 0, 0.4]), (1.9, 1.9, 1.0), sub=1 if lod == 0 else 0)
    n_t = 12 if lod == 0 else 6
    for i in range(n_t):
        a = 2 * np.pi * i / n_t + rng.uniform(-0.3, 0.3)
        rad = rng.uniform(1.8, 3.4) if i % 3 else rng.uniform(0.6, 1.4)
        p = ctr + np.array([np.cos(a) * rad, np.sin(a) * rad, rng.uniform(-0.7, 1.6)])
        if lod == 0 and i % 2 == 0:
            base = ctr + (p - ctr) * 0.1 - np.array([0, 0, 1.0])
            _tube(m, "ew_veg_bark", [base, p], [0.1, 0.04], sides=4)
        size = rng.uniform(1.9, 2.6)
        out = (p - ctr) / max(np.linalg.norm(p - ctr), 1e-6)
        nrm = out * 0.5 + np.array([0, 0, 0.9])
        for u, v in ((np.array([1.0, 0, 0]), np.array([0, 1.0, 0])), (np.array([1.0, 0, 0]), np.array([0, 0, 1.0])),
                     (np.array([0, 1.0, 0]), np.array([0, 0, 1.0])))[: 3 if lod == 0 else 2]:
            _quad_card(m, "ew_veg_pine", p, u, v, size, size * 0.8, nrm)
    _quad_card(m, "ew_veg_pine", top + np.array([0, 0, 0.3]), np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), 2.0, 2.0,
               np.array([0, 0, 1.0]))
    _fix_winding(m)
    return m


def _sphere_dirs(n, rng, z_bias=0.25):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = np.pi * (1 + 5 ** 0.5) * i + rng.uniform(0, 2 * np.pi)
    d = np.column_stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)])
    d[:, 2] = d[:, 2] * (1 - z_bias) + z_bias
    return d / np.linalg.norm(d, axis=1)[:, None]


def mesh_broadleaf(rng, H=14.0, lod=0):
    """Latifoglia: tronco, branche principali e chioma a 3-4 masse irregolari."""
    m = Mesh()
    hb = H * 0.4
    _tube(m, "ew_veg_bark_grey", [[0, 0, -0.4], [0, 0, hb * 0.6], [0, 0, hb]], [0.36, 0.3, 0.24], sides=8 if lod == 0 else 5)
    s_ = H / 14.0
    n_clump = 4
    clumps = []
    for i in range(n_clump):
        a = 2 * np.pi * i / n_clump + rng.uniform(-0.5, 0.5)
        off = rng.uniform(1.4, 2.4) * s_
        c = np.array([np.cos(a) * off, np.sin(a) * off, H * rng.uniform(0.6, 0.72)])
        clumps.append((c, np.array([2.6, 2.6, 2.1]) * s_ * rng.uniform(0.85, 1.15)))
    clumps.append((np.array([0, 0, H * 0.8]), np.array([2.4, 2.4, 2.0]) * s_))
    for c, r in clumps:
        if lod == 0:
            _tube(m, "ew_veg_bark_grey", [np.array([0, 0, hb - 0.3]), (np.array([0, 0, hb]) + c) / 2, c],
                  [0.2, 0.13, 0.06], sides=5)
        _core(m, "ew_veg_core_leaf", c, r * 0.62)
        n_c = 8 if lod == 0 else 3
        for dvec in _sphere_dirs(n_c, rng):
            p = c + dvec * r * rng.uniform(0.6, 0.85)
            a = np.cross(dvec, [0, 0, 1.0])
            if np.linalg.norm(a) < 1e-3:
                a = np.array([1.0, 0, 0])
            a /= np.linalg.norm(a)
            b = np.cross(dvec, a)
            rot = rng.uniform(0, np.pi)
            u = a * np.cos(rot) + b * np.sin(rot)
            v = np.cross(dvec, u)
            sz = rng.uniform(1.7, 2.2) * s_
            _quad_card(m, "ew_veg_leaves", p, u, v, sz, sz, dvec)
    _fix_winding(m)
    return m


def mesh_bush(rng, mat="ew_veg_bush", Hb=1.7, lod=0):
    m = Mesh()
    n_v = 3 if lod == 0 else 2
    for i in range(n_v):
        a = np.pi * i / n_v + rng.uniform(-0.2, 0.2)
        u = np.array([np.cos(a), np.sin(a), 0.0])
        nrm = np.array([-u[1], u[0], 0.6])
        _quad_card(m, mat, np.array([0, 0, Hb * 0.48]), u, np.array([0, 0, 1.0]), Hb * 0.75, Hb * 0.55, nrm)
    if lod == 0:
        for i in range(4):
            a = 2 * np.pi * i / 4 + 0.4
            dvec = np.array([np.cos(a), np.sin(a), 0.7])
            dvec /= np.linalg.norm(dvec)
            u = np.array([-np.sin(a), np.cos(a), 0.0])
            v = np.cross(dvec, u)
            _quad_card(m, mat, np.array([np.cos(a) * 0.45, np.sin(a) * 0.45, Hb * 0.62]), u, v, Hb * 0.5, Hb * 0.45, dvec)
    _fix_winding(m)
    return m


def mesh_mugo(rng, lod=0):
    m = Mesh()
    n_c = 9 if lod == 0 else 4
    for i in range(n_c):
        a = 2 * np.pi * i / n_c + rng.uniform(-0.3, 0.3)
        rad = rng.uniform(0.4, 1.3)
        p = np.array([np.cos(a) * rad, np.sin(a) * rad, rng.uniform(0.5, 1.2)])
        if lod == 0:
            _tube(m, "ew_veg_bark", [[0, 0, -0.2], p * np.array([1, 1, 0.6])], [0.08, 0.04], sides=4)
        dvec = p / np.linalg.norm(p)
        u = np.array([-dvec[1], dvec[0], 0.0])
        u /= max(np.linalg.norm(u), 1e-6)
        v = np.cross(dvec, u)
        _quad_card(m, "ew_veg_pine", p, u, v, 0.9, 0.9, dvec + np.array([0, 0, 0.6]))
        _quad_card(m, "ew_veg_pine", p, u, np.array([0, 0, 1.0]), 0.8, 0.6, dvec + np.array([0, 0, 0.6]))
    _fix_winding(m)
    return m


def mesh_dead(rng, H=11.0, lod=0):
    m = Mesh()
    lean = np.array([rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0.0])
    _tube(m, "ew_veg_bark_dead", [[0, 0, -0.4], np.array([0, 0, H * 0.5]) + lean * 0.3, np.array([0, 0, H]) + lean],
          [0.28, 0.18, 0.04], sides=7 if lod == 0 else 4)
    for i in range(6 if lod == 0 else 3):
        z = rng.uniform(0.35, 0.85) * H
        a = rng.uniform(0, 2 * np.pi)
        base = np.array([0, 0, z]) + lean * z / H
        tip = base + np.array([np.cos(a), np.sin(a), 0.9]) * rng.uniform(1.4, 2.8)
        _tube(m, "ew_veg_bark_dead", [base, tip], [0.08, 0.02], sides=4)
    _fix_winding(m)
    return m


def _icosphere(sub):
    t = (1 + 5 ** 0.5) / 2
    V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
         [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6],
         [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10],
         [8, 6, 7], [9, 8, 1]]
    V = [np.array(v, dtype=np.float64) / np.linalg.norm(v) for v in V]
    for _ in range(sub):
        cache = {}
        F2 = []

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                p = V[a] + V[b]
                V.append(p / np.linalg.norm(p))
                cache[key] = len(V) - 1
            return cache[key]
        for a, b, c in F:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            F2 += [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]
        F = F2
    return np.array(V), np.array(F)


def mesh_rock(seed, sub=2):
    """Masso: icosfera deformata da rumore a bassa frequenza, base appiattita (1,5 m circa)."""
    r = np.random.default_rng(seed)
    V, F = _icosphere(sub)
    # rumore coerente: somma di armoniche casuali
    disp = np.zeros(len(V))
    for _ in range(9):
        k = r.normal(size=3) * r.uniform(1.0, 3.0)
        disp += np.sin(V @ k + r.uniform(0, 6.28)) / np.linalg.norm(k)
    disp = 1.0 + 0.25 * disp / np.abs(disp).max()
    P = V * disp[:, None] * np.array([0.9, 0.75, 0.62]) * r.uniform(0.9, 1.1)
    P[:, 2] = np.where(P[:, 2] < -0.15, -0.15 + (P[:, 2] + 0.15) * 0.25, P[:, 2])
    P[:, 2] += 0.3
    # facce orientate verso l'esterno (forma stellata rispetto al centro)
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    ctr = P.mean(0)
    inward = np.einsum("ij,ij->i", fn, P[F].mean(1) - ctr) < 0
    F = F.copy()
    F[inward, 1], F[inward, 2] = F[inward, 2].copy(), F[inward, 1].copy()
    # normali per vertice dalle facce
    N = np.zeros_like(P)
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    for j in range(3):
        np.add.at(N, F[:, j], fn)
    N /= np.linalg.norm(N, axis=1)[:, None]
    # proiezione planare obliqua: nessuna cucitura (il rumore della texture nasconde lo stiramento)
    UV = np.column_stack([P[:, 0] + 0.6 * P[:, 1], P[:, 2] + 0.4 * P[:, 1]]) * 0.8
    m = Mesh()
    m.add("ew_rock_wall", P, N, UV, F)
    return m


# ======================================================================= tipi
# In Torque3D (tsShapeEdit.cpp, updateSmallestVisibleDL) un dettaglio di dimensione N si usa
# quando l'oggetto supera N pixel, fino al dettaglio successivo; sotto il più piccolo dettaglio
# visibile resta quello, a meno che esista un nulldetail (allora l'oggetto sparisce).
# nome: (costruttore, px LOD0, px LOD1, px impostore o None, sparisce sotto la soglia minima,
#        raggio del tronco per la collisione, "self" (mesh LOD1) o None)
def _types(seed):
    rng = lambda k: np.random.default_rng(seed + k)  # noqa: E731
    tree = (300, 100, 2, False)
    small = (100, 30, 8, True)
    rock = (100, 20, None, True)
    return {
        "ew_abete": (lambda lod: mesh_spruce(rng(1), lod=lod), *tree, 0.30),
        "ew_abete_b": (lambda lod: mesh_spruce(rng(2), H=15.0, lod=lod), *tree, 0.26),
        "ew_pino": (lambda lod: mesh_pine(rng(3), lod=lod), *tree, 0.30),
        "ew_faggio": (lambda lod: mesh_broadleaf(rng(4), lod=lod), *tree, 0.34),
        "ew_faggio_b": (lambda lod: mesh_broadleaf(rng(5), H=11.0, lod=lod), *tree, 0.28),
        "ew_cespuglio": (lambda lod: mesh_bush(rng(6), lod=lod), *small, None),
        "ew_cespuglio_secco": (lambda lod: mesh_bush(rng(7), "ew_veg_bush_dry", 1.2, lod=lod), *small, None),
        "ew_mugo": (lambda lod: mesh_mugo(rng(8), lod=lod), *small, None),
        "ew_albero_secco": (lambda lod: mesh_dead(rng(9), lod=lod), *tree, 0.26),
        "ew_masso_1": (lambda lod: mesh_rock(seed + 21, 2 if lod == 0 else 1), *rock, "self"),
        "ew_masso_2": (lambda lod: mesh_rock(seed + 22, 2 if lod == 0 else 1), *rock, "self"),
        "ew_masso_3": (lambda lod: mesh_rock(seed + 23, 2 if lod == 0 else 1), *rock, "self"),
    }


def write_vegetation_shapes(level_dir: Path, level_name: str, seed: int) -> dict:
    """Scrive i .dae della vegetazione e art/forest/managedItemData.json."""
    items = {}
    stats = {}
    for name, (build, px0, px1, pxbb, vanish, col) in _types(seed).items():
        lod0, lod1 = build(0), build(1)
        if col == "self":
            colm = build(1)
        elif col:
            colm = _trunk_collision(col)
        else:
            colm = None
        path = level_dir / VEG / f"{name}.dae"
        write_dae(path, [(name, lod0, px0), (name, lod1, px1)], collision=colm,
                  null_detail_px=1 if vanish else None, autobillboard_px=pxbb)
        stats[name] = (lod0.triangle_count(), lod1.triangle_count())
        is_rock = name.startswith("ew_masso")
        item = {"name": name, "internalName": name, "class": "TSForestItemData",
                "persistentId": str(uuid.uuid5(NS, name)),
                "shapeFile": f"/levels/{level_name}/{VEG}/{name}.dae",
                "collidable": colm is not None,
                "radius": float(col) if isinstance(col, float) else (1.0 if is_rock else 0.6)}
        if not is_rock:
            item.update({"mass": 5.0 if colm is None else 60.0, "rigidity": 10.0, "tightnessCoefficient": 0.4,
                         "dampingCoefficient": 0.7, "windScale": 1.0, "trunkBendScale": 0.02,
                         "branchAmp": 0.05, "detailAmp": 0.1, "detailFreq": 0.25})
        items[name] = item
    p = level_dir / "art/forest/managedItemData.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(items, indent=2) + "\n")
    return stats


# ======================================================================= densità
def _blur_lowres(mask, sigma_cells, factor=8):
    """Sfocatura gaussiana larga calcolata a risoluzione ridotta e riportata alla griglia piena
    (equivalente per sigma >> factor, decine di volte più veloce)."""
    n = mask.shape[0]
    small = mask.astype(np.float32).reshape(n // factor, factor, n // factor, factor).mean(axis=(1, 3))
    small = ndimage.gaussian_filter(small, sigma_cells / factor)
    return ndimage.zoom(small, factor, order=1, grid_mode=True, mode="nearest").astype(np.float32)


def forest_density(g, h, lf, noise, ctx) -> dict:
    """Campi di densità [0..1] su tutta la griglia: alberi, cespugli, massi; frazione di conifere.

    ctx: core_id (strade), lake_masks, river_dist, cliff, layers (opzionale)."""
    X, Y = g.mesh(np.float32)
    hs = ndimage.gaussian_filter(h, 1.5)
    gy, gx = np.gradient(hs, g.step)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    n1 = noise.fbm(X, Y, 260.0, octaves=4, salt=811)
    n2 = noise.fbm(X, Y, 70.0, octaves=3, salt=812)
    n3 = noise.fbm(X, Y, 900.0, octaves=3, salt=813)
    n1 /= n1.std() + 1e-6
    n2 /= n2.std() + 1e-6
    n3 /= n3.std() + 1e-6
    # pesi regionali sfumati (250 m)
    region_w = {"A": 0.75, "B": 0.22, "C": 1.0, "D": 0.18, "E": 0.06, "F": 0.7}
    base = np.full(h.shape, 0.55, dtype=np.float32)
    acc = np.zeros(h.shape, dtype=np.float32)
    wsum = np.zeros(h.shape, dtype=np.float32)
    for reg in lf.get("regions", []):
        msk = _blur_lowres(polygon_mask(g, reg["poly"]), 250.0 / g.step / 2)
        acc += msk * region_w.get(reg["code"], 0.55)
        wsum += msk
    base = np.where(wsum > 0.05, (acc + base * np.maximum(0, 1 - wsum)) / np.maximum(wsum, 1.0), base)
    # macchie di bosco e radure
    patches = smoothstep(-0.55, 0.55, 0.75 * n1 + 0.35 * n2 + 0.35 * n3 + (base - 0.5) * 1.6)
    dens = (base * 0.6 + 0.4) * patches
    # quota: limite del bosco (con frange irregolari)
    ht = h + 45.0 * n2
    dens *= 1.0 - smoothstep(1420.0, 1580.0, ht)
    # pendenza
    dens *= 1.0 - smoothstep(31.0, 40.0, slope)
    dens = dens.astype(np.float32)
    conifer = smoothstep(330.0, 1050.0, h + 110.0 * n3 + 60.0 * n2).astype(np.float32)
    # esclusioni: strade (+ margine), acqua, centri abitati, strutture
    road = ctx["core_id"] >= 0
    d_road = ndimage.distance_transform_edt(~road) * g.step
    water = np.zeros(h.shape, dtype=bool)
    for lk in ctx["lake_masks"]:
        water |= lk["mask"]
    d_water = ndimage.distance_transform_edt(~water) * g.step
    rd = ctx["river_dist"]
    town = np.zeros(h.shape, dtype=np.float32)
    for fl in lf.get("flats", []):
        cx, cy = fl["center"]
        r = fl["radius"]
        dd = np.hypot(X - cx, Y - cy)
        town = np.maximum(town, 1.0 - smoothstep(r * 0.75, r * 1.15, dd))
    clear = (smoothstep(4.0, 10.0, d_road) * smoothstep(2.0, 6.0, d_water) * smoothstep(2.5, 6.0, rd)
             * (1.0 - town)).astype(np.float32)
    for (x, y, rad) in ctx.get("keepout", []):
        win = g.window(x - rad, y - rad, x + rad, y + rad)
        XX, YY = X[win], Y[win]
        clear[win] *= (np.hypot(XX - x, YY - y) > rad)
    tree = dens * clear
    # cespugli: margini del bosco, rive, prati; arbusti secchi nel territorio estremo
    edge = np.clip(ndimage.gaussian_filter(dens, 3.0) - dens, 0, 1) * 4.0 + 0.6 * dens * (1 - dens) * 4
    riparian = (1.0 - smoothstep(4.0, 22.0, np.minimum(rd, d_water))).astype(np.float32)
    meadow = 0.06 * smoothstep(0.3, 1.3, n2) * (1.0 - smoothstep(1350.0, 1500.0, ht))
    bush = np.clip(0.35 * edge + 0.45 * riparian + meadow, 0, 1) * (1.0 - smoothstep(34.0, 42.0, slope))
    dry = np.zeros(h.shape, dtype=np.float32)
    if lf.get("badlands"):
        bad = _blur_lowres(polygon_mask(g, lf["badlands"]["poly"]), 40.0)
        dry = (0.10 * bad * smoothstep(-0.3, 0.8, n2)).astype(np.float32)
    bush = (bush * clear).astype(np.float32)
    dry = (dry * clear).astype(np.float32)
    # pino mugo sopra il limite del bosco
    mugo = (smoothstep(1400.0, 1500.0, ht) * (1.0 - smoothstep(1720.0, 1800.0, ht)) * smoothstep(0.0, 1.0, n2 + 0.4)
            * (1.0 - smoothstep(30.0, 38.0, slope)) * clear * 0.35).astype(np.float32)
    rock_clear = (smoothstep(4.0, 9.0, d_road) * smoothstep(1.0, 4.0, d_water) * (1.0 - town)).astype(np.float32)
    return {"tree": tree.astype(np.float32), "conifer": conifer, "bush": bush, "dry": dry, "mugo": mugo,
            "slope": slope, "dens_raw": dens, "ht": ht.astype(np.float32), "rock_clear": rock_clear}


def rock_density(fields, layers, idx):
    """Massi sparsi: ghiaioni, pendii rocciosi poco ripidi, pascoli alti, calanchi, boschi."""
    slope = fields["slope"]
    rock = np.zeros(layers.shape, dtype=np.float32)
    rock += 0.30 * (layers == idx["ew_scree"])
    rock += 0.10 * ((layers == idx["ew_rock"]) & (slope < 50))
    rock += 0.04 * (layers == idx["ew_grass_dry"])
    rock += 0.05 * (layers == idx["ew_dirt_dusty"])
    rock += 0.02 * fields["dens_raw"]
    fields["rock"] = (rock * fields["rock_clear"]).astype(np.float32)
    return fields["rock"]


# ======================================================================= posa
def _yaw_matrix(a):
    c, s = np.cos(a), np.sin(a)
    return [round(float(c), 5), round(float(s), 5), 0, round(float(-s), 5), round(float(c), 5), 0, 0, 0, 1]


def place_vegetation(g, h, fields, seed, cell_tree=8.0, cell_bush=9.0, cell_rock=11.0, max_tree=0.92):
    """Campionamento a griglia con scarto casuale (distanza minima ~ metà cella).
    Restituisce {tipo: [(x, y, z, yaw, scala), ...]}."""
    rng = np.random.default_rng(seed + 777)
    out = {}
    size_m = g.size * g.step

    def jittered(cell):
        n = int(size_m // cell)
        iy, ix = np.mgrid[0:n, 0:n]
        x = g.x0 + (ix + 0.5 + rng.uniform(-0.42, 0.42, ix.shape)) * cell
        y = g.y0 + (iy + 0.5 + rng.uniform(-0.42, 0.42, iy.shape)) * cell
        return x.ravel(), y.ravel()

    def add(name, x, y, z, yaw, sc):
        out.setdefault(name, []).extend(zip(x.tolist(), y.tolist(), z.tolist(), yaw.tolist(), sc.tolist()))

    slope = fields["slope"]
    tan_s = np.tan(np.radians(slope))
    # ------------------------------------------------------------ alberi
    x, y = jittered(cell_tree)
    p = g.sample(fields["tree"], x, y) * max_tree
    keep = rng.random(len(x)) < p
    x, y = x[keep], y[keep]
    cf = g.sample(fields["conifer"], x, y)
    ht = g.sample(fields["ht"], x, y)
    dr = g.sample(fields["dens_raw"], x, y)
    ts = g.sample(tan_s, x, y)
    z = g.sample(h, x, y) - 0.2 - 0.6 * ts
    r = rng.random(len(x))
    p_spruce = cf * 0.78
    p_pine = cf * 0.22 + (1 - cf) * 0.08
    kind = np.where(r < p_spruce, 0, np.where(r < p_spruce + p_pine, 1, 2))
    # vicino al limite del bosco più piccoli; qualche albero secco
    near_line = smoothstep(1250.0, 1550.0, ht)
    sc = (0.72 + 0.55 * np.sqrt(rng.random(len(x)))) * (1.0 - 0.35 * near_line) * (0.85 + 0.15 * dr)
    dead = rng.random(len(x)) < (0.004 + 0.05 * near_line * (1 - dr))
    yaw = rng.uniform(0, 2 * np.pi, len(x))
    alt = rng.random(len(x)) < 0.4
    for name, sel in (("ew_abete", (kind == 0) & ~alt & ~dead), ("ew_abete_b", (kind == 0) & alt & ~dead),
                      ("ew_pino", (kind == 1) & ~dead), ("ew_faggio", (kind == 2) & ~alt & ~dead),
                      ("ew_faggio_b", (kind == 2) & alt & ~dead), ("ew_albero_secco", dead)):
        add(name, x[sel], y[sel], z[sel], yaw[sel], sc[sel])
    # ------------------------------------------------------------ arbusti
    for field, name, cell, smin, smax in (("bush", "ew_cespuglio", cell_bush, 0.6, 1.4),
                                          ("dry", "ew_cespuglio_secco", cell_bush, 0.6, 1.3),
                                          ("mugo", "ew_mugo", cell_bush, 0.7, 1.5)):
        x, y = jittered(cell)
        keep = rng.random(len(x)) < g.sample(fields[field], x, y)
        x, y = x[keep], y[keep]
        z = g.sample(h, x, y) - 0.1 - 0.3 * g.sample(tan_s, x, y)
        add(name, x, y, z, rng.uniform(0, 2 * np.pi, len(x)), rng.uniform(smin, smax, len(x)))
    # ------------------------------------------------------------ massi
    x, y = jittered(cell_rock)
    keep = rng.random(len(x)) < g.sample(fields["rock"], x, y)
    x, y = x[keep], y[keep]
    sc = 0.4 + 1.8 * rng.random(len(x)) ** 2.2
    # interrati in proporzione alla pendenza, ma mai oltre il 60% della loro altezza (~1 m x scala)
    z = g.sample(h, x, y) - np.minimum(0.25 * sc + 0.5 * sc * g.sample(tan_s, x, y), 0.6 * sc)
    kind = rng.integers(0, 3, len(x))
    yaw = rng.uniform(0, 2 * np.pi, len(x))
    for k in range(3):
        sel = kind == k
        add(f"ew_masso_{k + 1}", x[sel], y[sel], z[sel], yaw[sel], sc[sel])
    return out


def apply_keepout(placed: dict, g, keepout) -> dict:
    """Toglie le istanze che cadono nelle zone [x, y, raggio] riservate dai moduli (edifici, piazzali...)."""
    if not keepout:
        return placed
    mask = np.zeros((g.size, g.size), dtype=bool)
    for x, y, r in keepout:
        win = g.window(x - r, y - r, x + r, y + r)
        X, Y = g.window_mesh(win)
        mask[win] |= (X - x) ** 2 + (Y - y) ** 2 <= r * r
    out = {}
    for name, items in placed.items():
        if not items:
            out[name] = items
            continue
        a = np.asarray(items, dtype=np.float64)
        ix = np.clip(np.rint((a[:, 0] - g.x0) / g.step).astype(int), 0, g.size - 1)
        iy = np.clip(np.rint((a[:, 1] - g.y0) / g.step).astype(int), 0, g.size - 1)
        keep = ~mask[iy, ix]
        out[name] = [tuple(v) for v in a[keep].tolist()]
    return out


def write_forest(level_dir: Path, placed: dict) -> dict:
    """forest/<tipo>.forest4.json (una riga per istanza)."""
    d = level_dir / "forest"
    d.mkdir(parents=True, exist_ok=True)
    counts = {}
    for name, items in placed.items():
        if not items:
            continue
        with open(d / f"{name}.forest4.json", "w") as f:
            for x, y, z, yaw, sc in items:
                f.write(json.dumps({"pos": [round(x, 2), round(y, 2), round(z, 2)], "rotationMatrix": _yaw_matrix(yaw),
                                    "scale": round(sc, 3), "type": name}, separators=(",", ":")) + "\n")
        counts[name] = len(items)
    return counts
