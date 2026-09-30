#!/usr/bin/env python3
"""versions.json helpers used by the CI workflow (kept out of the YAML).

Subcommands:
  matrix              print matrix11=... and matrix25=... (for $GITHUB_OUTPUT)
  summary             print a human readable summary
  contains <vX.Y.Z>   exit 0 if the version is already listed
  head                print the head version (the one without URL), without the "v"
  register <X.Y.Z>    add the version as the new head, dropping older heads
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

VERSIONS = Path("benchmark/versions.json")


def _load() -> dict:
    return json.loads(VERSIONS.read_text())


def cmd_matrix() -> None:
    d = _load()
    released = [v for v in sorted(d) if d[v]]
    print("matrix11=" + json.dumps([v for v in released if not v.startswith("v6")]))
    print("matrix25=" + json.dumps([v for v in released if v.startswith("v6")]))


def cmd_summary() -> None:
    d = _load()
    print("java11 :", sorted(v for v, url in d.items() if url and not v.startswith("v6")))
    print("java25 :", sorted(v for v, url in d.items() if url and v.startswith("v6")))
    print("head (artifact, java25) :", sorted(v for v, url in d.items() if not url))


def cmd_contains(version: str) -> int:
    return 0 if version in _load() else 1


def cmd_head() -> None:
    heads = sorted(v for v, url in _load().items() if not url)
    print(heads[-1][1:] if heads else "")


def cmd_register(version: str) -> None:
    key = f"v{version}"
    d = _load()
    if key in d and d[key] == "":
        print(f"{key} déjà présent")
        return
    d[key] = ""
    for old in sorted(k for k, v in d.items() if not v and k != key):
        del d[old]
        print(f"{old} retirée (une seule version head conservée)")
    VERSIONS.write_text(json.dumps(d, indent=2, sort_keys=True) + "\n")
    print(f"{key} ajoutée dans versions.json (URL à compléter)")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    cmd = sys.argv[1]
    if cmd == "matrix":
        cmd_matrix()
    elif cmd == "summary":
        cmd_summary()
    elif cmd == "contains" and len(sys.argv) == 3:
        return cmd_contains(sys.argv[2])
    elif cmd == "head":
        cmd_head()
    elif cmd == "register" and len(sys.argv) == 3:
        cmd_register(sys.argv[2])
    else:
        print(f"unknown command: {cmd}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
