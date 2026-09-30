#!/usr/bin/env python3
"""Verify the observable outputs still match the characterisation baseline.

By default the aggregation-only pipeline is re-run (both datasets) and every
generated artifact is compared with tools/baseline/snapshot.json.

Usage:
  python3 tools/check.py            # regenerate outputs and compare
  python3 tools/check.py --no-run   # compare the current state without re-running
  python3 tools/check.py --update   # accept the current state as the new baseline

Exit code is 0 when identical, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import snapshot

ROOT = snapshot.ROOT
BASELINE = snapshot.BASELINE


def load_baseline() -> dict[str, str]:
    if not BASELINE.exists():
        raise SystemExit(
            f"[check] missing baseline {BASELINE.relative_to(ROOT)}: "
            "run 'python3 tools/snapshot.py --update' first"
        )
    return json.loads(BASELINE.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-run", action="store_true", help="do not re-run the pipeline")
    parser.add_argument("--update", action="store_true", help="write the current state as the new baseline")
    args = parser.parse_args()

    if not args.no_run:
        snapshot.run_pipeline()

    current = snapshot.build_snapshot()

    if args.update:
        BASELINE.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"[check] baseline updated ({len(current)} files)")
        return 0

    baseline = load_baseline()

    missing = sorted(set(baseline) - set(current))
    added = sorted(set(current) - set(baseline))
    changed = sorted(k for k in set(baseline) & set(current) if baseline[k] != current[k])

    if not (missing or added or changed):
        print(f"[check] OK — {len(current)} artifacts identical to baseline")
        return 0

    print("[check] DIFFERENCES DETECTED")
    for name, entries in (("missing", missing), ("added", added), ("changed", changed)):
        for rel in entries:
            if name == "missing":
                print(f"  - {rel} (missing)")
            elif name == "added":
                print(f"  + {rel} (added)")
            else:
                print(f"  ~ {rel}  {baseline[rel][:12]} -> {current[rel][:12]}")
    print(f"[check] {len(missing)} missing, {len(added)} added, {len(changed)} changed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
