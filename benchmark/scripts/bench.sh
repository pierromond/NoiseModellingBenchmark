#!/usr/bin/env bash
# Single orchestration entry point for the benchmark drivers.
#
# Usage:
#   bash scripts/bench.sh --dataset <clisson|montagne> [--version <v> | --aggregate-only]
#
# The historical entry points (benchmark_run_clisson.sh / benchmark_run_montagne.sh)
# are thin wrappers around this script; their CLI and behaviour are unchanged.
set -eo pipefail

DATASET=""
ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --dataset) DATASET="$2"; shift 2 ;;
        *) ARGS+=("$1"); shift ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

INPUT_DIR="benchmark/input"
WEBSITE_DIR="website"

case "$DATASET" in
    clisson)
        OUTPUT_DIR="benchmark/output"
        DATA_DIR="$WEBSITE_DIR/data"
        GROOVY_SCRIPT="benchmark/simulations/runscriptV5.0.groovy"
        GROOVY_SCRIPT_v6="benchmark/simulations/runscriptV6.0.groovy"
        DB4=""
        DB5=""
        FINALIZE="clisson"
        ;;
    montagne)
        OUTPUT_DIR="benchmark/output/montagne"
        DATA_DIR="$WEBSITE_DIR/data/montagne"
        GROOVY_SCRIPT="benchmark/simulations/montagne/montagneV5.groovy"
        GROOVY_SCRIPT_v6="benchmark/simulations/montagne/montagneV6.groovy"
        DB4="-dtest4"
        DB5="-d test5"
        FINALIZE="montagne"
        ;;
    *)
        echo "Usage: $0 --dataset <clisson|montagne> [--version <v> | --aggregate-only]" >&2
        exit 2
        ;;
esac

# Shared helpers (versions, download, binary discovery).
source "$SCRIPT_DIR/lib/common.sh"

mkdir -p "$INPUT_DIR" "$OUTPUT_DIR" "$WEBSITE_DIR" "$DATA_DIR"

# La Montagne ships its dataset in the repository and copies it into input/ once.
prepare_dataset() {
    if [ "$DATASET" = "montagne" ] && [ ! -d "$INPUT_DIR/montagne" ]; then
        cp -r "montagne/" "$INPUT_DIR/"
    fi
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

    local args
    if [ "$version" = "v4.0.0" ] || [ "$version" = "v4.0.1" ]; then
        args=( -w"$workspace" -s"$GROOVY_SCRIPT" )
        if [ -n "$DB4" ]; then args+=( $DB4 ); fi
        args+=( NM_version="$version" )
    elif [[ "$version" == v6* ]]; then
        args=( -w "$workspace" -s "$GROOVY_SCRIPT_v6" -NM_version "$version" )
    else
        args=( -w "$workspace" -s "$GROOVY_SCRIPT" )
        if [ -n "$DB5" ]; then args+=( $DB5 ); fi
        args+=( -NM_version "$version" )
    fi

    "$wps_bin" "${args[@]}" > "$out_dir/simulation.log" 2>&1
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
    if [ "$DATASET" = "clisson" ]; then
        python3 - "$OUTPUT_DIR" "$DATA_DIR/results.json" <<'PY'
import json, sys
from pathlib import Path

out_dir = Path(sys.argv[1])
results = []

for version_dir in sorted(out_dir.iterdir()):
    if not version_dir.is_dir():
        continue
    stats = version_dir / f"stats_{version_dir.name}.json"
    if not stats.exists():
        continue
    data = json.loads(stats.read_text())
    data["version"] = version_dir.name
    results.append(data)

Path(sys.argv[2]).write_text(json.dumps(results, indent=2) + "\n")
print(f"results.json : {len(results)} version(s)")
PY
        return
    fi

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
    if [ "$DATASET" = "clisson" ]; then
        copy_geojson_clisson
    else
        copy_geojson_montagne
    fi
}

copy_geojson_clisson() {
    local CLISSON_DIR="$INPUT_DIR/clisson/clisson"

    declare -A COMMON_LAYERS=(
        ["BUILDINGS.geojson"]="BUILDINGS.geojson"
        ["RECEIVERS.geojson"]="RECEIVERS.geojson"
        ["ROADS.geojson"]="ROADS.geojson"
        ["GROUNDS.geojson"]="GROUNDS.geojson"
    )

    for version_dir in "$OUTPUT_DIR"/*/; do
        [ -d "$version_dir" ] || continue

        local version
        version="$(basename "$version_dir")"

        mkdir -p "$DATA_DIR/$version"

        local receivgeojson="$version_dir/RECEIVERS_LEVEL.geojson"
        if [ -f "$receivgeojson" ]; then
            cp "$receivgeojson" "$DATA_DIR/$version/RECEIVERS_LEVEL.geojson"
        fi

        local iso_src="$version_dir/ISO_CONTOUR.geojson"
        if [ -f "$iso_src" ]; then
            cp "$iso_src" "$DATA_DIR/$version/ISO_CONTOUR.geojson"
        fi

        for dest_name in "${!COMMON_LAYERS[@]}"; do
            local src_name="${COMMON_LAYERS[$dest_name]}"
            local src="$CLISSON_DIR/$src_name"
            if [ -f "$src" ]; then
                cp "$src" "$DATA_DIR/$version/$dest_name"
            fi
        done
    done
}

copy_geojson_montagne() {
    for version_dir in "$OUTPUT_DIR"/*/; do
        [ -d "$version_dir" ] || continue

        local version
        version="$(basename "$version_dir")"

        mkdir -p "$DATA_DIR/$version"

        local receivgeojson="$version_dir/RECEIVERS_LEVEL.geojson"
        if [ -f "$receivgeojson" ]; then
            cp "$receivgeojson" "$DATA_DIR/$version/RECEIVERS_LEVEL.geojson"
        fi
    done

    # Couches cartographiques communes : identiques pour toutes les versions
    # (pas d'iso-contours pour La Montagne, et pas le DEM de 219 Mo).
    # Les batiments et la nature du sol sont publies sous les noms historiques
    # BUILDINGS.geojson / GROUNDS.geojson attendus par le site.
    mkdir -p "$DATA_DIR/layers"
    declare -A MONTAGNE_LAYERS=(
        ["la_montagne_batiment.geojson"]="BUILDINGS.geojson"
        ["la_montagne_naturesol.geojson"]="GROUNDS.geojson"
        ["LW_ROADS.geojson"]="LW_ROADS.geojson"
        ["RECEIVERS.geojson"]="RECEIVERS.geojson"
    )
    for src_name in "${!MONTAGNE_LAYERS[@]}"; do
        local src="$INPUT_DIR/montagne/$src_name"
        if [ -f "$src" ]; then
            cp "$src" "$DATA_DIR/layers/${MONTAGNE_LAYERS[$src_name]}"
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

    prepare_dataset

    echo "Lancement simulation $version..."
    run_simulation "$version" || {
        echo "Echec simulation pour $version"
        return 1
    }
}

run_aggregate_only() {
    aggregate_results
    copy_geojson
    if [ "$FINALIZE" = "clisson" ]; then
        python3 benchmark/python/compare_versions.py
        python3 website/build.py
    else
        python3 benchmark/python/compare_versions_montagne.py
    fi
}

run_all_sequential() {
    prepare_dataset
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
    case "${ARGS[0]:-}" in
        --version)
            run_one_version "${ARGS[1]}"
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
