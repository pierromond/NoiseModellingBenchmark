#!/usr/bin/env python3
"""Smoke-check that every NoiseModelling Groovy script still parses.

Uses the local `groovy` binary (GroovyShell.parse). This catches syntax errors,
unbalanced blocks and malformed edits introduced while refactoring. It does not
execute the scripts and therefore needs no dataset or NM binary.

Usage:
  python3 tools/check_groovy.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARSER = Path(__file__).resolve().parent / "parse_groovy.groovy"


def main() -> int:
    groovy = shutil.which("groovy")
    if groovy is None:
        print("[check_groovy] 'groovy' not found on PATH — skipping", file=sys.stderr)
        return 0

    files = sorted((ROOT / "nm_version" / "src" / "main" / "groovy").rglob("*.groovy"))
    if not files:
        print("[check_groovy] no Groovy scripts found", file=sys.stderr)
        return 1

    proc = subprocess.run([groovy, str(PARSER), *[str(f) for f in files]])
    if proc.returncode != 0:
        print(f"[check_groovy] FAILED ({len(files)} scripts checked)", file=sys.stderr)
    else:
        print(f"[check_groovy] OK — {len(files)} scripts parsed")
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
