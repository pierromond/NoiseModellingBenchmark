#!/usr/bin/env python3
"""Build a compact baseline pack for PR comparisons.

The public site already contains one receiver GeoJSON per published version.
Downloading all of them for every PR is slow and depends on the live site. This
script extracts only the fields used by the comparison code and writes a small
artifact that the PR workflow can download once.

Usage:
  python3 benchmark/python/build_baseline_pack.py
  python3 benchmark/python/build_baseline_pack.py --root website/data --out benchmark/baseline-pack
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KEEP_PROPERTIES = ("IDRECEIVER", "LAEQ", "laeq", "PERIOD", "campagne")


def compact(src: Path, dest: Path) -> bool:
    if not src.exists():
        return False
    data = json.loads(src.read_text(encoding="utf-8"))
    features = []
    for feature in data.get("features", []):
        properties = feature.get("properties") or {}
        kept = {key: properties[key] for key in KEEP_PROPERTIES if key in properties}
        features.append({
            "type": "Feature",
            "properties": kept,
            "geometry": feature.get("geometry"),
        })
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    return True


def build(root: Path, out: Path) -> list[str]:
    versions: list[str] = []
    clisson = root
    montagne = root / "montagne"

    clisson_out = out / "clisson"
    montagne_out = out / "montagne"

    if clisson.exists():
        for version_dir in sorted(p for p in clisson.iterdir() if p.is_dir()):
            if version_dir.name in {"montagne", "pr"}:
                continue
            if compact(version_dir / "RECEIVERS_LEVEL.geojson", clisson_out / version_dir.name / "RECEIVERS_LEVEL.geojson"):
                versions.append(version_dir.name)

    if montagne.exists():
        for version_dir in sorted(p for p in montagne.iterdir() if p.is_dir()):
            if version_dir.name in {"layers", "measure"}:
                continue
            copied = False
            for name in ("RECEIVERS_LEVEL.geojson", "RECEIVERS_LEVEL_c1.geojson", "RECEIVERS_LEVEL_c2.geojson"):
                copied = compact(version_dir / name, montagne_out / version_dir.name / name) or copied
            if copied:
                versions.append(version_dir.name)
        compact(montagne / "measure" / "RECEIVERS_LEVEL.geojson",
                montagne_out / "measure" / "RECEIVERS_LEVEL.geojson")
        source = ROOT / "benchmark" / "input" / "montagne" / "LW_ROADS.geojson"
        if source.exists():
            try:
                json.loads(source.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                pass
            else:
                montagne_out.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, montagne_out / "LW_ROADS.geojson")

    manifest = {"versions": sorted(set(versions))}
    out.mkdir(parents=True, exist_ok=True)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest["versions"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, default=ROOT / "website" / "data",
                        help="published site data directory")
    parser.add_argument("--out", type=Path, default=ROOT / "benchmark" / "baseline-pack",
                        help="output directory")
    args = parser.parse_args()

    if args.out.exists():
        shutil.rmtree(args.out)
    versions = build(args.root, args.out)
    print(f"Baseline pack: {len(versions)} version(s) -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
