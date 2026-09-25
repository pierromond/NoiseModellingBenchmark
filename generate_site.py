#!/usr/bin/env python3

import os, re, sys, json, subprocess
from pathlib import Path
from datetime import datetime

ROOT     = Path(__file__).parent
WEBSITE  = ROOT / "website"
DATA_DIR = WEBSITE / "data"
TEMPLATE = WEBSITE / "template.html"
OUTPUT   = WEBSITE / "index.html"
SCRIPT   = ROOT / "nm_version" / "src" / "main" / "groovy" / "runscriptV6.0.groovy"


def dem_url():
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    ref  = os.environ.get("GITHUB_REF_NAME", "")
    if not repo or not ref:
        return ""
    return (f"https://media.githubusercontent.com/media/{repo}/{ref}"
            "/input/clisson/clisson/DEM.geojson")


def num(pattern, text, cast=float, default=None):
    match = re.search(pattern, text)
    return cast(match.group(1)) if match else default


NM_REPO = "Universite-Gustave-Eiffel/NoiseModelling"
NM_DOCS = "https://noise-planet.org/noisemodelling.html"

# Files needed by the "Compare your software" tutorial, per dataset.
START_DATASETS = [
    {
        "id"    : "clisson",
        "label" : "Clisson",
        "folder": "clisson",
        "dir"   : ROOT / "input/clisson/clisson",
        "kind"  : "Road-traffic noise map (line sources)",
        "speed" : "~15 min",
        "script": "nm_version/src/main/groovy/getting_started/compare_clisson.groovy",
        "files" : ["BUILDINGS.geojson", "DEM.geojson", "GROUNDS.geojson",
                   "LW_ROADS.geojson", "RECEIVERS.geojson"],
    },
    {
        "id"    : "montagne",
        "label" : "La Montagne",
        "folder": "montagne",
        "dir"   : ROOT / "input/montagne",
        "kind"  : "Single point source (a siren on a roof)",
        "speed" : "< 1 min",
        "script": "nm_version/src/main/groovy/getting_started/compare_montagne.groovy",
        "files" : ["BUILDINGS.geojson", "DEM.geojson", "GROUNDS.geojson",
                   "LW_ROADS.geojson", "RECEIVERS.geojson"],
    },
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
    if not SCRIPT.exists():
        return
    text = SCRIPT.read_text()

    occurrences = re.search(r"confFavorableOccurrencesDefault\"?\s*:\s*'([^']+)'", text)
    occ_values = []
    if occurrences:
        occ_values = sorted({float(v.strip()) for v in occurrences.group(1).split(",")})

    settings = {
        "dataset"            : "Clisson, France",
        "source"             : str(SCRIPT.relative_to(ROOT)),
        "reflOrder"          : num(r'"confReflOrder"\s*:\s*(\d+)', text, int),
        "maxSrcDist"         : num(r'"confMaxSrcDist"\s*:\s*(\d+)', text, int),
        "maxError"           : num(r'"confMaxError"\s*:\s*([\d.]+)', text, float),
        "diffHorizontal"     : bool(re.search(r'"confDiffHorizontal"\s*:\s*true', text)),
        "favorableOccurrence": occ_values[0] if len(occ_values) == 1 else None,
        "occurrencesPerDay"  : len(occurrences.group(1).split(",")) if occurrences else None,
        "tables"             : {
            "building": re.search(r'"tableBuilding"\s*:\s*"([^"]+)"', text).group(1)
            if re.search(r'"tableBuilding"\s*:\s*"([^"]+)"', text) else None,
            "sources" : re.search(r'"tableSources"\s*:\s*"([^"]+)"', text).group(1)
            if re.search(r'"tableSources"\s*:\s*"([^"]+)"', text) else None,
            "receivers": re.search(r'"tableReceivers"\s*:\s*"([^"]+)"', text).group(1)
            if re.search(r'"tableReceivers"\s*:\s*"([^"]+)"', text) else None,
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
