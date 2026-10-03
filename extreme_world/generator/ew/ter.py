"""Lettura e scrittura del terreno BeamNG (.ter versione 8) e del file .terrain.json.

Layout verificato byte per byte su un livello salvato dal World Editor (vedi
docs/FORMATI_BEAMNG.md):

    u8   version (8)
    u32  size
    u16  heightMap[size*size]       indice x + y*size, origine in (x min, y min)
    u8   layerMap[size*size]        indice materiale, 255 = buco
    u8   layerTextureMap[4*size*size]  materiali dei 4 angoli di ogni quadrato
    u32  numero materiali
    per ogni materiale: u8 lunghezza + caratteri ASCII
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

TER_VERSION = 8
HOLE = 255
BINARY_FORMAT = (
    "version(char), size(unsigned int), heightMap(heightMapSize * heightMapItemSize), "
    "layerMap(layerMapSize * layerMapItemSize), layerTextureMap(layerMapSize * layerMapItemSize), "
    "materialNames"
)


@dataclass
class TerData:
    version: int
    size: int
    heights: np.ndarray          # (size, size) uint16, [y, x]
    layers: np.ndarray           # (size, size) uint8, [y, x]
    layer_texture: np.ndarray    # (size*size, 4) uint8
    materials: list[str]


def heights_to_u16(heights_m: np.ndarray, max_height: float, z_offset: float = 0.0) -> np.ndarray:
    """Converte altezze in metri nei valori u16 usati dal TerrainBlock."""
    h = (np.asarray(heights_m, dtype=np.float64) - z_offset) / max_height * 65535.0
    return np.clip(np.rint(h), 0, 65535).astype(np.uint16)


def u16_to_heights(h: np.ndarray, max_height: float, z_offset: float = 0.0) -> np.ndarray:
    return h.astype(np.float64) * (max_height / 65535.0) + z_offset


def build_layer_texture(layers: np.ndarray) -> np.ndarray:
    """Materiali dei quattro angoli di ogni quadrato: indici lineari i, i+1, i+size, i+size+1
    (con clamp alla fine dell'array). Riproduce esattamente il file salvato dal World Editor."""
    size = layers.shape[0]
    n = size * size
    flat = np.ascontiguousarray(layers).reshape(n)
    idx = np.arange(n)
    cols = [flat] + [flat[np.minimum(idx + off, n - 1)] for off in (1, size, size + 1)]
    return np.stack(cols, axis=1).astype(np.uint8)


def write_ter(path: Path, heights_u16: np.ndarray, layers: np.ndarray, materials: list[str],
              layer_texture: np.ndarray | None = None) -> None:
    size = heights_u16.shape[0]
    if heights_u16.shape != (size, size) or layers.shape != (size, size):
        raise ValueError("heightmap e layermap devono essere quadrati e della stessa dimensione")
    if size & (size - 1):
        raise ValueError("la dimensione del terreno deve essere una potenza di 2")
    if heights_u16.dtype != np.uint16 or layers.dtype != np.uint8:
        raise TypeError("heightmap uint16 e layermap uint8 richiesti")
    used = np.unique(layers)
    bad = used[(used != HOLE) & (used >= len(materials))]
    if bad.size:
        raise ValueError(f"indici di materiale senza nome: {bad.tolist()}")
    for name in materials:
        raw = name.encode("ascii")
        if not 0 < len(raw) < 256:
            raise ValueError(f"nome materiale non valido: {name!r}")

    n = size * size
    if layer_texture is None:
        layer_texture = build_layer_texture(layers)
    if layer_texture.shape != (n, 4) or layer_texture.dtype != np.uint8:
        raise ValueError("layerTextureMap deve essere (size*size, 4) uint8")

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<BI", TER_VERSION, size))
        f.write(heights_u16.astype("<u2", copy=False).tobytes(order="C"))
        f.write(layers.tobytes(order="C"))
        f.write(np.ascontiguousarray(layer_texture).tobytes(order="C"))
        f.write(struct.pack("<I", len(materials)))
        for name in materials:
            raw = name.encode("ascii")
            f.write(struct.pack("<B", len(raw)))
            f.write(raw)


def read_ter(path: Path) -> TerData:
    data = Path(path).read_bytes()
    version = data[0]
    if version != TER_VERSION:
        raise ValueError(f"versione .ter non supportata: {version}")
    size = struct.unpack_from("<I", data, 1)[0]
    n = size * size
    off = 5
    heights = np.frombuffer(data, dtype="<u2", count=n, offset=off).reshape(size, size)
    off += 2 * n
    layers = np.frombuffer(data, dtype=np.uint8, count=n, offset=off).reshape(size, size)
    off += n
    layer_texture = np.frombuffer(data, dtype=np.uint8, count=4 * n, offset=off).reshape(n, 4)
    off += 4 * n
    count = struct.unpack_from("<I", data, off)[0]
    off += 4
    materials = []
    for _ in range(count):
        ln = data[off]
        off += 1
        materials.append(data[off:off + ln].decode("ascii"))
        off += ln
    if off != len(data):
        raise ValueError(f"byte in eccesso alla fine del file .ter: {len(data) - off}")
    return TerData(version, size, heights, layers, layer_texture, materials)


def terrain_json(level_name: str, ter_name: str, size: int, materials: list[str]) -> dict:
    n = size * size
    stem = ter_name[:-4] if ter_name.endswith(".ter") else ter_name
    return {
        "binaryFormat": BINARY_FORMAT,
        "datafile": f"/levels/{level_name}/{ter_name}",
        "heightMapItemSize": 2,
        "heightMapSize": n,
        "heightmapImage": f"/levels/{level_name}/{stem}.terrainheightmap.png",
        "layerMapItemSize": 1,
        "layerMapSize": n,
        "materials": list(materials),
        "size": size,
        "version": TER_VERSION,
    }


def write_terrain_json(path: Path, level_name: str, ter_name: str, size: int, materials: list[str]) -> None:
    path.write_text(json.dumps(terrain_json(level_name, ter_name, size, materials), indent=2) + "\n")
