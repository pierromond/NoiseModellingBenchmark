#!/usr/bin/env bash
# Shared helpers for the benchmark drivers (Clisson and La Montagne).
# Sourced by benchmark_run_clisson.sh and benchmark_run_montagne.sh.
# Expects $INPUT_DIR to be defined by the sourcing script for downloads.

list_versions() {
    python3 - <<'PY'
import json
with open("versions.json") as f:
    for version in sorted(json.load(f)):
        print(version)
PY
}

nm_url() {
    python3 - "$1" <<'PY'
import json, sys
with open("versions.json") as f:
    print(json.load(f).get(sys.argv[1], ""))
PY
}

download_nm_version() {
    local version="$1"
    local url="$2"
    local zip_name
    zip_name="$INPUT_DIR/NoiseModelling_without_gui_${version}.zip"
    local extract_dir="$INPUT_DIR/NoiseModelling_without_gui_${version}"

    if [ -d "$extract_dir" ]; then
        return 0
    fi

    curl -fL "$url" -o "$zip_name" --progress-bar || { return 1; }

    local tmp_dir
    tmp_dir=$(mktemp -d)

    unzip -q "$zip_name" -d "$tmp_dir" || {
        rm -rf "$tmp_dir"
        return 1
    }
    local entries
    entries=($(find "$tmp_dir" -mindepth 1 -maxdepth 1))

    if [ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ]; then
        mv "${entries[0]}" "$extract_dir"
    else
        mkdir -p "$extract_dir"
        shopt -s dotglob
        mv "$tmp_dir"/* "$extract_dir"/
    fi

    rm -rf "$tmp_dir"
}

find_wps_binary() {
    local nm_dir="$1"
    local bin
    bin=$(find "$nm_dir" -name "wps_scripts" -type f -print -quit 2>/dev/null)
    if [ -z "$bin" ]; then
        return 1
    fi
    chmod +x "$bin"
    echo "$bin"
}

find_wps_binary_v6() {
    local nm_dir="$1"
    local bin
    bin=$(find "$nm_dir" -name "ScriptRunner" -type f -print -quit 2>/dev/null)
    if [ -z "$bin" ]; then
        return 1
    fi
    chmod +x "$bin"
    echo "$bin"
}
