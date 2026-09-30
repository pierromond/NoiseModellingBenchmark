#!/usr/bin/env bash
# Run every characterisation guard. Exit non-zero on the first failure.
#
#   tools/run_checks.sh            # full run (regenerates website/data + index.html)
#   tools/run_checks.sh --no-run   # compare current state without regenerating
set -u
cd "$(dirname "$0")/.." || exit 1

status=0
python3 tools/sim_spec.py --check              || status=1
python3 tools/check.py "$@"                     || status=1
python3 tools/check_groovy.py                   || status=1
python3 tools/test_noisebench.py                || status=1
python3 tools/validate_outputs.py --no-run      || status=1

if [ "$status" -eq 0 ]; then
    echo "[run_checks] ALL OK"
else
    echo "[run_checks] FAILURES DETECTED" >&2
fi
exit "$status"
