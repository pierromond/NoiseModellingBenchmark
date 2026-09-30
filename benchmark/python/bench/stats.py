"""Shared receiver/statistics helpers for the comparison scripts.

Extracted from compare_versions.py and compare_versions_montagne.py so the
LAEQ parsing, coordinate handling and silence threshold live in one place.
"""

from __future__ import annotations

import json
from pathlib import Path

from bench.config import constant

SILENCE_THRESHOLD = constant("silenceThreshold")


def mark_laeq(value):
    value = float(value)
    return None if value <= SILENCE_THRESHOLD else value


def parse_coords(geometry: dict) -> list:
    if not geometry:
        return None
    gtype = geometry.get("type", "")
    c = geometry.get("coordinates")
    if c is None:
        return None
    if gtype == "Point":
        return [round(c[0], 3), round(c[1], 3)]
    if gtype in ("MultiPoint", "LineString") and c:
        return [round(c[0][0], 3), round(c[0][1], 3)]
    return None


def load_receivers(output_dir: Path, version: str) -> dict:
    geojson_path = output_dir / version / "RECEIVERS_LEVEL.geojson"
    if not geojson_path.exists():
        return {}

    with open(geojson_path) as f:
        data = json.load(f)

    receivers = {}
    for feature in data.get("features", []):
        props = feature.get("properties", {})

        if not version.startswith("v4.") and props.get("PERIOD", "") != "D":
            continue

        laeq = props.get("LAEQ") or props.get("laeq")
        key = props.get("IDRECEIVER")
        if key is None or laeq is None:
            continue

        receivers[key] = {
            "laeq": mark_laeq(laeq),
            "coords": parse_coords(feature.get("geometry")),
        }

    return receivers
