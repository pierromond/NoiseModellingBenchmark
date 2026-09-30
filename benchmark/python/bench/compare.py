"""Unified comparison logic for the Clisson and La Montagne datasets.

Both datasets share the pairwise comparison (`compare_pair`). La Montagne adds a
comparison to the measured levels. `run_clisson` and `run_montagne` are the two
entry points used by the thin wrappers compare_versions.py and
compare_versions_montagne.py.

The sampling used for the Clisson payload (3000 points) is kept bit-for-bit
reproducible: a single module-level RNG seeded with 42 is consumed once per pair
in sorted order, exactly as before.
"""

from __future__ import annotations

import json
import math
import random
from itertools import combinations
from pathlib import Path

from bench.stats import SILENCE_THRESHOLD, load_receivers, parse_coords

ROOT = Path(__file__).resolve().parents[3]  # <repo>
MAX_PAYLOAD_POINTS = 3000
RNG = random.Random(42)


def compare_pair(v_a: str, data_a: dict, v_b: str, data_b: dict, sample: bool = False) -> dict | None:
    common_keys = sorted(set(data_a.keys()) & set(data_b.keys()))
    n_common = len(common_keys)

    n_nan_a = sum(1 for k in common_keys if data_a[k]["laeq"] is None)
    n_nan_b = sum(1 for k in common_keys if data_b[k]["laeq"] is None)

    valid_keys = [k for k in common_keys
                  if data_a[k]["laeq"] is not None and data_b[k]["laeq"] is not None]
    n_valid = len(valid_keys)

    if n_valid == 0:
        return None

    deltas = [abs(data_a[k]["laeq"] - data_b[k]["laeq"]) for k in valid_keys]
    max_delta = max(deltas)
    mean_delta = sum(deltas) / n_valid
    std_delta = math.sqrt(sum((d - mean_delta) ** 2 for d in deltas) / n_valid)
    rmse = math.sqrt(sum(d * d for d in deltas) / n_valid)

    keys = RNG.sample(valid_keys, min(MAX_PAYLOAD_POINTS, n_valid)) if sample else valid_keys

    scatter = [[round(data_a[k]["laeq"], 2), round(data_b[k]["laeq"], 2)] for k in keys]
    deltas_signed = [round(data_b[k]["laeq"] - data_a[k]["laeq"], 2) for k in keys]

    diff_map = []
    for k in keys:
        coords = data_a[k].get("coords") or data_b[k].get("coords")
        if coords:
            diff_map.append([coords[0], coords[1], round(data_b[k]["laeq"] - data_a[k]["laeq"], 2)])

    # Key order matters: it is serialised as-is into comparisons.json.
    result = {
        "version_a": v_a,
        "version_b": v_b,
        "n_common": n_common,
        "n_valid": n_valid,
        "n_nan_a": n_nan_a,
        "n_nan_b": n_nan_b,
        "n_only_a": len(data_a) - n_common,
        "n_only_b": len(data_b) - n_common,
        "silence_threshold": SILENCE_THRESHOLD,
    }
    if sample:
        result["max_payload_points"] = MAX_PAYLOAD_POINTS
    result.update({
        "max_delta": round(max_delta, 4),
        "mean_delta": round(mean_delta, 4),
        "std_delta": round(std_delta, 4),
        "rmse": round(rmse, 4),
        "scatter": scatter,
        "deltas_signed": deltas_signed,
        "diff_map": diff_map,
    })
    return result


def _versions(output_dir: Path) -> list[str]:
    return sorted(
        d.name for d in output_dir.iterdir()
        if d.is_dir() and (d / "RECEIVERS_LEVEL.geojson").exists()
    )


# ─────────────────────────────────────────────
# COMPARAISON A LA MESURE (La Montagne)
# ─────────────────────────────────────────────

def point_segment_distance(px, py, x1, y1, x2, y2) -> float:
    dx, dy = x2 - x1, y2 - y1
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def load_sources_segments(sources_geojson: Path) -> list:
    """Segments (x1, y1, x2, y2) des sources LW_ROADS, en Lambert-93."""
    if not sources_geojson.exists():
        return []

    with open(sources_geojson) as f:
        data = json.load(f)

    segments = []
    for feature in data.get("features", []):
        geometry = feature.get("geometry") or {}
        gtype = geometry.get("type", "")
        c = geometry.get("coordinates")
        if not c:
            continue
        if gtype == "Point":
            segments.append((c[0], c[1], c[0], c[1]))
        elif gtype == "LineString":
            for a, b in zip(c, c[1:]):
                segments.append((a[0], a[1], b[0], b[1]))
        elif gtype == "MultiLineString":
            for line in c:
                for a, b in zip(line, line[1:]):
                    segments.append((a[0], a[1], b[0], b[1]))
    return segments


def load_measure(measure_geojson: Path, measure_fallback: Path) -> dict:
    path = measure_geojson if measure_geojson.exists() else measure_fallback
    if not path.exists():
        return {}

    with open(path) as f:
        data = json.load(f)

    measured = {}
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        laeq = props.get("LAEQ") or props.get("laeq")
        key = props.get("IDRECEIVER")
        if key is None or laeq is None:
            continue
        measured[key] = {
            "laeq": float(laeq),
            "coords": parse_coords(feature.get("geometry")),
        }
    return measured


def reference_receiver(measured: dict, segments: list):
    """Récepteur mesuré le plus proche des sources LW_ROADS."""
    if not segments:
        return None, None

    best_key, best_dist = None, None
    for key, rec in measured.items():
        coords = rec.get("coords")
        if not coords:
            continue
        dist = min(
            point_segment_distance(coords[0], coords[1], *seg)
            for seg in segments
        )
        if best_dist is None or dist < best_dist:
            best_key, best_dist = key, dist
    return best_key, best_dist


def compare_to_measure(version: str, computed: dict, measured: dict, ref_key, ref_dist: float) -> dict | None:
    common = sorted(
        k for k in set(measured) & set(computed)
        if computed[k]["laeq"] is not None
    )
    if ref_key is None or ref_key not in common or not common:
        return None

    offset = measured[ref_key]["laeq"] - computed[ref_key]["laeq"]

    corrected = {k: computed[k]["laeq"] + offset for k in common}
    errors = [corrected[k] - measured[k]["laeq"] for k in common]

    n = len(errors)
    mean = sum(errors) / n
    std = math.sqrt(sum((e - mean) ** 2 for e in errors) / n)
    rmse = math.sqrt(sum(e * e for e in errors) / n)
    max_abs = max(abs(e) for e in errors)

    scatter = [[round(measured[k]["laeq"], 2), round(corrected[k], 2)] for k in common]

    receivers = []
    for k in common:
        coords = measured[k].get("coords") or computed[k].get("coords")
        if coords:
            receivers.append([
                k, coords[0], coords[1],
                round(measured[k]["laeq"], 2),
                round(corrected[k], 2),
                round(corrected[k] - measured[k]["laeq"], 2),
            ])

    return {
        "version": version,
        "reference_receiver": ref_key,
        "reference_distance": round(ref_dist, 2) if ref_dist is not None else None,
        "offset": round(offset, 4),
        "n_measured": len(measured),
        "n_compared": n,
        "mean_error": round(mean, 4),
        "std_error": round(std, 4),
        "rmse": round(rmse, 4),
        "max_abs_error": round(max_abs, 4),
        "scatter": scatter,
        "receivers": receivers,
    }


# ─────────────────────────────────────────────
# ENTRY POINTS
# ─────────────────────────────────────────────

def run_clisson() -> None:
    output = ROOT / "benchmark" / "output"
    data_dir = ROOT / "website" / "data"
    versions = _versions(output)

    if len(versions) < 2:
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / "comparisons.json").write_text("[]")
        return

    all_data = {v: load_receivers(output, v) for v in versions}

    comparisons = []
    for v_a, v_b in combinations(versions, 2):
        result = compare_pair(v_a, all_data[v_a], v_b, all_data[v_b], sample=True)
        if result:
            comparisons.append(result)

    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "comparisons.json").write_text(
        json.dumps(comparisons, separators=(",", ":")))


def run_montagne() -> None:
    output = ROOT / "benchmark" / "output/montagne"
    data_dir = ROOT / "website" / "data/montagne"
    measure_geojson = data_dir / "measure" / "RECEIVERS_LEVEL.geojson"
    measure_fallback = ROOT / "benchmark" / "input/montagne/measure/RECEIVERS_LEVEL.geojson"
    sources_geojson = ROOT / "benchmark" / "input/montagne/LW_ROADS.geojson"

    versions = _versions(output)
    data_dir.mkdir(parents=True, exist_ok=True)

    all_data = {v: load_receivers(output, v) for v in versions}

    comparisons = []
    for v_a, v_b in combinations(versions, 2):
        result = compare_pair(v_a, all_data[v_a], v_b, all_data[v_b], sample=False)
        if result:
            comparisons.append(result)

    (data_dir / "comparisons.json").write_text(
        json.dumps(comparisons, separators=(",", ":")))

    measured = load_measure(measure_geojson, measure_fallback)
    ref_key, ref_dist = reference_receiver(measured, load_sources_segments(sources_geojson))

    measure_results = []
    for version in versions:
        result = compare_to_measure(version, all_data[version], measured, ref_key, ref_dist)
        if result:
            measure_results.append(result)

    (data_dir / "measure_comparison.json").write_text(
        json.dumps(measure_results, separators=(",", ":")))

    print(f"comparisons.json : {len(comparisons)} paire(s)")
    print(f"measure_comparison.json : {len(measure_results)} version(s) "
          f"(récepteur de référence : {ref_key}, {ref_dist} m)")
