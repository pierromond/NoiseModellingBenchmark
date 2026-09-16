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
    write_build()
    subprocess.run([sys.executable, str(ROOT / "compare_versions.py")], check=False)


if __name__ == "__main__":
    main()
