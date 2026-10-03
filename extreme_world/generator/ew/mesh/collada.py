"""Costruzione di mesh e scrittura in Collada 1.4.1 (.dae) per BeamNG.

Gerarchia dei nodi (documentazione BeamNG sull'esportazione DAE):
    base00
      start01
        <nome>_a<px>      mesh visibili; il numero finale è la dimensione in pixel del LOD
        Colmesh-1         mesh di collisione (facoltativa)
      nulldetail<px>      (facoltativo) sotto questa dimensione l'oggetto non si disegna
Il nome dei materiali nel DAE coincide con il `mapTo` di un Material in *.materials.json.
Asse Z verso l'alto, unità metro.
"""

from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np


class Mesh:
    """Triangoli raggruppati per materiale, con normali e UV per vertice."""

    def __init__(self):
        self.parts: dict[str, dict] = {}

    def _part(self, mat):
        if mat not in self.parts:
            self.parts[mat] = {"p": [], "n": [], "uv": [], "i": [], "count": 0}
        return self.parts[mat]

    def add(self, mat, P, N, UV, tris):
        """Aggiunge vertici (k,3), normali (k,3), uv (k,2) e triangoli (m,3) con indici locali."""
        part = self._part(mat)
        base = part["count"]
        part["p"].append(np.asarray(P, dtype=np.float64))
        part["n"].append(np.asarray(N, dtype=np.float64))
        part["uv"].append(np.asarray(UV, dtype=np.float64))
        part["i"].append(np.asarray(tris, dtype=np.int64) + base)
        part["count"] += len(P)

    def add_quad(self, mat, a, b, c, d, uv=None):
        """Quadrilatero a-b-c-d (antiorario visto dal lato della faccia)."""
        P = np.array([a, b, c, d], dtype=np.float64)
        n = np.cross(P[1] - P[0], P[2] - P[0])
        ln = np.linalg.norm(n)
        n = n / ln if ln > 1e-12 else np.array([0, 0, 1.0])
        if uv is None:
            uv = [[0, 0], [1, 0], [1, 1], [0, 1]]
        self.add(mat, P, np.repeat(n[None, :], 4, 0), uv, [[0, 1, 2], [0, 2, 3]])

    def add_box(self, mat, center, size, yaw=0.0, uv_scale=2.0):
        """Parallelepipedo con facce a normali piatte; UV in metri / uv_scale."""
        cx, cy, cz = center
        sx, sy, sz = np.asarray(size) / 2.0
        c, s = np.cos(yaw), np.sin(yaw)
        R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        corners = np.array([[x, y, z] for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)])
        W = corners @ R.T + np.array([cx, cy, cz])
        # ordine dei vertici antiorario visto da fuori: normale geometrica verso l'esterno
        faces = [(0, 2, 3, 1, sx, sy), (4, 5, 7, 6, sx, sy), (0, 1, 5, 4, sx, sz), (2, 6, 7, 3, sx, sz),
                 (0, 4, 6, 2, sy, sz), (1, 3, 7, 5, sy, sz)]
        for a, b, cc, d, du, dv in faces:
            u = 2 * du / uv_scale
            v = 2 * dv / uv_scale
            self.add_quad(mat, W[a], W[b], W[cc], W[d], uv=[[0, 0], [u, 0], [u, v], [0, v]])

    def sweep(self, mat, path, profile, up=None, closed_profile=False, uv_scale=2.0, caps=False):
        """Estrude un profilo 2D (k,2) in coordinate (laterale, verticale) lungo un percorso (n,3).

        Il laterale è a sinistra della direzione di marcia. Le normali sono calcolate per faccia
        (ombreggiatura piatta lungo il profilo, liscia lungo il percorso)."""
        path = np.asarray(path, dtype=np.float64)
        prof = np.asarray(profile, dtype=np.float64)
        n = len(path)
        t = np.gradient(path[:, :2], axis=0)
        t /= np.maximum(np.linalg.norm(t, axis=1), 1e-9)[:, None]
        left = np.column_stack([-t[:, 1], t[:, 0], np.zeros(n)])
        upv = np.array([0, 0, 1.0]) if up is None else None
        k = len(prof)
        segs = k if closed_profile else k - 1
        s_along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
        for j in range(segs):
            a = prof[j]
            b = prof[(j + 1) % k]
            pa = path + left * a[0] + (upv if upv is not None else up) * a[1]
            pb = path + left * b[0] + (upv if upv is not None else up) * b[1]
            P = np.vstack([pa, pb])
            seglen = float(np.hypot(*(b - a)))
            UV = np.vstack([np.column_stack([s_along / uv_scale, np.zeros(n)]),
                            np.column_stack([s_along / uv_scale, np.full(n, seglen / uv_scale)])])
            # normale del segmento di profilo, ruotata lungo il percorso
            dl, dz = b - a
            nl, nz = dz, -dl
            ln = np.hypot(nl, nz) or 1.0
            nl, nz = nl / ln, nz / ln
            Nv = left * nl + np.array([0, 0, 1.0]) * nz
            N = np.vstack([Nv, Nv])
            # ordine dei vertici coerente con la normale assegnata (lato visibile = lato normale)
            tris = []
            for i in range(n - 1):
                tris.append([i, n + i + 1, i + 1])
                tris.append([i, n + i, n + i + 1])
            self.add(mat, P, N, UV, tris)
        if caps and not closed_profile:
            pass

    def prism(self, mat, base_center, radius, height, sides=8, uv_scale=2.0, top=True):
        """Prisma verticale (pilastri, tronchi, pali)."""
        cx, cy, cz = base_center
        ang = np.linspace(0, 2 * np.pi, sides + 1)
        ring = np.column_stack([cx + radius * np.cos(ang), cy + radius * np.sin(ang)])
        for i in range(sides):
            a, b = ring[i], ring[i + 1]
            self.add_quad(mat, [a[0], a[1], cz], [b[0], b[1], cz], [b[0], b[1], cz + height], [a[0], a[1], cz + height],
                          uv=[[0, 0], [radius * 2 * np.pi / sides / uv_scale, 0],
                              [radius * 2 * np.pi / sides / uv_scale, height / uv_scale], [0, height / uv_scale]])
        if top:
            P = [[cx, cy, cz + height]] + [[r[0], r[1], cz + height] for r in ring[:-1]]
            tris = [[0, i + 1, (i + 1) % sides + 1] for i in range(sides)]
            self.add(mat, P, [[0, 0, 1]] * len(P), [[0.5, 0.5]] * len(P), tris)

    def signed_volume(self):
        """Volume con segno (positivo se le facce di una mesh chiusa guardano all'esterno)."""
        v = 0.0
        for part in self.parts.values():
            for P, I in zip(part["p"], part["i"]):
                local = I - (I.min() if len(I) else 0)
                a, b, c = P[local[:, 0]], P[local[:, 1]], P[local[:, 2]]
                v += float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) / 6.0
        return v

    def winding_consistency(self):
        """Frazione di triangoli la cui normale geometrica concorda con le normali assegnate."""
        ok = tot = 0
        for part in self.parts.values():
            for P, N, I in zip(part["p"], part["n"], part["i"]):
                local = I - (I.min() if len(I) else 0)
                a, b, c = P[local[:, 0]], P[local[:, 1]], P[local[:, 2]]
                gn = np.cross(b - a, c - a)
                nn = N[local[:, 0]] + N[local[:, 1]] + N[local[:, 2]]
                d = np.einsum("ij,ij->i", gn, nn)
                ok += int((d > 0).sum())
                tot += len(d)
        return ok / max(tot, 1)

    def triangle_count(self):
        return sum(sum(len(i) for i in p["i"]) for p in self.parts.values())

    def bounds(self):
        allp = np.vstack([np.vstack(p["p"]) for p in self.parts.values() if p["p"]])
        return allp.min(0), allp.max(0)


def _floats(a, fmt="%.4f"):
    return " ".join(fmt % v for v in np.asarray(a).ravel())


def write_dae(path: Path, lods: list, collision: Mesh | None = None, null_detail_px: int | None = None,
              autobillboard_px: int | None = None):
    """lods: lista di (nome, Mesh, pixel). Scrive un DAE con la gerarchia BeamNG."""
    geoms = []
    materials = set()
    nodes_start = []

    def geometry(gid, mesh: Mesh):
        """Una sola sorgente di posizioni/normali/UV e un solo <vertices> per mesh (specifica
        Collada); un blocco <triangles> per materiale."""
        Ps, Ns, UVs, blocks = [], [], [], []
        base = 0
        for mat, part in mesh.parts.items():
            if not part["p"]:
                continue
            materials.add(mat)
            P = np.vstack(part["p"])
            Ps.append(P)
            Ns.append(np.vstack(part["n"]))
            UVs.append(np.vstack(part["uv"]))
            blocks.append((mat, np.vstack(part["i"]) + base))
            base += len(P)
        P = np.vstack(Ps)
        N = np.vstack(Ns)
        UV = np.vstack(UVs)
        sid = gid
        out = [f'<geometry id="{gid}-mesh" name="{gid}"><mesh>']
        out.append(f'<source id="{sid}-pos"><float_array id="{sid}-pos-a" count="{P.size}">{_floats(P)}</float_array>'
                   f'<technique_common><accessor source="#{sid}-pos-a" count="{len(P)}" stride="3">'
                   '<param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>'
                   '</accessor></technique_common></source>')
        out.append(f'<source id="{sid}-nrm"><float_array id="{sid}-nrm-a" count="{N.size}">{_floats(N)}</float_array>'
                   f'<technique_common><accessor source="#{sid}-nrm-a" count="{len(N)}" stride="3">'
                   '<param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>'
                   '</accessor></technique_common></source>')
        out.append(f'<source id="{sid}-uv"><float_array id="{sid}-uv-a" count="{UV.size}">{_floats(UV)}</float_array>'
                   f'<technique_common><accessor source="#{sid}-uv-a" count="{len(UV)}" stride="2">'
                   '<param name="S" type="float"/><param name="T" type="float"/>'
                   '</accessor></technique_common></source>')
        out.append(f'<vertices id="{sid}-vtx"><input semantic="POSITION" source="#{sid}-pos"/></vertices>')
        for mat, I in blocks:
            idx = np.repeat(I.ravel()[:, None], 3, axis=1).ravel()
            out.append(f'<triangles material="{escape(mat)}" count="{len(I)}">'
                       f'<input semantic="VERTEX" source="#{sid}-vtx" offset="0"/>'
                       f'<input semantic="NORMAL" source="#{sid}-nrm" offset="1"/>'
                       f'<input semantic="TEXCOORD" source="#{sid}-uv" offset="2" set="0"/>'
                       f'<p>{" ".join(map(str, idx))}</p></triangles>')
        out.append("</mesh></geometry>")
        geoms.append("".join(out))
        return [m for m, _ in blocks]

    def instance(gid, mats):
        binds = "".join(f'<instance_material symbol="{escape(m)}" target="#{escape(m)}"/>' for m in mats)
        return f'<instance_geometry url="#{gid}-mesh"><bind_material><technique_common>{binds}</technique_common></bind_material></instance_geometry>'

    for name, mesh, px in lods:
        gid = f"{name}_a{int(px)}"
        mats = list(geometry(gid, mesh))
        nodes_start.append(f'<node id="{gid}" name="{gid}" type="NODE">{instance(gid, mats)}</node>')
    if collision is not None:
        mats = list(geometry("Colmesh-1", collision))
        nodes_start.append(f'<node id="Colmesh-1" name="Colmesh-1" type="NODE">{instance("Colmesh-1", mats)}</node>')
    base_children = [f'<node id="start01" name="start01" type="NODE">{"".join(nodes_start)}</node>']
    if null_detail_px:
        base_children.append(f'<node id="nulldetail{null_detail_px}" name="nulldetail{null_detail_px}" type="NODE"/>')
    if autobillboard_px:
        base_children.append(f'<node id="bb_autobillboard{autobillboard_px}" name="bb_autobillboard{autobillboard_px}" type="NODE"/>')
    effects = "".join(f'<effect id="{escape(m)}-fx"><profile_COMMON><technique sid="common"><lambert>'
                      f'<diffuse><color>0.8 0.8 0.8 1</color></diffuse></lambert></technique></profile_COMMON></effect>'
                      for m in sorted(materials))
    mats_xml = "".join(f'<material id="{escape(m)}" name="{escape(m)}"><instance_effect url="#{escape(m)}-fx"/></material>'
                       for m in sorted(materials))
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">'
           '<asset><contributor><authoring_tool>Extreme World generator</authoring_tool></contributor>'
           '<unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>'
           f'<library_effects>{effects}</library_effects>'
           f'<library_materials>{mats_xml}</library_materials>'
           f'<library_geometries>{"".join(geoms)}</library_geometries>'
           '<library_visual_scenes><visual_scene id="Scene" name="Scene">'
           f'<node id="base00" name="base00" type="NODE">{"".join(base_children)}</node>'
           '</visual_scene></library_visual_scenes>'
           '<scene><instance_visual_scene url="#Scene"/></scene></COLLADA>\n')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(xml)
    return path
