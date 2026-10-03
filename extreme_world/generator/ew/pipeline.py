"""Orchestrazione della build per stadi, con cache su disco degli stadi costosi."""

from __future__ import annotations

import hashlib
import json
import pickle
import time
from pathlib import Path

import numpy as np

from .noise import Noise
from .terrain import TerrainBuilder
from .water import WaterBuilder

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config"


def load_json(name: str) -> dict:
    return json.loads((CONFIG / name).read_text())


def _digest(*objs) -> str:
    h = hashlib.sha1()
    for o in objs:
        h.update(json.dumps(o, sort_keys=True).encode())
    return h.hexdigest()[:12]


class Context:
    """Stato condiviso della build."""

    def __init__(self, build_dir: Path | None = None, macro_res: int | None = None):
        self.world = load_json("world.json")
        self.landforms = load_json("landforms.json")
        if macro_res:
            self.world["terrain"]["macro_size"] = macro_res
        self.build_dir = Path(build_dir or (ROOT / "build"))
        self.cache_dir = self.build_dir / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.noise = Noise(self.world["seed"])
        self.t0 = time.time()

    def log(self, msg):
        print(f"[{time.time() - self.t0:7.1f}s] {msg}", flush=True)

    def cached(self, name: str, key: str, fn):
        """Esegue fn() solo se la cache per (name, key) non esiste."""
        path = self.cache_dir / f"{name}-{key}.pkl"
        if path.exists():
            self.log(f"cache: {path.name}")
            with open(path, "rb") as f:
                return pickle.load(f)
        out = fn()
        with open(path, "wb") as f:
            pickle.dump(out, f, protocol=pickle.HIGHEST_PROTOCOL)
        return out


def _code_digest(*modules) -> str:
    h = hashlib.sha1()
    for m in modules:
        h.update(Path(m.__file__).read_bytes())
    return h.hexdigest()[:8]


def stage_terrain(ctx: Context) -> dict:
    """Rilievo naturale + canyon + laghi + invaso + fiumi a piena risoluzione."""
    from . import erosion, terrain, water, noise, geom

    key = _digest(ctx.world, ctx.landforms) + _code_digest(erosion, terrain, water, noise, geom)
    macro_keys = ("base_control_points", "peaks", "ridges", "valleys", "plateaus", "badlands", "lakes")
    macro_key = _digest(ctx.world, {k: ctx.landforms.get(k) for k in macro_keys}) + _code_digest(erosion, terrain, noise, geom)

    def run():
        tb = TerrainBuilder(ctx.world, ctx.landforms)
        macro = ctx.cached("macro", macro_key, tb.build_macro)
        full = tb.refine(macro)
        g, h = full["grid"], full["h"]
        h = water.apply_flats(ctx.landforms, ctx.noise, g, h)
        wb = WaterBuilder(ctx.landforms, ctx.noise)
        h, canyon_rock = wb.carve_canyons(g, h)
        h = wb.carve_lakes(g, h)
        h = wb.carve_reservoir(g, h)
        h = wb.carve_rivers(g, h)
        return {"grid": g, "h": h.astype(np.float32), "cliff": full["cliff"], "mountain": full["mountain"],
                "canyon_rock": canyon_rock, "lakes": wb.lakes, "rivers": wb.rivers, "dam": wb.dam}

    return ctx.cached("terrain", key, run)
