#!/usr/bin/env python3
"""Extract the simulation contract from the version-dispatching Groovy scripts.

For every `if (version == "vX")` branch it records which Noise_level_from_source
script is loaded and with which parameters, plus the Set_Height calls. This makes
the dispatch logic machine-comparable, so a refactoring of the dispatch (Phase B)
can be proven to keep the exact same behaviour per version.

Usage:
  python3 tools/sim_spec.py                     # print the spec as JSON
  python3 tools/sim_spec.py --update            # write tools/baseline/simulation_spec.json
  python3 tools/sim_spec.py --check             # compare current code to the baseline
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = Path(__file__).resolve().parent / "baseline" / "simulation_spec.json"

SOURCES = [
    "benchmark/simulations/montagne/montagneV5.groovy",
    "benchmark/simulations/montagne/montagneV6.groovy",
    "benchmark/simulations/runscriptV5.0.groovy",
    "benchmark/simulations/runscriptV6.0.groovy",
]

# Files whose dispatch is now driven by config/benchmark.json instead of inline
# if-branches. For those, the contract is read from the config (which is itself
# compared to the frozen baseline).
CONFIG_FILES = {
    "benchmark/simulations/montagne/montagneV5.groovy": "montagne",
    "benchmark/simulations/runscriptV5.0.groovy": "clisson",
}
CONFIG_PATH = ROOT / "benchmark" / "config" / "benchmark.json"

VER_RE = re.compile(r'version\s*==\s*"([^"]+)"')
STRING_RE = re.compile(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'')
SCRIPT_RE = re.compile(r'new File\("([^"]+)"\)')
EXEC_RE = re.compile(r"\.exec\(connection,")
PAIR_RE = re.compile(
    r'"([A-Za-z_]\w*)"\s*:\s*('
    r"'(?:[^'\\]|\\.)*'"
    r'|"(?:[^"\\]|\\.)*"'
    r"|true|false|null"
    r"|-?\d+(?:\.\d+)?"
    r")"
)


def strip_comments(text: str) -> str:
    """Remove // and /* */ comments while preserving string literals."""
    out: list[str] = []
    i, n = 0, len(text)
    quote: str | None = None
    while i < n:
        c = text[i]
        if quote is not None:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in ('"', "'"):
            quote = c
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def blank_strings(text: str) -> str:
    """Replace string literals with spaces (same length) so braces inside them are ignored."""
    return STRING_RE.sub(lambda m: " " * len(m.group(0)), text)


def match_pair(text: str, start: int, open_ch: str, close_ch: str) -> tuple[int, int]:
    depth = 0
    for i in range(start, len(text)):
        if text[i] == open_ch:
            depth += 1
        elif text[i] == close_ch:
            depth -= 1
            if depth == 0:
                return start, i
    return start, len(text) - 1


def parse_pairs(block: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for m in PAIR_RE.finditer(block):
        value = m.group(2)
        if value.startswith(("'", '"')):
            value = value[1:-1]
        pairs[m.group(1)] = value
    return pairs


def slices(text: str, structural: str, brace: int) -> tuple[str, str]:
    """Return (original, string-blanked) bodies of the { } starting at brace."""
    _, end = match_pair(structural, brace, "{", "}")
    return text[brace + 1:end], structural[brace + 1:end]


def extract_spec(path: Path) -> dict:
    text = strip_comments(path.read_text(encoding="utf-8"))
    structural = blank_strings(text)

    versions: dict[str, dict] = {}
    for m in VER_RE.finditer(text):
        version = m.group(1)
        brace = structural.index("{", m.end())
        block, bstruct = slices(text, structural, brace)

        script_m = SCRIPT_RE.search(block)

        set_heights = []
        for sm in re.finditer(r"new Set_Height\(\)\.exec\(connection,", bstruct):
            bracket = bstruct.index("[", sm.end())
            _, end = match_pair(bstruct, bracket, "[", "]")
            pairs = parse_pairs(block[bracket:end + 1])
            if "tableName" in pairs or "height" in pairs:
                set_heights.append({"tableName": pairs.get("tableName"), "height": pairs.get("height")})

        exec_params: dict[str, str] = {}
        for em in EXEC_RE.finditer(bstruct):
            bracket = bstruct.index("[", em.end())
            _, end = match_pair(bstruct, bracket, "[", "]")
            pairs = parse_pairs(block[bracket:end + 1])
            if "tableBuilding" in pairs:
                exec_params = pairs
                break

        versions[version] = {
            "script": script_m.group(1) if script_m else None,
            "exec": exec_params,
            "set_height": set_heights,
        }

    return versions


def _stringify(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def spec_from_config() -> dict:
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    spec: dict = {}
    for rel in SOURCES:
        dataset = CONFIG_FILES.get(rel)
        if dataset is None:
            # Not config-driven yet (v6 scripts): keep parsing the Groovy source.
            path = ROOT / rel
            spec[rel] = extract_spec(path) if path.exists() else {}
            continue
        sim = cfg["simulations"][dataset]
        versions: dict = {}
        for version, entry in sim["versions"].items():
            param_set = sim["paramSets"][entry["paramSet"]]
            versions[version] = {
                "script": entry["script"],
                "exec": {k: _stringify(v) for k, v in param_set["exec"].items()},
                "set_height": [
                    {"tableName": h["tableName"], "height": _stringify(h["height"])}
                    for h in param_set.get("setHeight", [])
                ],
            }
        spec[rel] = versions
    return spec


def build_spec() -> dict:
    if CONFIG_PATH.exists():
        return spec_from_config()
    spec: dict = {}
    for rel in SOURCES:
        path = ROOT / rel
        if path.exists():
            spec[rel] = extract_spec(path)
    return spec


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true", help="write the baseline")
    parser.add_argument("--check", action="store_true", help="compare current code to the baseline")
    args = parser.parse_args()

    current = build_spec()

    if args.update:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        total = sum(len(v) for v in current.values())
        print(f"[sim_spec] wrote {BASELINE.relative_to(ROOT)} ({total} version branches)")
        return 0

    if args.check:
        if not BASELINE.exists():
            print("[sim_spec] no baseline; run --update first", file=sys.stderr)
            return 1
        baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
        if baseline == current:
            print("[sim_spec] OK — simulation contract identical to baseline")
            return 0
        print("[sim_spec] DIFFERENCES DETECTED")
        print(json.dumps({"baseline": baseline, "current": current}, indent=2, sort_keys=True))
        return 1

    print(json.dumps(current, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
