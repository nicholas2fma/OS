"""Contesto di sviluppo: carica il pickle prodotto da `build.py --dump-ctx` e prepara gli
oggetti che i moduli della build ricevono (scena, writer delle strutture, cartella del livello),
così un modulo si prova da solo su terreno e strade reali senza rifare la build completa.

Uso tipico in uno script di prova:
    from ew.devctx import load_ctx, finish
    ctx = load_ctx("/percorso/agent_ctx.pkl", Path("/tmp/prova/levels/extreme_world"))
    out = mio_modulo.run(ctx)
    finish(ctx, out.get("materials", {}))
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

from .level.scene import SceneWriter
from .noise import Noise
from .structures import StructureWriter


def load_ctx(pkl: str | Path, level_dir: Path) -> dict:
    with open(pkl, "rb") as f:
        d = pickle.load(f)
    name = d["world"]["level_name"]
    level_dir = Path(level_dir)
    level_dir.mkdir(parents=True, exist_ok=True)
    scene = SceneWriter(name)
    d.update({
        "level_dir": level_dir, "level_name": name, "seed": d["world"]["seed"], "scene": scene,
        "sw": StructureWriter(level_dir, name, scene, d["g"], d["h"]),
        "noise": Noise(d["world"]["seed"]),
    })
    return d


def finish(ctx: dict, materials: dict | None = None) -> list:
    """Scrive la scena e (se presenti) i materiali del modulo nella cartella di prova."""
    written = ctx["scene"].write(ctx["level_dir"])
    if materials:
        p = ctx["level_dir"] / "art/shapes/ew/module.materials.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(materials, indent=2) + "\n")
    return written
