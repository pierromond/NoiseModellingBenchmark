#!/usr/bin/env python3

import os, re, sys, json, shutil, subprocess
from pathlib import Path
from datetime import datetime

ROOT      = Path(__file__).parent
WEBSITE   = ROOT / "website"
DATA_DIR  = WEBSITE / "data"
RESULTS   = DATA_DIR / "results.json"
TEMPLATE  = ROOT / "website" / "index.html"

def patch_build_date(html_path):
    content = html_path.read_text()
    tag = f"<!-- built: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC -->"
    content = re.sub(r"<!-- built:.*?-->\n?", "", content)
    content = content.replace("</head>", f"{tag}\n</head>", 1)
    html_path.write_text(content)

def main():

    WEBSITE.mkdir(exist_ok=True)
    DATA_DIR.mkdir(exist_ok=True)

    if not TEMPLATE.exists():
        sys.exit(1)

    patch_build_date(TEMPLATE)
    subprocess.run([sys.executable, str(ROOT / "compare_versions.py")], check=False)

if __name__ == "__main__":
    main()

