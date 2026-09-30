#!/usr/bin/env python3

import os, re, sys, json, subprocess
from pathlib import Path
from datetime import datetime

from bench.config import load_config

ROOT     = Path(__file__).parent
WEBSITE  = ROOT / "website"
DATA_DIR = WEBSITE / "data"
TEMPLATE = WEBSITE / "template.html"
OUTPUT   = WEBSITE / "index.html"

CONFIG = load_config()


def dem_url():
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    ref  = os.environ.get("GITHUB_REF_NAME", "")
    if not repo or not ref:
        return ""
    return (f"https://media.githubusercontent.com/media/{repo}/{ref}"
            "/input/clisson/clisson/DEM.geojson")


NM_REPO = "Universite-Gustave-Eiffel/NoiseModelling"
NM_DOCS = "https://noise-planet.org/noisemodelling.html"

# Full NoiseModelling parameters, extracted from the simulation scripts so the
# published list can never drift from what is actually executed.
PARAM_LABELS = {
    "tableBuilding"                    : "Buildings table",
    "tableSources"                     : "Sources table",
    "tableReceivers"                   : "Receivers table",
    "tableDEM"                         : "Digital elevation model table",
    "tableGroundAbs"                   : "Ground absorption table",
    "confRaysName"                     : "Rays output table",
    "confReflOrder"                    : "Reflection order",
    "confMaxReflDist"                  : "Maximum reflection distance",
    "confDiffVertical"                 : "Vertical diffraction",
    "confMaxSrcDist"                   : "Maximum source distance",
    "confDiffHorizontal"               : "Horizontal diffraction",
    "confTemperature"                  : "Temperature",
    "confExportSourceId"               : "Export source identifier",
    "confMaxError"                     : "Maximum error",
    "confFavorableOccurrencesDefault"  : "Favourable occurrence probabilities (16 wind directions)",
    "confRecordProfile"                : "Record profiling",
    "confFavorableOccurrencesDay"      : "Favourable occurrence probabilities (day)",
}
PARAM_ORDER = list(PARAM_LABELS.keys())
PARAM_UNITS = {"confMaxSrcDist": "m", "confMaxReflDist": "m", "confTemperature": "°C"}


def _fmt(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def build_param_list(dataset_id, height_labels=None):
    """Build the published parameter rows from config/benchmark.json (models)."""
    model = CONFIG["models"][dataset_id]
    params = model["exec"]
    rows = []
    for key in PARAM_ORDER:
        if key not in params:
            continue
        unit = PARAM_UNITS.get(key)
        text = _fmt(params[key])
        rows.append([PARAM_LABELS[key], f"{text} {unit}".strip() if unit else text])
    if height_labels:
        for h in model.get("setHeight", []):
            label = height_labels.get(h["tableName"], f"Set_Height {h['tableName']}")
            rows.append([label, f"{_fmt(h['height'])} m"])
    return rows

# Files needed by the "Compare your software" tutorial, per dataset.
# Sourced from config/benchmark.json (single source of truth).
START_DATASETS = [
    {
        "id"           : dataset_id,
        "label"        : entry["label"],
        "folder"       : entry["folder"],
        "dir"          : ROOT / entry["dir"],
        "kind"         : entry["kind"],
        "speed"        : entry["speed"],
        "script"       : entry["tutorialScript"],
        "model_script" : entry["modelScript"],
        "files"        : entry["files"],
        "height_labels": entry.get("heightLabels"),
    }
    for dataset_id, entry in CONFIG["datasets"].items()
]


def repo_slug():
    return os.environ.get("GITHUB_REPOSITORY", "")


def ref_name():
    return os.environ.get("GITHUB_REF_NAME", "")


def media_url(path):
    repo, ref = repo_slug(), ref_name()
    return f"https://media.githubusercontent.com/media/{repo}/{ref}/{path}" if repo and ref else ""


def raw_url(path):
    repo, ref = repo_slug(), ref_name()
    return f"https://raw.githubusercontent.com/{repo}/{ref}/{path}" if repo and ref else ""


def version_key(version):
    match = re.match(r"v?(\d+)(?:\.(\d+))?(?:\.(\d+))?", version)
    if not match:
        return (0, 0, 0)
    return tuple(int(g) if g else 0 for g in match.groups())


def latest_release():
    versions_file = ROOT / "versions.json"
    if not versions_file.exists():
        return None, None
    releases = {k: v for k, v in json.loads(versions_file.read_text()).items()
                if v and "SNAPSHOT" not in k}
    if not releases:
        return None, None
    version = max(releases, key=version_key)
    return version, releases[version]


def write_start():
    release_version, release_url = latest_release()
    datasets = []
    for dataset in START_DATASETS:
        files = []
        for name in dataset["files"]:
            path = dataset["dir"] / name
            if path.exists():
                files.append({
                    "name": name,
                    "size": path.stat().st_size,
                    "url" : media_url(str(path.relative_to(ROOT))),
                })
        datasets.append({
            "id"    : dataset["id"],
            "label" : dataset["label"],
            "folder": dataset["folder"],
            "kind"  : dataset["kind"],
            "speed" : dataset["speed"],
            "files" : files,
            "script": {
                "name": os.path.basename(dataset["script"]),
                "url" : raw_url(dataset["script"]),
            },
            "params": build_param_list(dataset["id"], dataset.get("height_labels")),
        })
    start = {
        "repo"    : repo_slug(),
        "ref"     : ref_name(),
        "nmRepo"  : NM_REPO,
        "nmDocs"  : NM_DOCS,
        "release" : {"version": release_version, "url": release_url},
        "datasets": datasets,
    }
    (DATA_DIR / "start.json").write_text(json.dumps(start, indent=2) + "\n")


def write_settings():
    """Publish the Clisson reference parameters, read from config/benchmark.json."""
    params = CONFIG["models"]["clisson"]["exec"]

    occurrences = params.get("confFavorableOccurrencesDefault")
    occ_values = sorted({float(v.strip()) for v in occurrences.split(",")}) if occurrences else []

    settings = {
        "dataset"            : "Clisson, France",
        "source"             : CONFIG["datasets"]["clisson"]["modelScript"],
        "reflOrder"          : params.get("confReflOrder"),
        "maxSrcDist"         : params.get("confMaxSrcDist"),
        "maxError"           : params.get("confMaxError"),
        "diffHorizontal"     : params.get("confDiffHorizontal", False),
        "favorableOccurrence": occ_values[0] if len(occ_values) == 1 else None,
        "occurrencesPerDay"  : len(occurrences.split(",")) if occurrences else None,
        "tables"             : {
            "building" : params.get("tableBuilding"),
            "sources"  : params.get("tableSources"),
            "receivers": params.get("tableReceivers"),
        },
    }
    (DATA_DIR / "settings.json").write_text(json.dumps(settings, indent=2) + "\n")


def write_build():
    versions_file = ROOT / "versions.json"
    sources = {}
    if versions_file.exists():
        sources = {k: v for k, v in json.loads(versions_file.read_text()).items() if v}
    build = {
        "builtAt"       : datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "repo"          : os.environ.get("GITHUB_REPOSITORY", ""),
        "ref"           : os.environ.get("GITHUB_REF_NAME", ""),
        "sha"           : os.environ.get("GITHUB_SHA", ""),
        "runId"         : os.environ.get("GITHUB_RUN_ID", ""),
        "versionSources": sources,
    }
    (DATA_DIR / "build.json").write_text(json.dumps(build, indent=2) + "\n")


def render():
    content = TEMPLATE.read_text()
    content = content.replace("{{DEM_URL}}", dem_url())
    tag = f"<!-- built: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC -->"
    content = re.sub(r"<!-- built:.*?-->\n?", "", content)
    content = content.replace("</head>", f"{tag}\n</head>", 1)
    OUTPUT.write_text(content)


def main():

    WEBSITE.mkdir(exist_ok=True)
    DATA_DIR.mkdir(exist_ok=True)

    if not TEMPLATE.exists():
        sys.exit(1)

    render()
    write_settings()
    write_start()
    write_build()
    subprocess.run([sys.executable, str(ROOT / "compare_versions.py")], check=False)


if __name__ == "__main__":
    main()
