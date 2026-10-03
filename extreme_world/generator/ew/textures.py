"""Texture procedurali PBR (colore, normale, rugosità, occlusione, altezza), tutte ripetibili.

Il rumore è sintetizzato nel dominio delle frequenze (spettro a legge di potenza con fasi
casuali): una FFT inversa produce un'immagine automaticamente periodica, quindi le texture si
ripetono senza cuciture. Nessuna immagine esterna viene usata.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree


class TexGen:
    def __init__(self, seed: int):
        self.seed = seed

    def rng(self, salt):
        return np.random.default_rng((self.seed * 1000003 + salt) & 0xFFFFFFFF)

    # ------------------------------------------------------------- rumori
    def spectral(self, n, beta=2.0, salt=0, fmin=1.0, fmax=None, aniso=(1.0, 1.0)):
        """Rumore periodico n x n con spettro ~ 1/f^beta, normalizzato a media 0, dev. 1."""
        r = self.rng(salt)
        fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]
        fx = np.fft.fftfreq(n)[None, :] * n * aniso[0]
        f = np.sqrt(fx * fx + fy * fy)
        amp = np.where(f >= fmin, 1.0 / np.maximum(f, 1e-6) ** (beta / 2.0), 0.0)
        if fmax:
            amp *= np.exp(-(f / fmax) ** 2)
        phase = r.uniform(0, 2 * np.pi, (n, n))
        spec = amp * np.exp(1j * phase)
        img = np.real(np.fft.ifft2(spec))
        img -= img.mean()
        img /= img.std() + 1e-9
        return img

    def cells(self, n, count, salt=0, jitter=1.0):
        """Rumore cellulare periodico: (F1, F2, id cella) normalizzati sulla dimensione media delle celle."""
        r = self.rng(salt)
        pts = r.uniform(0, n, (count, 2))
        tiles = [pts + np.array([dx, dy]) * n for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
        allp = np.vstack(tiles)
        ids = np.tile(np.arange(count), 9)
        tree = cKDTree(allp)
        yy, xx = np.mgrid[0:n, 0:n]
        q = np.column_stack([xx.ravel() + 0.5, yy.ravel() + 0.5])
        d, i = tree.query(q, k=2)
        cell = n / np.sqrt(count)
        f1 = (d[:, 0] / cell).reshape(n, n)
        f2 = (d[:, 1] / cell).reshape(n, n)
        cid = ids[i[:, 0]].reshape(n, n)
        return f1, f2, cid

    # --------------------------------------------------------- conversioni
    @staticmethod
    def normal_from_height(hgt, strength=2.0):
        """Mappa normale (RGB 0..255) da un'altezza periodica."""
        gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * strength
        gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5 * strength
        nz = np.ones_like(hgt)
        ln = np.sqrt(gx * gx + gy * gy + nz * nz)
        nx, ny, nz = -gx / ln, gy / ln, nz / ln
        rgb = np.stack([nx, ny, nz], -1) * 0.5 + 0.5
        return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)

    @staticmethod
    def to_u8(x, lo=None, hi=None):
        lo = x.min() if lo is None else lo
        hi = x.max() if hi is None else hi
        return (np.clip((x - lo) / max(hi - lo, 1e-9), 0, 1) * 255).astype(np.uint8)

    @staticmethod
    def colorize(t, stops):
        """t in 0..1 -> RGB interpolando una lista di (posizione, (r,g,b))."""
        pos = np.array([s[0] for s in stops])
        cols = np.array([s[1] for s in stops], dtype=np.float64)
        out = np.empty(t.shape + (3,))
        for c in range(3):
            out[..., c] = np.interp(t, pos, cols[:, c])
        return out

    @staticmethod
    def save(path: Path, arr, mode=None):
        path.parent.mkdir(parents=True, exist_ok=True)
        if arr.dtype != np.uint8:
            arr = np.clip(arr, 0, 255).astype(np.uint8)
        Image.fromarray(arr, mode).save(path, optimize=True)
        return path


def sigmoid01(x, k=8.0, c=0.5):
    return 1.0 / (1.0 + np.exp(-k * (x - c)))


# ===================================================================== superfici
# Ogni funzione restituisce (albedo RGB float 0..255, altezza float 0..1, rugosità 0..1)

def surf_asphalt(tg: TexGen, n, salt, old=False):
    base = tg.spectral(n, 1.2, salt, fmin=2)
    grain = tg.spectral(n, 0.3, salt + 1, fmin=n // 8)
    f1, f2, cid = tg.cells(n, 9000, salt + 2)
    stones = np.clip(1.0 - f1 * 1.6, 0, 1) ** 2
    lum = 62 + 6 * base + 7 * grain + 30 * stones * tg.rng(salt + 3).uniform(0.3, 1.0, 9000)[cid]
    if old:
        cracks_f1, cracks_f2, _ = tg.cells(n, 60, salt + 4)
        crack = np.clip(1.0 - (cracks_f2 - cracks_f1) * 18.0, 0, 1)
        patch = sigmoid01(tg.spectral(n, 2.6, salt + 5), 6, 0.9)
        lum = lum * (1 - 0.35 * crack) + patch * 18
        lum += 10 * sigmoid01(tg.spectral(n, 2.2, salt + 6), 5, 1.2)  # asfalto sbiadito
    rgb = np.stack([lum, lum * 0.99, lum * 1.01], -1)
    hgt = 0.5 + 0.18 * grain + 0.35 * stones
    if old:
        hgt -= 0.4 * crack
    rough = np.clip(0.78 + 0.08 * grain - 0.15 * stones, 0, 1)
    return rgb, hgt, rough


def surf_concrete(tg, n, salt):
    a = tg.spectral(n, 1.6, salt, fmin=2)
    g = tg.spectral(n, 0.4, salt + 1, fmin=n // 8)
    lum = 150 + 10 * a + 6 * g
    rgb = np.stack([lum, lum * 0.98, lum * 0.95], -1)
    return rgb, 0.5 + 0.1 * g, np.clip(0.72 + 0.05 * g, 0, 1)


def surf_gravel(tg, n, salt, tint=(1.0, 1.0, 1.0), count=2600):
    f1, f2, cid = tg.cells(n, count, salt)
    r = tg.rng(salt + 1)
    shade = r.uniform(0.55, 1.15, count)[cid]
    warm = r.uniform(-1, 1, count)[cid]
    edge = np.clip((f2 - f1) * 3.0, 0, 1)
    stone = edge ** 0.5
    fine = tg.spectral(n, 0.6, salt + 2, fmin=n // 6)
    lum = (95 + 70 * shade) * (0.35 + 0.65 * stone) + 6 * fine
    rgb = np.stack([lum * (1 + 0.05 * warm), lum * (0.97 + 0.02 * warm), lum * (0.92 - 0.03 * warm)], -1)
    rgb *= np.array(tint)
    hgt = 0.15 + 0.85 * stone * (0.7 + 0.3 * shade)
    rough = np.clip(0.82 - 0.12 * stone, 0, 1)
    return rgb, hgt, rough


def surf_dirt(tg, n, salt, dusty=False, wet=False):
    a = tg.spectral(n, 2.0, salt, fmin=2)
    b = tg.spectral(n, 1.0, salt + 1, fmin=8)
    f1, f2, cid = tg.cells(n, 1800, salt + 2)
    pebbles = np.clip(1 - f1 * 2.4, 0, 1) ** 2 * tg.rng(salt + 3).uniform(0, 1, 1800)[cid]
    t = np.clip(0.5 + 0.18 * a + 0.1 * b, 0, 1)
    if dusty:
        stops = [(0, (128, 104, 78)), (0.5, (168, 142, 108)), (1, (196, 174, 140))]
    elif wet:
        stops = [(0, (40, 30, 22)), (0.5, (62, 48, 34)), (1, (84, 66, 48))]
    else:
        stops = [(0, (74, 56, 40)), (0.5, (108, 84, 60)), (1, (136, 110, 82))]
    rgb = tg.colorize(t, stops) * (1 - 0.15 * pebbles)[..., None] + 40 * pebbles[..., None]
    hgt = 0.45 + 0.12 * a + 0.35 * pebbles
    rough = np.clip((0.35 if wet else 0.88) + 0.06 * b, 0, 1)
    return rgb, hgt, rough


def surf_grass(tg, n, salt, dry=False):
    a = tg.spectral(n, 2.0, salt, fmin=2)
    blades = tg.spectral(n, 0.2, salt + 1, fmin=n // 6, aniso=(0.35, 1.0))
    clumps = tg.spectral(n, 1.4, salt + 2, fmin=4)
    t = np.clip(0.5 + 0.2 * a + 0.12 * blades + 0.1 * clumps, 0, 1)
    if dry:
        stops = [(0, (92, 88, 48)), (0.5, (138, 128, 72)), (1, (176, 160, 98))]
    else:
        stops = [(0, (40, 62, 22)), (0.45, (66, 96, 34)), (1, (110, 132, 56))]
    soil = sigmoid01(-clumps, 5, 1.1)
    rgb = tg.colorize(t, stops) * (1 - soil[..., None] * 0.6) + soil[..., None] * np.array([92, 72, 50]) * 0.6
    hgt = 0.5 + 0.2 * blades + 0.15 * clumps - 0.2 * soil
    rough = np.clip(0.9 - 0.05 * blades, 0, 1)
    return rgb, hgt, rough


def surf_forest_floor(tg, n, salt):
    a = tg.spectral(n, 1.8, salt, fmin=2)
    needles = tg.spectral(n, 0.15, salt + 1, fmin=n // 5, aniso=(1.0, 0.4))
    needles2 = tg.spectral(n, 0.15, salt + 2, fmin=n // 5, aniso=(0.4, 1.0))
    moss = sigmoid01(tg.spectral(n, 2.2, salt + 3), 4, 0.6)
    t = np.clip(0.5 + 0.2 * a + 0.12 * (needles + needles2), 0, 1)
    rgb = tg.colorize(t, [(0, (40, 28, 18)), (0.5, (78, 54, 32)), (1, (122, 88, 52))])
    rgb = rgb * (1 - 0.6 * moss[..., None]) + np.array([52, 70, 28]) * 0.6 * moss[..., None]
    hgt = 0.5 + 0.15 * (needles + needles2) + 0.1 * moss
    return rgb, hgt, np.clip(0.86 + 0.04 * a, 0, 1)


def surf_rock(tg, n, salt, tone=(118, 112, 104)):
    a = tg.spectral(n, 2.2, salt, fmin=2)
    strata = tg.spectral(n, 1.6, salt + 1, fmin=2, aniso=(0.15, 1.0))
    f1, f2, _ = tg.cells(n, 120, salt + 2)
    cracks = np.clip(1 - (f2 - f1) * 10.0, 0, 1) ** 2
    fine = tg.spectral(n, 0.5, salt + 3, fmin=n // 8)
    lum = 1.0 + 0.12 * a + 0.08 * strata + 0.05 * fine - 0.35 * cracks
    lichen = sigmoid01(tg.spectral(n, 2.0, salt + 4), 5, 1.3)
    rgb = np.array(tone)[None, None, :] * lum[..., None]
    rgb = rgb * (1 - 0.3 * lichen[..., None]) + np.array([120, 124, 96]) * 0.3 * lichen[..., None]
    hgt = 0.5 + 0.25 * a + 0.12 * strata - 0.4 * cracks + 0.05 * fine
    rough = np.clip(0.8 + 0.08 * fine - 0.1 * cracks, 0, 1)
    return rgb, hgt, rough


def surf_sand(tg, n, salt):
    a = tg.spectral(n, 2.0, salt, fmin=2)
    ripples = tg.spectral(n, 1.0, salt + 1, fmin=12, fmax=40, aniso=(1.0, 0.2))
    g = tg.spectral(n, 0.2, salt + 2, fmin=n // 4)
    t = np.clip(0.5 + 0.15 * a + 0.1 * ripples + 0.05 * g, 0, 1)
    rgb = tg.colorize(t, [(0, (150, 132, 102)), (0.5, (184, 166, 132)), (1, (210, 194, 160))])
    return rgb, 0.5 + 0.2 * ripples + 0.1 * g, np.clip(0.9 + 0.03 * g, 0, 1)


def surf_snow(tg, n, salt):
    a = tg.spectral(n, 2.4, salt, fmin=2)
    g = tg.spectral(n, 0.3, salt + 1, fmin=n // 6)
    lum = 228 + 10 * a + 4 * g
    rgb = np.stack([lum * 0.97, lum * 0.985, lum], -1)
    return rgb, 0.5 + 0.2 * a, np.clip(0.55 + 0.08 * g, 0, 1)


SURFACES = {
    "asphalt": lambda tg, n, s: surf_asphalt(tg, n, s),
    "asphalt_old": lambda tg, n, s: surf_asphalt(tg, n, s, old=True),
    "concrete": surf_concrete,
    "gravel": lambda tg, n, s: surf_gravel(tg, n, s),
    "scree": lambda tg, n, s: surf_gravel(tg, n, s, tint=(0.95, 0.95, 0.97), count=700),
    "pebbles": lambda tg, n, s: surf_gravel(tg, n, s, tint=(1.02, 1.0, 0.96), count=1400),
    "dirt": lambda tg, n, s: surf_dirt(tg, n, s),
    "dirt_dusty": lambda tg, n, s: surf_dirt(tg, n, s, dusty=True),
    "mud": lambda tg, n, s: surf_dirt(tg, n, s, wet=True),
    "grass": lambda tg, n, s: surf_grass(tg, n, s),
    "grass_dry": lambda tg, n, s: surf_grass(tg, n, s, dry=True),
    "forest_floor": surf_forest_floor,
    "rock": lambda tg, n, s: surf_rock(tg, n, s),
    "rock_dark": lambda tg, n, s: surf_rock(tg, n, s, tone=(92, 88, 84)),
    "sand": surf_sand,
    "snow": surf_snow,
}


def write_surface_set(tg: TexGen, kind: str, n: int, out_dir: Path, prefix: str, salt: int, normal_strength=3.0):
    """Scrive le 5 mappe di una superficie: _b (colore), _nm, _r, _ao, _h. Restituisce i percorsi."""
    rgb, hgt, rough = SURFACES[kind](tg, n, salt)
    hgt = (hgt - hgt.min()) / max(hgt.max() - hgt.min(), 1e-9)
    ao = np.clip(0.55 + 0.45 * ndimage.uniform_filter(hgt, 5, mode="wrap") ** 0.5 + 0.2 * (hgt - ndimage.uniform_filter(hgt, 9, mode="wrap")), 0, 1)
    paths = {
        "b": tg.save(out_dir / f"{prefix}_b.png", rgb),
        "nm": tg.save(out_dir / f"{prefix}_nm.png", tg.normal_from_height(hgt, normal_strength * n / 512)),
        "r": tg.save(out_dir / f"{prefix}_r.png", (rough * 255).astype(np.uint8), "L"),
        "ao": tg.save(out_dir / f"{prefix}_ao.png", (ao * 255).astype(np.uint8), "L"),
        "h": tg.save(out_dir / f"{prefix}_h.png", (hgt * 255).astype(np.uint8), "L"),
    }
    return paths, rgb.reshape(-1, 3).mean(0)
