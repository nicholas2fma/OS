"""Scrittura della scena di un livello BeamNG (main/**/items.level.json).

Struttura (verificata su un livello salvato dal World Editor):
  main/items.level.json                      -> la sola riga del SimGroup "MissionGroup"
  main/MissionGroup/items.level.json         -> figli diretti (sotto-gruppi e oggetti)
  main/MissionGroup/<G>/items.level.json     -> figli del gruppo G, e così via
Ogni riga è un oggetto JSON completo con class, persistentId e __parent.
"""

from __future__ import annotations

import json
import math
import uuid
from pathlib import Path

NAMESPACE = uuid.UUID("6f1d2b3e-6c1f-4b8e-9a51-0e7e57e3e0a1")
FIRST_KEYS = ("name", "internalName", "class", "persistentId", "__parent", "position")


def _round(v, nd=4):
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            raise ValueError("valore non finito nella scena")
        r = round(v, nd)
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    if isinstance(v, (list, tuple)):
        return [_round(x, nd) for x in v]
    if isinstance(v, dict):
        return {k: _round(x, nd) for k, x in v.items()}
    if hasattr(v, "item"):  # scalari numpy
        return _round(v.item(), nd)
    return v


def ordered(obj: dict) -> dict:
    out = {k: obj[k] for k in FIRST_KEYS if k in obj}
    for k in sorted(obj):
        if k not in out:
            out[k] = obj[k]
    return out


class SceneWriter:
    def __init__(self, level_name: str):
        self.level = level_name
        self.groups: dict[str, list] = {"MissionGroup": []}   # percorso -> oggetti figli
        self.counter = 0

    def pid(self, key: str) -> str:
        return str(uuid.uuid5(NAMESPACE, f"{self.level}/{key}"))

    def group(self, path: str) -> str:
        """Crea (se serve) la catena di SimGroup per `path` (es. "MissionGroup/roads/A1")."""
        parts = path.split("/")
        assert parts[0] == "MissionGroup"
        for i in range(1, len(parts)):
            p = "/".join(parts[: i + 1])
            if p not in self.groups:
                parent = "/".join(parts[:i])
                self.groups[p] = []
                self.groups[parent].append({"name": parts[i], "class": "SimGroup", "persistentId": self.pid(p),
                                            "__parent": parts[i - 1], "__group__": True})
        return path

    def add(self, path: str, obj: dict) -> dict:
        self.group(path)
        o = dict(obj)
        self.counter += 1
        key = f"{path}/{o.get('name') or o.get('internalName') or ''}/{o['class']}/{self.counter}"
        o.setdefault("persistentId", self.pid(key))
        o["__parent"] = path.split("/")[-1]
        self.groups[path].append(o)
        return o

    def count(self) -> int:
        return sum(len([o for o in v if not o.get("__group__")]) for v in self.groups.values())

    def write(self, level_dir: Path) -> list[Path]:
        main = level_dir / "main"
        written = []
        root = {"name": "MissionGroup", "class": "SimGroup", "persistentId": self.pid("MissionGroup")}
        main.mkdir(parents=True, exist_ok=True)
        (main / "items.level.json").write_text(json.dumps(root, separators=(",", ":")) + "\n")
        written.append(main / "items.level.json")
        for path, objs in self.groups.items():
            if not objs:
                continue
            d = main.joinpath(*path.split("/"))
            d.mkdir(parents=True, exist_ok=True)
            lines = []
            for o in objs:
                o = {k: v for k, v in o.items() if k != "__group__"}
                lines.append(json.dumps(ordered(_round(o)), separators=(",", ":"), ensure_ascii=True))
            f = d / "items.level.json"
            f.write_text("\n".join(lines) + "\n")
            written.append(f)
        return written
