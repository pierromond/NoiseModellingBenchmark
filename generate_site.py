#!/usr/bin/env python3

import os, re, sys, subprocess
from pathlib import Path
from datetime import datetime

ROOT     = Path(__file__).parent
WEBSITE  = ROOT / "website"
DATA_DIR = WEBSITE / "data"
TEMPLATE = WEBSITE / "template.html"
OUTPUT   = WEBSITE / "index.html"


def dem_url():
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    ref  = os.environ.get("GITHUB_REF_NAME", "")
    if not repo or not ref:
        return ""
    return (f"https://media.githubusercontent.com/media/{repo}/{ref}"
            "/input/clisson/clisson/DEM.geojson")


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
    subprocess.run([sys.executable, str(ROOT / "compare_versions.py")], check=False)


if __name__ == "__main__":
    main()
