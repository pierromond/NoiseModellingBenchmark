#!/usr/bin/env bash
#set -euo pipefail

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

GROOVY_SCRIPT="nm_version/src/main/groovy/montagne/montagneV5.groovy"
GROOVY_SCRIPT_v6="nm_version/src/main/groovy/montagne/montagneV6.groovy"

INPUT_DIR="input"
OUTPUT_DIR="output/montagne"
WEBSITE_DIR="website"
DATA_DIR="$WEBSITE_DIR/data/montagne"

mkdir -p "$INPUT_DIR" "$OUTPUT_DIR" "$WEBSITE_DIR" "$DATA_DIR"

download_montagne() {
    local clisson_dir=$INPUT_DIR
    if [ -d "$clisson_dir/montagne" ]; then
        return 0
    fi
    cp -r "montagne/" "$clisson_dir/"
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
    bin=$(find "$nm_dir" -name "wps_scripts" -type f 2>/dev/null | head -n 1)
    if [ -z "$bin" ]; then
        return 1
    fi
    chmod +x "$bin"
    echo "$bin"
}

find_wps_binary_v6() {
    local nm_dir="$1"
    local bin
    bin=$(find "$nm_dir" -name "ScriptRunner" -type f 2>/dev/null | head -n 1)
    if [ -z "$bin" ]; then
        return 1
    fi
    chmod +x "$bin"
    echo "$bin"
}

run_simulation() {
    local version="$1"
    local nm_dir="$INPUT_DIR/NoiseModelling_without_gui_${version}"
    local out_dir="$OUTPUT_DIR/$version"
    local stats_file="$out_dir/stats_${version}.json"

    mkdir -p "$out_dir"

    local wps_bin
    if [[ "$version" == v6* ]]; then
        wps_bin=$(find_wps_binary_v6 "$nm_dir") || return 1
    else
        wps_bin=$(find_wps_binary "$nm_dir") || return 1
    fi

    local workspace="$out_dir/workspace"
    mkdir -p "$workspace"

    if [ "$version" = "v4.0.0" ] || [ "$version" = "v4.0.1" ]; then
        "$wps_bin" \
            -w"$workspace" \
            -s"$GROOVY_SCRIPT" \
            -d"test4" \
            NM_version="$version" \
            > "$out_dir/simulation.log" 2>&1
    elif [[ "$version" == v6* ]]; then
        "$wps_bin" \
            -w "$workspace" \
            -s "$GROOVY_SCRIPT_v6" \
            -NM_version "$version" \
            > "$out_dir/simulation.log" 2>&1
    else
        "$wps_bin" \
            -w "$workspace" \
            -s "$GROOVY_SCRIPT" \
            -d "test5" \
            -NM_version "$version" \
            > "$out_dir/simulation.log" 2>&1
    fi
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        return 1
    fi

    if [ ! -f "$stats_file" ]; then
        local groovy_out="$OUTPUT_DIR/${version}/stats_${version}.json"
        if [ -f "$groovy_out" ]; then
            cp "$groovy_out" "$stats_file"
        fi
    fi
}

aggregate_results() {
    local agg_file="$DATA_DIR/results.json"

    echo "[" > "$agg_file"
    local first=true

    for version_dir in "$OUTPUT_DIR"/*/; do
        [ -d "$version_dir" ] || continue

        local version
        version="$(basename "$version_dir")"

        local stats="$version_dir/stats_${version}.json"

        if [ ! -f "$stats" ]; then
            continue
        fi

        if [ "$first" = false ]; then
            echo "," >> "$agg_file"
        fi

        python3 - "$version" "$stats" >> "$agg_file" <<'EOF'
import json, sys

version = sys.argv[1]

with open(sys.argv[2]) as f:
    data = json.load(f)

data["version"] = version

print(json.dumps(data, indent=2))
EOF

        first=false
    done

    echo "]" >> "$agg_file"
}


copy_geojson() {
    for version_dir in "$OUTPUT_DIR"/*/; do
        [ -d "$version_dir" ] || continue

        local version
        version="$(basename "$version_dir")"

        mkdir -p "$DATA_DIR/$version"

        local receivgeojson="$version_dir/RECEIVERS_LEVEL.geojson"

        if [ -f "$receivgeojson" ]; then
            cp "$receivgeojson" \
               "$DATA_DIR/$version/RECEIVERS_LEVEL.geojson"
        fi
    done

    # Couches cartographiques communes : identiques pour toutes les versions
    # (pas d'iso-contours pour La Montagne, et pas le DEM de 219 Mo).
    mkdir -p "$DATA_DIR/layers"
    for layer in BUILDINGS.geojson GROUNDS.geojson LW_ROADS.geojson RECEIVERS.geojson; do
        local src="$INPUT_DIR/montagne/$layer"
        if [ -f "$src" ]; then
            cp "$src" "$DATA_DIR/layers/$layer"
        fi
    done

    # Référence mesurée (petite, pas le DEM de 219 Mo) publiée pour le site.
    local measure_src="$INPUT_DIR/montagne/measure/RECEIVERS_LEVEL.geojson"
    if [ -f "$measure_src" ]; then
        mkdir -p "$DATA_DIR/measure"
        cp "$measure_src" "$DATA_DIR/measure/RECEIVERS_LEVEL.geojson"
    fi
}


run_one_version() {
    local version="$1"
    local nm_dir="$INPUT_DIR/NoiseModelling_without_gui_${version}"

    if [ -d "$nm_dir" ]; then
        echo " NM déjà présent : $nm_dir — skip download."
        ls "$nm_dir"
    else
        local url
        url="$(nm_url "$version")"
        if [ -z "$url" ]; then
            echo "Aucune URL pour $version dans versions.json"
            echo "Dossier attendu (binaire fourni par artifact) : $nm_dir"
            return 1
        fi
        download_nm_version "$version" "$url" || {
            echo "Echec download pour $version"
            return 1
        }
    fi

    download_montagne

    echo "Lancement simulation $version..."
    run_simulation "$version" || {
        echo "Echec simulation pour $version"
        return 1
    }
}


run_aggregate_only() {
    aggregate_results
    copy_geojson
    python3 compare_versions_montagne.py
}


run_all_sequential() {
    download_montagne
    local failed_versions=()
    local version url
    while read -r version; do
        url="$(nm_url "$version")"
        if [ -z "$url" ]; then
            echo "Pas d'URL pour $version — ignoré (binaire fourni par artifact uniquement)."
            continue
        fi
        download_nm_version "$version" "$url" || {
            failed_versions+=("$version")
            continue
        }
        echo " version $version"
        run_simulation "$version" || {
            failed_versions+=("$version")
            continue
        }
    done < <(list_versions)

    if [ ${#failed_versions[@]} -gt 0 ]; then
        echo "Versions en échec : ${failed_versions[*]}"
    fi

    run_aggregate_only
}

main() {
    case "${1:-}" in
        --version)
            run_one_version "$2"
            ;;
        --aggregate-only)
            run_aggregate_only
            ;;
        *)
            run_all_sequential
            ;;
    esac
}

main "$@"
