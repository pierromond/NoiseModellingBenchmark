#!/usr/bin/env python3
"""Characterisation harness for the benchmark pipeline.

Runs the aggregation-only pipeline for both datasets and hashes every generated
artifact, so any refactoring can be proven to leave the observable outputs
unchanged.

Covered artifacts:
  - website/data/**            (results, comparisons, settings, build, start, layers)
  - website/index.html         (generated from website/template.html)
  - output/*/stats_*.json      and output/montagne/*/stats_*.json

Volatile fields (timestamps, CI environment variables, CI-derived URLs) are
normalised so a snapshot taken locally and one taken on a GitHub runner match.

Usage:
  python3 tools/snapshot.py                # run pipeline, print manifest JSON
  python3 tools/snapshot.py --no-run       # hash current state, no pipeline run
  python3 tools/snapshot.py --update       # run pipeline, write tools/baseline/snapshot.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = Path(__file__).resolve().parent / "baseline" / "snapshot.json"

ENV_KEYS = {"builtAt", "repo", "ref", "sha", "runId", "versionSources"}
MEDIA_PREFIX = "https://media.githubusercontent.com/media/"
RAW_PREFIX = "https://raw.githubusercontent.com/"
URL_RE = re.compile(r"https://(?:media|raw)\.githubusercontent\.com/[^\s\"'<>)]+")


def _normalise_scalar(value, key=None):
    if key in ENV_KEYS:
        return "<env>"
    if isinstance(value, str):
        if value.startswith(MEDIA_PREFIX) or value.startswith(RAW_PREFIX):
            return "<url>"
    return value


def _walk(obj, key=None):
    if isinstance(obj, dict):
        return {k: _walk(v, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_walk(v) for v in obj]
    return _normalise_scalar(obj, key)


def normalise_json_bytes(path: Path) -> bytes:
    data = json.loads(path.read_text(encoding="utf-8"))
    return json.dumps(_walk(data), sort_keys=True, indent=2, ensure_ascii=False).encode("utf-8")


def normalise_html_bytes(path: Path) -> bytes:
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"<!-- built:.*?-->", "<!-- built -->", text, flags=re.S)
    text = URL_RE.sub("<url>", text)
    return text.encode("utf-8")


def normalise(path: Path) -> bytes:
    if path.suffix == ".json":
        return normalise_json_bytes(path)
    if path.suffix in (".html", ".htm"):
        return normalise_html_bytes(path)
    return path.read_bytes()


def collect_paths() -> list[Path]:
    paths: list[Path] = []
    data_dir = ROOT / "website" / "data"
    if data_dir.exists():
        paths.extend(p for p in data_dir.rglob("*") if p.is_file())
    index = ROOT / "website" / "index.html"
    if index.exists():
        paths.append(index)
    paths.extend(ROOT.glob("benchmark/output/*/stats_*.json"))
    paths.extend(ROOT.glob("benchmark/output/montagne/*/stats_*.json"))
    return sorted({p for p in paths})


def build_snapshot() -> dict[str, str]:
    manifest: dict[str, str] = {}
    for path in collect_paths():
        digest = hashlib.sha256(normalise(path)).hexdigest()
        manifest[path.relative_to(ROOT).as_posix()] = digest
    return manifest


def run_pipeline() -> None:
    for script in ("benchmark/drivers/benchmark_run_clisson.sh", "benchmark/drivers/benchmark_run_montagne.sh"):
        proc = subprocess.run(
            ["bash", str(ROOT / script), "--aggregate-only"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            sys.stderr.write(proc.stdout)
            sys.stderr.write(proc.stderr)
            raise SystemExit(f"[snapshot] {script} --aggregate-only failed ({proc.returncode})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-run", action="store_true", help="hash current state without running the pipeline")
    parser.add_argument("--update", action="store_true", help="write the snapshot to tools/baseline/snapshot.json")
    parser.add_argument("--out", type=Path, help="write the snapshot to this file instead of stdout")
    args = parser.parse_args()

    if not args.no_run:
        run_pipeline()

    manifest = build_snapshot()
    payload = json.dumps(manifest, indent=2, sort_keys=True) + "\n"

    if args.update:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(payload, encoding="utf-8")
        print(f"[snapshot] wrote {BASELINE.relative_to(ROOT)} ({len(manifest)} files)")
    elif args.out:
        args.out.write_text(payload, encoding="utf-8")
        print(f"[snapshot] wrote {args.out} ({len(manifest)} files)")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
