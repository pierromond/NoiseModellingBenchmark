#!/usr/bin/env bash
# Run the benchmark on a NoiseModelling pull request and compare it with the
# published benchmark versions.
#
# Usage:
#   bash benchmark/scripts/bench_pr.sh --pr 1092
#   bash benchmark/scripts/bench_pr.sh --pr 1092 --dataset clisson
#   bash benchmark/scripts/bench_pr.sh --pr 1092 --artifact-zip /tmp/NoiseModelling-1092_merge.zip
#   bash benchmark/scripts/bench_pr.sh --pr 1092 --skip-run
#
# The result is written under website/data/pr/<pr>/ and is never mixed into
# the official results/comparisons.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

PR=""
ARTIFACT_ZIP=""
MANIFEST=""
DATASET="both"
BASELINE="existing"
BASELINE_SOURCE="auto"
SKIP_RUN=0

usage() {
    cat <<'USAGE'
Usage:
  bash benchmark/scripts/bench_pr.sh --pr <number> [options]

Options:
  --pr <number>              NoiseModelling pull request number
  --artifact-zip <file>      use an already downloaded CI artifact
  --manifest <file>          reuse an existing resolve manifest
  --dataset both|clisson|montagne
  --baseline existing|same-series|none
  --baseline-source auto|local|pages
  --skip-run                 compare existing benchmark output only
USAGE
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --pr) PR="$2"; shift 2 ;;
        --artifact-zip) ARTIFACT_ZIP="$2"; shift 2 ;;
        --manifest) MANIFEST="$2"; shift 2 ;;
        --dataset) DATASET="$2"; shift 2 ;;
        --baseline) BASELINE="$2"; shift 2 ;;
        --baseline-source) BASELINE_SOURCE="$2"; shift 2 ;;
        --skip-run) SKIP_RUN=1; shift ;;
        -h|--help) usage ;;
        *) echo "Unknown argument: $1" >&2; usage ;;
    esac
done

if [ -z "$PR" ] && [ -z "$MANIFEST" ]; then
    usage
fi

case "$DATASET" in
    both|clisson|montagne) ;;
    *) echo "--dataset must be both, clisson or montagne" >&2; exit 2 ;;
esac
case "$BASELINE" in
    existing|same-series|none) ;;
    *) echo "--baseline must be existing, same-series or none" >&2; exit 2 ;;
esac
case "$BASELINE_SOURCE" in
    auto|local|pages) ;;
    *) echo "--baseline-source must be auto, local or pages" >&2; exit 2 ;;
esac

if [ -z "$MANIFEST" ]; then
    MANIFEST="benchmark/output/pr/${PR}/manifest.json"
fi

if [ ! -f "$MANIFEST" ]; then
    if [ -z "$PR" ]; then
        echo "Manifest not found: $MANIFEST" >&2
        exit 1
    fi
    echo "Resolving PR #$PR..."
    resolve_args=(resolve "$PR" --output "$MANIFEST")
    if [ -n "$ARTIFACT_ZIP" ]; then
        resolve_args+=(--artifact-zip "$ARTIFACT_ZIP")
    fi
    python3 benchmark/scripts/ci/nm_pr.py "${resolve_args[@]}"
fi

json_get() {
    python3 - "$MANIFEST" "$1" <<'PY'
import json, sys
with open(sys.argv[1]) as handle:
    value = json.load(handle).get(sys.argv[2], "")
print("" if value is None else value)
PY
}

LABEL="$(json_get label)"
ARTIFACT_URL="$(json_get artifactUrl)"
ARTIFACT_ZIP_FROM_MANIFEST="$(json_get artifactZip)"
PR_NUMBER="$(json_get pr)"

if [ -z "$LABEL" ]; then
    echo "Cannot read a label from $MANIFEST" >&2
    exit 1
fi

NM_DIR="benchmark/input/NoiseModelling_without_gui_${LABEL}"

extract_binary() {
    local archive="$1"
    local destination="$2"
    local tmp
    tmp="$(mktemp -d)"
    if ! unzip -q "$archive" -d "$tmp"; then
        rm -rf "$tmp"
        return 1
    fi
    mkdir -p "$destination"
    if [ -d "$tmp/bin" ]; then
        cp -a "$tmp"/. "$destination"/
    else
        local root
        root="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        if [ -n "$root" ]; then
            cp -a "$root"/. "$destination"/
        else
            cp -a "$tmp"/. "$destination"/
        fi
    fi
    rm -rf "$tmp"
}

if [ "$SKIP_RUN" -eq 0 ] && [ ! -d "$NM_DIR" ]; then
    if [ -n "$ARTIFACT_ZIP" ]; then
        archive="$ARTIFACT_ZIP"
    elif [ -n "$ARTIFACT_ZIP_FROM_MANIFEST" ]; then
        archive="$ARTIFACT_ZIP_FROM_MANIFEST"
    elif [ -n "$ARTIFACT_URL" ]; then
        TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
        if [ -z "$TOKEN" ] && command -v gh >/dev/null 2>&1; then
            TOKEN="$(gh auth token 2>/dev/null || true)"
        fi
        if [ -z "$TOKEN" ]; then
            echo "GH_TOKEN/GITHUB_TOKEN is required to download the PR artifact." >&2
            echo "Download it manually and pass --artifact-zip." >&2
            exit 1
        fi
        archive="$(mktemp --suffix=.zip)"
        echo "Downloading PR artifact..."
        curl -fL \
            -H "Authorization: Bearer $TOKEN" \
            -H "Accept: application/vnd.github+json" \
            "$ARTIFACT_URL" -o "$archive"
    else
        echo "No artifact URL in $MANIFEST and no --artifact-zip provided." >&2
        exit 1
    fi
    echo "Extracting binary to $NM_DIR"
    extract_binary "$archive" "$NM_DIR"
fi

if [ "$SKIP_RUN" -eq 0 ]; then
    if [ "$DATASET" = "both" ] || [ "$DATASET" = "clisson" ]; then
        echo "Running Clisson for $LABEL..."
        bash benchmark/drivers/benchmark_run_clisson.sh --version "$LABEL"
    fi
    if [ "$DATASET" = "both" ] || [ "$DATASET" = "montagne" ]; then
        echo "Running La Montagne for $LABEL..."
        bash benchmark/drivers/benchmark_run_montagne.sh --version "$LABEL"
    fi
fi

python3 benchmark/python/compare_pr.py \
    --pr "$PR_NUMBER" \
    --label "$LABEL" \
    --manifest "$MANIFEST" \
    --dataset "$DATASET" \
    --baseline "$BASELINE" \
    --baseline-source "$BASELINE_SOURCE" \
    --out website/data/pr \
    --report-dir "benchmark/output/pr/${PR_NUMBER}"

echo
echo "PR result written to website/data/pr/${PR_NUMBER}/"
echo "Report: benchmark/output/pr/${PR_NUMBER}/report.md"
