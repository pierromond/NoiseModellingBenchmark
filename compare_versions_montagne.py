#!/usr/bin/env python3
import json
import math
import random
from pathlib import Path
from itertools import combinations

ROOT     = Path(__file__).parent
OUTPUT   = ROOT / "output/montagne"
DATA_DIR = ROOT / "website" / "data/montagne"

SILENCE_THRESHOLD = -89.0
RNG               = random.Random(42)

MEASURE_GEOJSON = DATA_DIR / "measure" / "RECEIVERS_LEVEL.geojson"
MEASURE_FALLBACK = ROOT / "input/montagne/measure/RECEIVERS_LEVEL.geojson"
SOURCES_GEOJSON = ROOT / "input/montagne/LW_ROADS.geojson"


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


def load_receivers(version: str) -> dict[str, float]:
    geojson_path = OUTPUT / version / "RECEIVERS_LEVEL.geojson"
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
        key  = props.get("IDRECEIVER")
        if key is None or laeq is None:
            continue

        receivers[key] = {
            "laeq"  : mark_laeq(laeq),
            "coords": parse_coords(feature.get("geometry")),
        }

    return receivers


def compare(v_a: str, data_a: dict, v_b: str, data_b: dict) -> dict:
    common_keys = sorted(set(data_a.keys()) & set(data_b.keys()))
    n_common    = len(common_keys)

    n_nan_a = sum(1 for k in common_keys if data_a[k]["laeq"] is None)
    n_nan_b = sum(1 for k in common_keys if data_b[k]["laeq"] is None)

    valid_keys = [k for k in common_keys
                  if data_a[k]["laeq"] is not None and data_b[k]["laeq"] is not None]
    n_valid = len(valid_keys)

    if n_valid == 0:
        return None

    deltas     = [abs(data_a[k]["laeq"] - data_b[k]["laeq"]) for k in valid_keys]
    max_delta  = max(deltas)
    mean_delta = sum(deltas) / n_valid
    std_delta  = math.sqrt(sum((d - mean_delta) ** 2 for d in deltas) / n_valid)
    rmse       = math.sqrt(sum(d * d for d in deltas) / n_valid)

    scatter = [[round(data_a[k]["laeq"], 2), round(data_b[k]["laeq"], 2)] for k in valid_keys]
    deltas_signed = [round(data_b[k]["laeq"] - data_a[k]["laeq"], 2) for k in valid_keys]

    diff_map = []
    for k in valid_keys:
        coords = data_a[k].get("coords") or data_b[k].get("coords")
        if coords:
            diff_map.append([coords[0], coords[1], round(data_b[k]["laeq"] - data_a[k]["laeq"], 2)])

    result = {
        "version_a"        : v_a,
        "version_b"        : v_b,
        "n_common"         : n_common,
        "n_valid"          : n_valid,
        "n_nan_a"          : n_nan_a,
        "n_nan_b"          : n_nan_b,
        "n_only_a"         : len(data_a) - n_common,
        "n_only_b"         : len(data_b) - n_common,
        "silence_threshold": SILENCE_THRESHOLD,
        "max_delta"        : round(max_delta, 4),
        "mean_delta"       : round(mean_delta, 4),
        "std_delta"        : round(std_delta, 4),
        "rmse"             : round(rmse, 4),
        "scatter"          : scatter,
        "deltas_signed"    : deltas_signed,
        "diff_map"         : diff_map,
    }
    return result


# ─────────────────────────────────────────────
# COMPARAISON A LA MESURE
# ─────────────────────────────────────────────

def point_segment_distance(px, py, x1, y1, x2, y2) -> float:
    dx, dy = x2 - x1, y2 - y1
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def load_sources_segments() -> list:
    """Segments (x1, y1, x2, y2) des sources LW_ROADS, en Lambert-93."""
    if not SOURCES_GEOJSON.exists():
        return []

    with open(SOURCES_GEOJSON) as f:
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


def load_measure() -> dict:
    path = MEASURE_GEOJSON if MEASURE_GEOJSON.exists() else MEASURE_FALLBACK
    if not path.exists():
        return {}

    with open(path) as f:
        data = json.load(f)

    measured = {}
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        laeq = props.get("LAEQ") or props.get("laeq")
        key  = props.get("IDRECEIVER")
        if key is None or laeq is None:
            continue
        measured[key] = {
            "laeq"  : float(laeq),
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


def compare_to_measure(version: str, computed: dict, measured: dict,
                       ref_key, ref_dist: float) -> dict:
    common = sorted(
        k for k in set(measured) & set(computed)
        if computed[k]["laeq"] is not None
    )
    if ref_key is None or ref_key not in common or not common:
        return None

    offset = measured[ref_key]["laeq"] - computed[ref_key]["laeq"]

    corrected = {k: computed[k]["laeq"] + offset for k in common}
    errors    = [corrected[k] - measured[k]["laeq"] for k in common]

    n        = len(errors)
    mean     = sum(errors) / n
    std      = math.sqrt(sum((e - mean) ** 2 for e in errors) / n)
    rmse     = math.sqrt(sum(e * e for e in errors) / n)
    max_abs  = max(abs(e) for e in errors)

    scatter = [[round(measured[k]["laeq"], 2), round(corrected[k], 2)] for k in common]

    return {
        "version"            : version,
        "reference_receiver" : ref_key,
        "reference_distance" : round(ref_dist, 2) if ref_dist is not None else None,
        "offset"             : round(offset, 4),
        "n_measured"         : len(measured),
        "n_compared"         : n,
        "mean_error"         : round(mean, 4),
        "std_error"          : round(std, 4),
        "rmse"               : round(rmse, 4),
        "max_abs_error"      : round(max_abs, 4),
        "scatter"            : scatter,
    }


def main():
    versions = sorted([
        d.name for d in OUTPUT.iterdir()
        if d.is_dir() and (d / "RECEIVERS_LEVEL.geojson").exists()
    ])

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    all_data = {v: load_receivers(v) for v in versions}

    comparisons = []
    for v_a, v_b in combinations(versions, 2):
        result = compare(v_a, all_data[v_a], v_b, all_data[v_b])
        if result:
            comparisons.append(result)

    (DATA_DIR / "comparisons.json").write_text(
        json.dumps(comparisons, separators=(",", ":")))

    measured = load_measure()
    ref_key, ref_dist = reference_receiver(measured, load_sources_segments())

    measure_results = []
    for version in versions:
        result = compare_to_measure(version, all_data[version], measured, ref_key, ref_dist)
        if result:
            measure_results.append(result)

    (DATA_DIR / "measure_comparison.json").write_text(
        json.dumps(measure_results, separators=(",", ":")))

    print(f"comparisons.json : {len(comparisons)} paire(s)")
    print(f"measure_comparison.json : {len(measure_results)} version(s) "
          f"(récepteur de référence : {ref_key}, {ref_dist} m)")


if __name__ == "__main__":
    main()
