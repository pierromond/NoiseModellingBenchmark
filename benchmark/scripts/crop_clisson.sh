#!/usr/bin/env bash
# Regenerate the cropped Clisson benchmark dataset from the raw LFS dataset.
#
# Receiver area : 300 m x 300 m, centred on the raw receiver extent.
# Buffer       : 1250 m of buildings/roads/DEM around the receiver area, which
#                covers confMaxSrcDist=800 m + confMaxReflDist=350 m.
#
# Usage: bash benchmark/scripts/crop_clisson.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SRC="benchmark/input/clisson/clisson"
DST="benchmark/input/clisson/cropped"

CX=374869.749743
CY=6674043.597677
RH=150
BH=1400

RX0=$(python3 -c "print($CX-$RH)")
RX1=$(python3 -c "print($CX+$RH)")
RY0=$(python3 -c "print($CY-$RH)")
RY1=$(python3 -c "print($CY+$RH)")
BX0=$(python3 -c "print($CX-$BH)")
BX1=$(python3 -c "print($CX+$BH)")
BY0=$(python3 -c "print($CY-$BH)")
BY1=$(python3 -c "print($CY+$BH)")

mkdir -p "$DST"

ogr2ogr -f GeoJSON -spat "$RX0" "$RY0" "$RX1" "$RY1" \
    "$DST/RECEIVERS.geojson" "$SRC/RECEIVERS.geojson"

for layer in BUILDINGS GROUNDS LW_ROADS LW_ROADS_LW ROADS; do
    ogr2ogr -f GeoJSON -clipsrc "$BX0" "$BY0" "$BX1" "$BY1" \
        "$DST/$layer.geojson" "$SRC/$layer.geojson"
done

ogr2ogr -f GeoJSON -spat "$BX0" "$BY0" "$BX1" "$BY1" \
    "$DST/DEM.geojson" "$SRC/DEM.geojson"

# Keep only triangles whose three vertices are receivers inside the crop.
python3 - "$DST" <<'PY'
import json, sys
from pathlib import Path

dst = Path(sys.argv[1])
receivers = json.loads((dst / "RECEIVERS.geojson").read_text())
pks = {int(f["properties"]["PK"]) for f in receivers["features"]}
triangles = json.loads((dst.parent / "clisson" / "TRIANGLES.geojson").read_text())
triangles["features"] = [
    f for f in triangles["features"]
    if all(int(f["properties"][k]) in pks for k in ("PK_1", "PK_2", "PK_3"))
]
(dst / "TRIANGLES.geojson").write_text(json.dumps(triangles))
print(f"{len(receivers['features'])} receivers, {len(triangles['features'])} triangles")
PY
