#!/usr/bin/env python3
"""Rendering guard for the website front-end.

Renders the generated site with headless Chrome for each dataset route and
compares a normalized signature (body text, version buttons, layer buttons,
select options, canvases) against tools/baseline/render.json.

This is what makes splitting/refactoring the front-end JS (website/js/*) safe:
any change in the rendered page is detected.

Usage:
  python3 tools/render_check.py            # compare against the baseline
  python3 tools/render_check.py --update   # write the current signature as baseline

If Chrome is unavailable the script skips (exit 0).
"""

from __future__ import annotations

import argparse
import functools
import html
import http.server
import json
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEBSITE = ROOT / "website"
BASELINE = Path(__file__).resolve().parent / "baseline" / "render.json"

CHROME_CANDIDATES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
ROUTES = ["clisson", "montagne", "start"]

_TAG_RE = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
_ANY_TAG_RE = re.compile(r"<[^>]+>")
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}[ T]?\d{0,2}:?\d{0,2}(?::\d{2})?\s*(?:UTC)?")
_SHA_RE = re.compile(r"\b[0-9a-f]{7,40}\b")
_RUN_RE = re.compile(r"runs/\d+")


def find_chrome() -> str | None:
    for name in CHROME_CANDIDATES:
        path = shutil.which(name)
        if path:
            return path
    return None


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # silence request logging
        pass


def start_server() -> tuple[http.server.ThreadingHTTPServer, int]:
    handler = functools.partial(_QuietHandler, directory=str(WEBSITE))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def render(chrome: str, url: str) -> str:
    proc = subprocess.run(
        [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
         "--user-data-dir=" + tempfile.mkdtemp(prefix="render-chrome-"),
         "--dump-dom", "--virtual-time-budget=20000", url],
        capture_output=True, text=True,
    )
    return proc.stdout


def normalize_text(dom: str) -> str:
    body = dom
    body = _TAG_RE.sub(" ", body)
    body = _ANY_TAG_RE.sub(" ", body)
    body = html.unescape(body)
    body = _RUN_RE.sub("runs/<id>", body)
    body = _DATE_RE.sub("<date>", body)
    body = _SHA_RE.sub("<sha>", body)
    return re.sub(r"\s+", " ", body).strip()


def signature(dom: str) -> dict:
    return {
        "text": normalize_text(dom),
        "versions": sorted(set(re.findall(r'data-version="([^"]+)"', dom))),
        "layers": sorted(set(re.findall(r'data-layer="([^"]+)"', dom))),
        "options": sorted(set(re.findall(r'<option value="([^"]*)"', dom))),
        "canvases": sorted(set(re.findall(r'<canvas[^>]*id="([^"]+)"', dom))),
    }


def build() -> dict:
    chrome = find_chrome()
    if chrome is None:
        raise RuntimeError("no chrome")

    subprocess.run([sys.executable, "website/build.py"], cwd=ROOT, check=False,
                   capture_output=True)
    httpd, port = start_server()
    try:
        result: dict = {}
        for route in ROUTES:
            url = f"http://127.0.0.1:{port}/index.html#dataset={route}"
            result[route] = signature(render(chrome, url))
        return result
    finally:
        httpd.shutdown()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true", help="write the baseline")
    args = parser.parse_args()

    if find_chrome() is None:
        print("[render_check] Chrome not found — skipping", file=sys.stderr)
        return 0

    current = build()

    if args.update:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"[render_check] baseline written ({len(current)} routes)")
        return 0

    if not BASELINE.exists():
        print("[render_check] no baseline; run --update first", file=sys.stderr)
        return 1

    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    diffs = []
    for route in ROUTES:
        b, c = baseline.get(route, {}), current.get(route, {})
        for key in ("versions", "layers", "options", "canvases"):
            if b.get(key) != c.get(key):
                diffs.append(f"{route}.{key}: {b.get(key)} -> {c.get(key)}")
        if b.get("text") != c.get("text"):
            diffs.append(f"{route}.text: differs ({len(b.get('text',''))} vs {len(c.get('text',''))} chars)")

    if diffs:
        print("[render_check] DIFFERENCES DETECTED")
        for d in diffs:
            print("  " + d)
        return 1
    print(f"[render_check] OK — {len(ROUTES)} routes identical to baseline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
