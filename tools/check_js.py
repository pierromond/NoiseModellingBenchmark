#!/usr/bin/env python3
"""Syntax-check every website JS module with `node --check`.

Usage:
  python3 tools/check_js.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS_DIR = ROOT / "website" / "js"


def main() -> int:
    node = shutil.which("node")
    if node is None:
        print("[check_js] 'node' not found — skipping", file=sys.stderr)
        return 0

    files = sorted(p for p in JS_DIR.glob("*.js") if p.is_file())
    if not files:
        print("[check_js] no JS modules found", file=sys.stderr)
        return 1

    failed = 0
    for path in files:
        proc = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
        if proc.returncode != 0:
            failed += 1
            sys.stderr.write(proc.stderr)
    if failed:
        print(f"[check_js] FAILED ({failed}/{len(files)})", file=sys.stderr)
        return 1
    print(f"[check_js] OK — {len(files)} modules parsed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
