"""Single source of truth loader for config/benchmark.json.

Every consumer (Python tooling, and later the Groovy simulation scripts and the
front-end constants) reads the same file. This is what removes the "change a
value in six places" maintenance cost.
"""

from __future__ import annotations

import json
from pathlib import Path

BENCH_ROOT = Path(__file__).resolve().parents[2]  # <repo>/benchmark
ROOT = BENCH_ROOT.parent                          # <repo>
CONFIG_PATH = BENCH_ROOT / "config" / "benchmark.json"


def load_config(path: Path | None = None) -> dict:
    source = Path(path) if path is not None else CONFIG_PATH
    return json.loads(source.read_text(encoding="utf-8"))


CONFIG = load_config()


def constant(name: str):
    return CONFIG["constants"][name]


def datasets() -> dict:
    return CONFIG["datasets"]


def simulation(dataset: str) -> dict:
    return CONFIG["simulations"][dataset]
