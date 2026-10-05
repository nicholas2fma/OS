#!/usr/bin/env python3
"""Prova di un modulo della build sul contesto salvato da `build.py --dump-ctx`.

Uso:
    python run_module.py <modulo> <contesto.pkl> <cartella_build_di_prova> [--copy <build_di_base>]

Con --copy la cartella del livello di base viene copiata prima (per l'anteprima 3D con
tools/preview3d/export_scene.py, che legge tutti gli items.level.json). Il modulo scrive le sue
mesh e la sua scena nella cartella di prova; poi lo script controlla: nessuna eccezione, ogni
.dae valido per pycollada, orientamento delle facce, quote degli oggetti rispetto al terreno.
"""

import argparse
import importlib
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "generator"))

from ew.devctx import finish, load_ctx  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("module")
    ap.add_argument("ctx")
    ap.add_argument("out")
    ap.add_argument("--copy", default=None)
    a = ap.parse_args()
    out = Path(a.out)
    lvl = out / "levels" / "extreme_world"
    if a.copy:
        if lvl.exists():
            shutil.rmtree(lvl)
        shutil.copytree(Path(a.copy) / "levels" / "extreme_world", lvl)
    t0 = time.time()
    ctx = load_ctx(a.ctx, lvl)
    h_before = ctx["h"].copy()
    lay_before = ctx["layers"].copy()
    mod = importlib.import_module(f"ew.{a.module}")
    res = mod.run(ctx) or {}
    finish(ctx, res.get("materials", {}))
    print(f"modulo {a.module}: {time.time() - t0:.1f} s")
    print("statistiche:", json.dumps(res.get("stats", {}), ensure_ascii=False))
    dh = np.abs(ctx["h"] - h_before)
    core = ctx["road_masks"]["core_id"] >= 0
    print(f"terreno modificato: {int((dh > 0.01).sum())} vertici, max {dh.max():.2f} m; "
          f"sulle piattaforme stradali: {int(((dh > 0.01) & core).sum())}")
    print(f"layer ridipinti: {int((ctx['layers'] != lay_before).sum())} vertici; "
          f"su piattaforme: {int(((ctx['layers'] != lay_before) & core).sum())}")
    print(f"zone senza vegetazione: {len(res.get('keepout', []))}")
    if not np.isfinite(ctx["h"]).all():
        print("ERRORE: quote non finite")
    # mesh
    import collada
    from ew.level.objmaterials import SURF
    import tempfile
    from ew.vegetation import write_vegetation_textures
    with tempfile.TemporaryDirectory() as td:
        vmats = write_vegetation_textures(Path(td), "extreme_world", 1)
    mats = set(res.get("materials", {})) | set(SURF) | set(vmats)
    tris = 0
    bad = 0
    objs = [o for objs in ctx["scene"].groups.values() for o in objs]
    for o in objs:
        if o.get("class") != "TSStatic":
            continue
        p = lvl / o["shapeName"].replace("/levels/extreme_world/", "")
        d = collada.Collada(str(p))
        for m in d.materials:
            if m.id not in mats:
                print(f"ERRORE: {p.name}: materiale {m.id} non definito")
                bad += 1
        for geo in d.geometries:
            for prim in geo.primitives:
                tris += len(prim)
                tri = prim.vertex[prim.vertex_index]
                nrm = prim.normal[prim.normal_index].mean(axis=1)
                gn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
                ok = (np.einsum("ij,ij->i", gn, nrm) >= -1e-9).mean()
                if ok < 0.98:
                    print(f"AVVISO: {p.name}/{geo.id}: facce concordi con le normali {ok:.3f}")
        x, y, z = o["position"]
        zt = float(ctx["g"].sample(ctx["h"], x, y))
        if abs(z - zt) > 25:
            print(f"AVVISO: {o['name']} origine a {z - zt:+.1f} m dal terreno")
    print(f"TSStatic {sum(1 for o in objs if o.get('class') == 'TSStatic')}, triangoli totali (tutti i LOD) {tris}, errori {bad}")


if __name__ == "__main__":
    main()
