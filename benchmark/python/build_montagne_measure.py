#!/usr/bin/env python3
"""Build Montagne receiver and measurement GeoJSON from the raw campaigns."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "benchmark/config/benchmark.json"
RAW = ROOT / "benchmark/input/montagne/measure/raw/mesures_l50_commun.geojson"
RECEIVERS = ROOT / "benchmark/input/montagne/RECEIVERS.geojson"
MEASURE = ROOT / "benchmark/input/montagne/measure/RECEIVERS_LEVEL.geojson"
PROJECT = ["cs2cs", "-f", "%.6f", "+proj=longlat", "+datum=WGS84",
           "+to", "+init=epsg:2154"]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def project(coordinates: list[float]) -> list[float]:
    result = subprocess.run(
        PROJECT,
        input=f"{coordinates[0]} {coordinates[1]}\n",
        capture_output=True,
        check=True,
        text=True,
    )
    values = result.stdout.split()
    return [float(values[0]), float(values[1])]


def main() -> None:
    config = load(CONFIG)
    campaigns = config["models"]["montagne"]["campaigns"]
    receivers = load(RECEIVERS)
    measure = load(MEASURE)
    raw_features = load(RAW)["features"]
    known_receivers = {
        str(feature["properties"].get("measurement_id"))
        for feature in receivers["features"]
    }
    known_measurements = {
        str(feature["properties"].get("measurement_id"))
        for feature in measure["features"]
    }
    next_id = max(int(f["properties"]["PK"]) for f in receivers["features"])
    added = 0

    for campaign_id, campaign in campaigns.items():
        date = campaign["date"]
        for raw in raw_features:
            props = raw["properties"]
            measurement_id = str(props.get("point_id", ""))
            if (props.get("campagne_id") != date
                    or props.get("point_type") == "sonometre_reference"
                    or not measurement_id
                    or props.get("l50_400hz_db") is None):
                continue

            coordinates = project(raw["geometry"]["coordinates"])
            if measurement_id not in known_receivers:
                next_id += 1
                receivers["features"].append({
                    "type": "Feature",
                    "properties": {
                        "PK": next_id,
                        "measurement_id": measurement_id,
                        "campagne": campaign_id,
                        "date": props["date"],
                        "device": props["device"],
                        "confiance": props.get("confiance"),
                        "leq_400hz_db": props["l50_400hz_db"],
                        "confTemperature_C": props.get("confTemperature_C"),
                        "confHumidity_pct": props.get("confHumidity_pct"),
                        "gps_n_fixes": props.get("gps_n_fixes"),
                        "gps_dispersion_m": props.get("gps_dispersion_m"),
                    },
                    "geometry": {"type": "Point", "coordinates": coordinates},
                })
                known_receivers.add(measurement_id)

            if measurement_id not in known_measurements:
                receiver_id = next(
                    int(f["properties"]["PK"])
                    for f in receivers["features"]
                    if str(f["properties"].get("measurement_id")) == measurement_id
                )
                measure["features"].append({
                    "type": "Feature",
                    "properties": {
                        "IDRECEIVER": receiver_id,
                        "LAEQ": round(float(props["l50_400hz_db"]), 2),
                        "campagne": campaign_id,
                        "measurement_id": measurement_id,
                        "metric": "l50_400hz_db",
                    },
                    "geometry": {"type": "Point", "coordinates": coordinates},
                })
                known_measurements.add(measurement_id)
                added += 1

    RECEIVERS.write_text(json.dumps(receivers, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    MEASURE.write_text(json.dumps(measure, ensure_ascii=False, separators=(",", ":")) + "\n",
                       encoding="utf-8")
    print(f"Added {added} measured receiver(s); {len(receivers['features'])} input receivers, "
          f"{len(measure['features'])} measured points total.")


if __name__ == "__main__":
    main()