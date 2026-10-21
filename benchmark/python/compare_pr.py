#!/usr/bin/env python3
"""Compare a pull-request benchmark run to the published NoiseModelling versions.

The PR result is written in an isolated namespace:
  website/data/pr/<pr>/...

It never modifies website/data/results.json or website/data/comparisons.json.

Baseline data is read, in this order:
  1. local benchmark/output (when the version was run locally);
  2. benchmark/baseline-pack (downloaded by the PR workflow);
  3. the published website (best effort).

Usage:
  python3 benchmark/python/compare_pr.py --pr 1092 --label v6.0.2-SNAPSHOT-pr1092-680a381
  python3 benchmark/python/compare_pr.py --pr 1092 --label ... --dataset montagne --baseline same-series
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "benchmark" / "python"))

from bench.compare import (  # noqa: E402
    build_measure_results,
    compare_pair,
)
from bench.config import load_config  # noqa: E402
from bench.stats import load_receivers  # noqa: E402

DEFAULT_PAGES = "https://pierromond.github.io/NoiseModellingBenchmark"
USER_AGENT = "nm-benchmark-pr/1.0"


def _read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _versions(path: Path) -> list[str]:
    data = _read_json(path, {})
    return sorted(key for key, value in data.items() if key != "" and (value or key))


def _selected_versions(mode: str, label: str, versions: list[str]) -> list[str]:
    if mode == "none":
        return []
    if mode == "existing":
        return [version for version in versions if version != label]
    match = re.match(r"v?(\d+)", label)
    major = match.group(1) if match else ""
    return [version for version in versions if version != label and re.match(r"v?(\d+)", version)
            and re.match(r"v?(\d+)", version).group(1) == major]


def _fetch(url: str, destination: Path) -> bool:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return False
    if not payload:
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    return True


def _is_json(path: Path) -> bool:
    try:
        json.loads(path.read_text(encoding="utf-8"))
        return True
    except (OSError, json.JSONDecodeError):
        return False


def _data_root(dataset: str) -> Path:
    return ROOT / ("benchmark/output" if dataset == "clisson" else "benchmark/output/montagne")


def _pack_root(dataset: str) -> Path:
    return ROOT / "benchmark" / "baseline-pack" / dataset


def _cache_root(dataset: str) -> Path:
    return ROOT / "benchmark" / ".cache" / "pr-baseline" / dataset


def _has_dataset(path: Path, dataset: str) -> bool:
    if dataset == "clisson":
        return (path / "RECEIVERS_LEVEL.geojson").exists()
    return any((path / name).exists() for name in
               ("RECEIVERS_LEVEL.geojson", "RECEIVERS_LEVEL_c1.geojson", "RECEIVERS_LEVEL_c2.geojson"))


def _download_pages(dataset: str, version: str, pages_url: str) -> Path | None:
    base = pages_url.rstrip("/")
    if dataset == "clisson":
        paths = [("data/%s/RECEIVERS_LEVEL.geojson" % version, "RECEIVERS_LEVEL.geojson")]
    else:
        paths = [
            ("data/montagne/%s/RECEIVERS_LEVEL.geojson" % version, "RECEIVERS_LEVEL.geojson"),
            ("data/montagne/%s/RECEIVERS_LEVEL_c1.geojson" % version, "RECEIVERS_LEVEL_c1.geojson"),
            ("data/montagne/%s/RECEIVERS_LEVEL_c2.geojson" % version, "RECEIVERS_LEVEL_c2.geojson"),
        ]
    target = _cache_root(dataset) / version
    got = False
    for remote, name in paths:
        destination = target / name
        if destination.exists() or _fetch(f"{base}/{remote}", destination):
            got = True
    if dataset == "montagne":
        alias = target / "RECEIVERS_LEVEL.geojson"
        first_campaign = target / "RECEIVERS_LEVEL_c1.geojson"
        if not alias.exists() and first_campaign.exists():
            shutil.copyfile(first_campaign, alias)
    return target if got else None


def _find_baseline_root(dataset: str, version: str, source: str, pages_url: str) -> Path | None:
    local = _data_root(dataset) / version
    pack = _pack_root(dataset) / version
    cache = _cache_root(dataset) / version

    if source in ("auto", "local"):
        if _has_dataset(local, dataset):
            return _data_root(dataset)
        if _has_dataset(pack, dataset):
            return _pack_root(dataset)
    if source in ("auto", "pages"):
        if _has_dataset(cache, dataset):
            return _cache_root(dataset)
        downloaded = _download_pages(dataset, version, pages_url)
        if downloaded is not None:
            return _cache_root(dataset)
    return None


def _load_stats(root: Path, label: str) -> dict | None:
    path = root / label / f"stats_{label}.json"
    if not path.exists():
        return None
    data = _read_json(path, None)
    if isinstance(data, dict):
        data["version"] = label
        return data
    return None


def _load_paired(paired_dir: Path | None, version: str | None, dataset: str) -> dict | None:
    """Fresh baseline timing produced on the same runner as the PR."""
    if paired_dir is None or not version:
        return None
    path = paired_dir / dataset / f"stats_{version}.json"
    if not path.exists():
        return None
    data = _read_json(path, None)
    if isinstance(data, dict):
        data["version"] = version
        data["paired"] = True
        return data
    return None


def _measure_paths(dataset: str, pages_url: str) -> tuple[Path, Path] | None:
    if dataset != "montagne":
        return None
    candidates = [
        _pack_root("montagne") / "measure" / "RECEIVERS_LEVEL.geojson",
        ROOT / "benchmark" / "input" / "montagne" / "measure" / "RECEIVERS_LEVEL.geojson",
        ROOT / "website" / "data" / "montagne" / "measure" / "RECEIVERS_LEVEL.geojson",
    ]
    for candidate in candidates:
        if candidate.exists() and _is_json(candidate):
            return candidate, candidate
    destination = _cache_root("montagne") / "measure" / "RECEIVERS_LEVEL.geojson"
    if destination.exists() and _is_json(destination):
        return destination, destination
    if _fetch(f"{pages_url.rstrip('/')}/data/montagne/measure/RECEIVERS_LEVEL.geojson", destination):
        return destination, destination
    return None


def _sources_path(pages_url: str) -> Path | None:
    """LW_ROADS, preferably from the pack because the CI checkout has LFS pointers."""
    candidates = [
        _pack_root("montagne") / "LW_ROADS.geojson",
        ROOT / "benchmark" / "input" / "montagne" / "LW_ROADS.geojson",
    ]
    for candidate in candidates:
        if candidate.exists() and _is_json(candidate):
            return candidate
    destination = _cache_root("montagne") / "LW_ROADS.geojson"
    if destination.exists() and _is_json(destination):
        return destination
    if _fetch(f"{pages_url.rstrip('/')}/data/montagne/layers/LW_ROADS.geojson", destination):
        return destination
    return None


def _campaign_labels() -> dict:
    try:
        config = load_config()
        campaigns = (config.get("models", {}).get("montagne", {}).get("campaigns", {}) or {})
        return {cid: conf.get("label", cid) for cid, conf in campaigns.items()}
    except Exception:
        return {}


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def _write_index(out_root: Path, entry: dict) -> None:
    index_path = out_root / "index.json"
    index = _read_json(index_path, [])
    if not isinstance(index, list):
        index = []
    index = [item for item in index if str(item.get("pr")) != str(entry.get("pr"))]
    index.append(entry)
    index.sort(key=lambda item: int(item.get("pr", 0)), reverse=True)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")


def _summary_rows(comparisons: list[dict]) -> list[dict]:
    rows = []
    for item in comparisons:
        rows.append({
            "baseline": item.get("version_a"),
            "rmse": item.get("rmse"),
            "mean_delta": item.get("mean_delta"),
            "max_delta": item.get("max_delta"),
            "n_valid": item.get("n_valid"),
            "n_nan_a": item.get("n_nan_a"),
            "n_nan_b": item.get("n_nan_b"),
        })
    return rows


def _report(manifest: dict, label: str, clisson: list[dict], montagne: list[dict],
            measure: list[dict]) -> str:
    lines = [
        f"# Benchmark PR #{manifest.get('pr')} — {manifest.get('title', '')}".strip(),
        "",
        f"**Version:** `{label}`  ",
        f"**PR:** {manifest.get('url', '')}  ",
        f"**Head SHA:** `{manifest.get('headSha', '')}`  ",
        f"**Base SHA:** `{manifest.get('baseSha', '')}`  ",
        f"**CI run:** {manifest.get('runUrl', '—')}  ",
        f"**Artifact:** `{manifest.get('artifactName', '—')}`",
    ]
    paired = manifest.get("pairedBaseline") or {}
    if paired.get("version"):
        host = paired.get("host") or {}
        details = [value for value in (host.get("cpu"), f"{host.get('cores')} cores" if host.get("cores") else "",
                                       host.get("java")) if value]
        lines.append(f"**Paired baseline:** `{paired['version']}` rerun on the same runner"
                     + (f" ({', '.join(details)})" if details else "") + ".")
    lines += [
        "",
        "> PR result — not an official benchmark release. "
        "The CI artifact is built from the PR merge ref and may include base-branch changes.",
        "",
    ]

    if clisson:
        lines += ["## Clisson", "", "| Baseline | RMSE (dB) | Mean |Δ| (dB) | Max |Δ| (dB) | Compared |", "|---|---:|---:|---:|---:|"]
        for row in _summary_rows(clisson):
            lines.append(
                f"| {row['baseline']} | {row['rmse']} | {row['mean_delta']} | "
                f"{row['max_delta']} | {row['n_valid']} |"
            )
        lines.append("")

    if montagne:
        lines += ["## La Montagne — PR vs versions", "",
                  "| Baseline | RMSE (dB) | Mean |Δ| (dB) | Max |Δ| (dB) | Compared |",
                  "|---|---:|---:|---:|---:|"]
        for row in _summary_rows(montagne):
            lines.append(
                f"| {row['baseline']} | {row['rmse']} | {row['mean_delta']} | "
                f"{row['max_delta']} | {row['n_valid']} |"
            )
        lines.append("")

    if measure:
        lines += ["## La Montagne — PR vs measurements", "",
                  "| Version | Mean error | Std | RMSE | Max |error| | Compared |",
                  "|---|---:|---:|---:|---:|---:|"]
        for item in measure:
            lines.append(
                f"| {item.get('version')} | {item.get('mean_error')} | {item.get('std_error')} | "
                f"{item.get('rmse')} | {item.get('max_abs_error')} | "
                f"{item.get('n_compared')}/{item.get('n_measured')} |"
            )
        lines.append("")

    if not clisson and not montagne and not measure:
        lines += ["No comparison data was produced.", ""]

    lines += [
        "---",
        "Generated by `benchmark/scripts/bench_pr.sh`. "
        "PR data stays in `website/data/pr/<pr>/` and is excluded from the official results.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--label", required=True, help="unique benchmark version label")
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--dataset", choices=("both", "clisson", "montagne"), default="both")
    parser.add_argument("--baseline", choices=("existing", "same-series", "none"), default="existing")
    parser.add_argument("--baseline-source", choices=("auto", "local", "pages"), default="auto")
    parser.add_argument("--pages-url", default=DEFAULT_PAGES)
    parser.add_argument("--paired-dir", type=Path, default=None,
                        help="fresh baseline stats produced on the same runner as the PR")
    parser.add_argument("--paired-version", default=None,
                        help="version label of the paired baseline")
    parser.add_argument("--versions", type=Path, default=ROOT / "benchmark" / "versions.json")
    parser.add_argument("--out", type=Path, default=ROOT / "website" / "data" / "pr")
    parser.add_argument("--report-dir", type=Path, default=None)
    args = parser.parse_args()

    manifest_path = args.manifest or ROOT / "benchmark" / "output" / "pr" / str(args.pr) / "manifest.json"
    manifest = _read_json(manifest_path, {})
    if not manifest:
        manifest = {"pr": args.pr, "label": args.label, "generatedAt": datetime.now(timezone.utc).isoformat()}

    versions = _selected_versions(args.baseline, args.label, _versions(args.versions))
    out_pr = args.out / str(args.pr)
    clisson_comparisons: list[dict] = []
    montagne_comparisons: list[dict] = []
    measure: list[dict] = []
    baselines: dict[str, list[str]] = {"clisson": [], "montagne": []}
    paired_host = _read_json(args.paired_dir / "host.json", {}) if args.paired_dir else {}
    paired_datasets: list[str] = []

    if args.dataset in ("both", "clisson"):
        pr_root = _data_root("clisson")
        pr_data = load_receivers(pr_root, args.label)
        stats = _load_stats(pr_root, args.label)
        if pr_data and stats:
            _write_json(out_pr / "clisson" / "results.json", [stats])
            paired_row = _load_paired(args.paired_dir, args.paired_version, "clisson")
            if paired_row:
                _write_json(out_pr / "clisson" / "baseline_results.json", [paired_row])
                paired_datasets.append("clisson")
            for version in versions:
                root = _find_baseline_root("clisson", version, args.baseline_source, args.pages_url)
                if root is None:
                    print(f"[compare_pr] no Clisson baseline for {version} — skipped", file=sys.stderr)
                    continue
                baseline = load_receivers(root, version)
                if not baseline:
                    print(f"[compare_pr] empty Clisson baseline for {version} — skipped", file=sys.stderr)
                    continue
                result = compare_pair(version, baseline, args.label, pr_data, sample=True)
                if result:
                    clisson_comparisons.append(result)
                    baselines["clisson"].append(version)
            _write_json(out_pr / "clisson" / "comparisons.json", clisson_comparisons)
        else:
            print("[compare_pr] no Clisson PR output — skipped", file=sys.stderr)

    if args.dataset in ("both", "montagne"):
        pr_root = _data_root("montagne")
        pr_data = load_receivers(pr_root, args.label)
        stats = _load_stats(pr_root, args.label)
        if pr_data and stats:
            _write_json(out_pr / "montagne" / "results.json", [stats])
            paired_row = _load_paired(args.paired_dir, args.paired_version, "montagne")
            if paired_row:
                _write_json(out_pr / "montagne" / "baseline_results.json", [paired_row])
                paired_datasets.append("montagne")
            for version in versions:
                root = _find_baseline_root("montagne", version, args.baseline_source, args.pages_url)
                if root is None:
                    print(f"[compare_pr] no La Montagne baseline for {version} — skipped", file=sys.stderr)
                    continue
                baseline = load_receivers(root, version)
                if not baseline:
                    continue
                result = compare_pair(version, baseline, args.label, pr_data, sample=False)
                if result:
                    montagne_comparisons.append(result)
                    baselines["montagne"].append(version)
            _write_json(out_pr / "montagne" / "comparisons.json", montagne_comparisons)

            paths = _measure_paths("montagne", args.pages_url)
            sources = _sources_path(args.pages_url)
            if paths and sources:
                measure, _ = build_measure_results(
                    pr_root, [args.label], paths[0], paths[1], sources, _campaign_labels()
                )
                _write_json(out_pr / "montagne" / "measure_comparison.json", measure)
        else:
            print("[compare_pr] no La Montagne PR output — skipped", file=sys.stderr)

    manifest = dict(manifest)
    manifest.update({
        "pr": args.pr,
        "label": args.label,
        "datasets": [name for name in ("clisson", "montagne")
                     if (out_pr / name / "results.json").exists()],
        "baselines": baselines,
        "pairedBaseline": {
            "version": args.paired_version or "",
            "datasets": paired_datasets,
            "host": paired_host,
        },
        "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    })
    _write_json(out_pr / "manifest.json", manifest)
    _write_index(args.out, {
        "pr": args.pr,
        "title": manifest.get("title", ""),
        "url": manifest.get("url", ""),
        "label": args.label,
        "version": manifest.get("version", ""),
        "headSha": manifest.get("headSha", ""),
        "baseSha": manifest.get("baseSha", ""),
        "runId": manifest.get("runId"),
        "runUrl": manifest.get("runUrl", ""),
        "publishedAt": manifest["publishedAt"],
        "datasets": manifest["datasets"],
        "baselines": baselines,
    })

    report_dir = args.report_dir or (ROOT / "benchmark" / "output" / "pr" / str(args.pr))
    report_dir.mkdir(parents=True, exist_ok=True)
    report = _report(manifest, args.label, clisson_comparisons, montagne_comparisons, measure)
    (report_dir / "report.md").write_text(report, encoding="utf-8")
    _write_json(report_dir / "report.json", {
        "pr": args.pr,
        "label": args.label,
        "clisson": _summary_rows(clisson_comparisons),
        "montagne": _summary_rows(montagne_comparisons),
        "measure": [
            {
                "version": item.get("version"),
                "mean_error": item.get("mean_error"),
                "std_error": item.get("std_error"),
                "rmse": item.get("rmse"),
                "max_abs_error": item.get("max_abs_error"),
                "n_compared": item.get("n_compared"),
                "n_measured": item.get("n_measured"),
            }
            for item in measure
        ],
    })

    print(f"PR data: {out_pr}")
    print(f"Report:  {report_dir / 'report.md'}")
    print(f"Clisson pairs: {len(clisson_comparisons)}")
    print(f"Montagne pairs: {len(montagne_comparisons)}")
    print(f"Montagne measure rows: {len(measure)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
