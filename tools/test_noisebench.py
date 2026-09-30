#!/usr/bin/env python3
"""Run the NoiseBench unit tests (tools/test_noisebench.groovy).

Groovy 4+ ships groovy-json as a separate module that is not on the launcher
classpath by default, so the jar is located and added explicitly.

Usage:
  python3 tools/test_noisebench.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def groovy_json_jars() -> list[str]:
    groovy = shutil.which("groovy")
    if groovy is None:
        return []
    real = Path(groovy).resolve()
    lib = real.parent.parent / "lib"
    if not lib.is_dir():
        return []
    return [str(j) for j in sorted(lib.glob("groovy-json-*.jar"))]


def main() -> int:
    groovy = shutil.which("groovy")
    if groovy is None:
        print("[test_noisebench] 'groovy' not found — skipping", file=sys.stderr)
        return 0
    jars = groovy_json_jars()
    cmd = [groovy]
    if jars:
        cmd += ["-cp", ":".join(jars)]
    cmd.append(str(ROOT / "tools" / "test_noisebench.groovy"))
    return subprocess.run(cmd).returncode


if __name__ == "__main__":
    sys.exit(main())
