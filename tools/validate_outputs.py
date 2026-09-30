#!/usr/bin/env python3
"""Validate the generated artifacts against the JSON schemas in schemas/.

Usage:
  python3 tools/validate_outputs.py           # fail (exit 1) on any violation
  python3 tools/validate_outputs.py --warn    # report violations but exit 0
  python3 tools/validate_outputs.py --no-run  # do not re-run the pipeline first

If the `jsonschema` package is unavailable the script reports it and exits 0.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"

STATIC_TARGETS = [
    ("website/data/results.json", "results.schema.json"),
    ("website/data/comparisons.json", "comparisons.schema.json"),
    ("website/data/settings.json", "settings.schema.json"),
    ("website/data/build.json", "build.schema.json"),
    ("website/data/start.json", "start.schema.json"),
    ("website/data/montagne/results.json", "results.schema.json"),
    ("website/data/montagne/comparisons.json", "comparisons.schema.json"),
    ("website/data/montagne/measure_comparison.json", "measure_comparison.schema.json"),
]


def targets() -> list[tuple[Path, Path]]:
    out: list[tuple[Path, Path]] = []
    for rel, schema in STATIC_TARGETS:
        out.append((ROOT / rel, SCHEMAS / schema))
    for pattern in ("benchmark/output/*/stats_*.json", "benchmark/output/montagne/*/stats_*.json"):
        for path in sorted(ROOT.glob(pattern)):
            out.append((path, SCHEMAS / "stats.schema.json"))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--warn", action="store_true", help="report but do not fail")
    parser.add_argument("--no-run", action="store_true", help="do not re-run the pipeline")
    args = parser.parse_args()

    try:
        import jsonschema
    except ImportError:
        print("[validate] jsonschema not installed — skipping", file=sys.stderr)
        return 0

    if not args.no_run:
        for script in ("benchmark/drivers/benchmark_run_clisson.sh", "benchmark/drivers/benchmark_run_montagne.sh"):
            subprocess.run(["bash", str(ROOT / script), "--aggregate-only"], cwd=ROOT, check=False)

    checked = 0
    failures = 0
    for path, schema_path in targets():
        if not path.exists():
            continue
        checked += 1
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        data = json.loads(path.read_text(encoding="utf-8"))
        validator = jsonschema.Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
        for err in errors:
            failures += 1
            loc = "/".join(str(p) for p in err.path) or "<root>"
            print(f"[validate] {path.relative_to(ROOT)} :: {loc}: {err.message}")

    if failures:
        print(f"[validate] {failures} violation(s) across {checked} artifact(s)")
        return 0 if args.warn else 1
    print(f"[validate] OK — {checked} artifact(s) match their schema")
    return 0


if __name__ == "__main__":
    sys.exit(main())
