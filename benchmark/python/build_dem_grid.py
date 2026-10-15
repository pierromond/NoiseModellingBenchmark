#!/usr/bin/env python3
"""Downsample the La Montagne DEM into a regular grid (for the 3D explainability view and KML).

One grid for the whole study area (dataset level, independent of benchmark version).
Written to website/data/montagne/dem_grid.json.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEM = ROOT / "benchmark" / "input" / "montagne" / "DEM.geojson"
OUT = ROOT / "website" / "data" / "montagne" / "dem_grid.json"
CELL = 20.0

PATTERN = re.compile(r"\[\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*\]")


def main() -> int:
    if not DEM.exists():
        print(f"[dem_grid] DEM not found: {DEM}")
        return 0

    text = DEM.read_text()

    # Pass 1: bounding box (a fixed origin is required before binning)
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    for m in PATTERN.finditer(text):
        x = float(m.group(1)); y = float(m.group(2))
        if x < min_x: min_x = x
        if x > max_x: max_x = x
        if y < min_y: min_y = y
        if y > max_y: max_y = y

    nx = int((max_x - min_x) // CELL) + 1
    ny = int((max_y - min_y) // CELL) + 1

    # Pass 2: bin the elevations on the regular grid
    sums: dict[tuple[int, int], float] = {}
    counts: dict[tuple[int, int], int] = {}
    for m in PATTERN.finditer(text):
        x = float(m.group(1)); y = float(m.group(2)); z = float(m.group(3))
        ix = int((x - min_x) // CELL)
        iy = int((y - min_y) // CELL)
        k = (ix, iy)
        sums[k] = sums.get(k, 0.0) + z
        counts[k] = counts.get(k, 0) + 1
    grid = [[None] * nx for _ in range(ny)]
    for (ix, iy), s in sums.items():
        grid[iy][ix] = round(s / counts[(ix, iy)], 2)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "cell": CELL, "xmin": min_x, "ymin": min_y, "nx": nx, "ny": ny, "z": grid,
    }, separators=(",", ":")))
    print(f"[dem_grid] {nx}x{ny} cells -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
