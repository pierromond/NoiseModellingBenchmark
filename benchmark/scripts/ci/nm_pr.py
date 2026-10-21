#!/usr/bin/env python3
"""Resolve a NoiseModelling pull request to a downloadable CI binary.

The benchmark itself never adds PRs to `benchmark/versions.json`: a PR is an
ephemeral, non-official result. This helper only resolves the metadata needed to
run the existing benchmark scripts with a unique label.

Subcommands:
  resolve <pr>          print/write the PR manifest
  download-latest ...   download the latest matching artifact of a workflow

Examples:
  GH_TOKEN=... python3 benchmark/scripts/ci/nm_pr.py resolve 1092 \
      --output benchmark/output/pr/manifest.json

  python3 benchmark/scripts/ci/nm_pr.py resolve 1092 \
      --artifact-zip /tmp/NoiseModelling-1092_merge.zip
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API = "https://api.github.com"
DEFAULT_REPO = "Universite-Gustave-Eiffel/NoiseModelling"
DEFAULT_WORKFLOW = ".github/workflows/CI.yml"
USER_AGENT = "nm-benchmark-pr/1.0"


def _token() -> str:
    return os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""


def _request(url: str, raw: bool = False) -> bytes:
    headers = {
        "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
        "User-Agent": USER_AGENT,
    }
    token = _token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise SystemExit(f"GitHub API error {exc.code} for {url}\n{detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Cannot reach GitHub API: {exc}") from exc


def _json(url: str) -> Any:
    return json.loads(_request(url).decode("utf-8"))


def _pom_version(repo: str, sha: str) -> str:
    """Read the version from pom.xml at the PR head (best effort)."""
    try:
        content = _request(f"{API}/repos/{repo}/contents/pom.xml?ref={sha}", raw=True).decode(
            "utf-8", errors="replace"
        )
    except SystemExit:
        return "unknown"
    match = re.search(r"<version>\s*([^<]+?)\s*</version>", content)
    return match.group(1).strip() if match else "unknown"


def _is_pr_run(run: dict, pr_number: int) -> bool:
    pull_requests = run.get("pull_requests") or []
    if not pull_requests:
        return True
    return any(str(item.get("number")) == str(pr_number) for item in pull_requests)


def _find_run(repo: str, pr_number: int, head_sha: str, workflow: str) -> dict | None:
    queries = [
        f"{API}/repos/{repo}/actions/runs?head_sha={head_sha}&per_page=100",
        f"{API}/repos/{repo}/actions/runs?event=pull_request&per_page=100",
    ]
    seen: set[int] = set()
    candidates: list[dict] = []
    for url in queries:
        for run in _json(url).get("workflow_runs", []):
            run_id = run.get("id")
            if run_id in seen:
                continue
            seen.add(run_id)
            if run.get("path") != workflow:
                continue
            if run.get("status") != "completed" or run.get("conclusion") != "success":
                continue
            if run.get("head_sha") != head_sha:
                continue
            if not _is_pr_run(run, pr_number):
                continue
            candidates.append(run)

    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item.get("created_at", ""), reverse=True)[0]


def _find_artifact(repo: str, run_id: int, pr_number: int) -> dict | None:
    artifacts = _json(f"{API}/repos/{repo}/actions/runs/{run_id}/artifacts").get("artifacts", [])
    available = [
        item for item in artifacts
        if not item.get("expired", False) and item.get("name", "").startswith("NoiseModelling-")
    ]
    if not available:
        return None

    preferred = [
        item for item in available
        if f"_{pr_number}_merge" in item.get("name", "")
        or f"-{pr_number}_merge" in item.get("name", "")
        or f"-{pr_number}" in item.get("name", "")
    ]
    return (preferred or available)[0]


def resolve(pr_number: int, repo: str, workflow: str, artifact_zip: Path | None) -> dict:
    pull = _json(f"{API}/repos/{repo}/pulls/{pr_number}")
    head = pull.get("head") or {}
    base = pull.get("base") or {}
    head_sha = head.get("sha") or ""
    head_repo = ((head.get("repo") or {}).get("full_name")) or repo
    base_sha = base.get("sha") or ""
    base_ref = base.get("ref") or ""

    if not head_sha:
        raise SystemExit(f"PR #{pr_number}: no head SHA in GitHub response")

    version = _pom_version(head_repo, head_sha)
    label = f"v{version.lstrip('v')}-pr{pr_number}-{head_sha[:7]}"
    java = "25" if version.startswith("6") else "11"

    manifest: dict[str, Any] = {
        "pr": pr_number,
        "title": pull.get("title") or "",
        "url": pull.get("html_url") or f"https://github.com/{repo}/pull/{pr_number}",
        "state": pull.get("state") or "",
        "headRepo": head_repo,
        "headRef": head.get("ref") or "",
        "headSha": head_sha,
        "baseSha": base_sha,
        "baseRef": base_ref,
        "version": version,
        "label": label,
        "java": java,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "artifactName": "",
        "artifactUrl": "",
        "runId": None,
        "runUrl": "",
    }

    if artifact_zip is not None:
        manifest["artifactZip"] = str(artifact_zip.resolve())
        return manifest

    run = _find_run(repo, pr_number, head_sha, workflow)
    if run is None:
        raise SystemExit(
            f"PR #{pr_number}: no successful {workflow} run found for head {head_sha}. "
            "Wait for CI, or pass --artifact-zip with a downloaded artifact."
        )

    artifact = _find_artifact(repo, int(run["id"]), pr_number)
    if artifact is None:
        raise SystemExit(
            f"PR #{pr_number}: CI run {run['id']} has no non-expired NoiseModelling-* artifact. "
            "Wait for CI, or pass --artifact-zip."
        )

    manifest.update({
        "artifactName": artifact.get("name") or "",
        "artifactUrl": artifact.get("archive_download_url") or "",
        "artifactExpired": bool(artifact.get("expired")),
        "runId": run.get("id"),
        "runUrl": run.get("html_url") or "",
        "runSha": run.get("head_sha") or "",
    })
    return manifest


class _StripAuthOnRedirect(urllib.request.HTTPRedirectHandler):
    """Do not forward the GitHub token to the Azure blob storage redirect."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_request = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_request is not None:
            old_host = urllib.parse.urlparse(req.full_url).netloc
            new_host = urllib.parse.urlparse(newurl).netloc
            if old_host != new_host:
                new_request.remove_header("Authorization")
        return new_request


def _download_artifact(url: str, destination: Path) -> None:
    token = _token()
    if not token:
        raise SystemExit("GH_TOKEN/GITHUB_TOKEN is required to download GitHub Actions artifacts.")
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        },
    )
    opener = urllib.request.build_opener(_StripAuthOnRedirect())
    with opener.open(request, timeout=300) as response:
        payload = response.read()
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as handle:
        handle.write(payload)
        archive = Path(handle.name)
    try:
        destination.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(destination)
    finally:
        archive.unlink(missing_ok=True)


def download_latest(repo: str, workflow: str, artifact_name: str, destination: Path) -> None:
    runs = _json(
        f"{API}/repos/{repo}/actions/workflows/{workflow}/runs"
        "?status=success&branch=main&per_page=30"
    ).get("workflow_runs", [])
    for run in runs:
        artifacts = _json(f"{API}/repos/{repo}/actions/runs/{run['id']}/artifacts").get("artifacts", [])
        for artifact in artifacts:
            if artifact.get("name") != artifact_name or artifact.get("expired", False):
                continue
            _download_artifact(artifact["archive_download_url"], destination)
            print(f"Downloaded {artifact_name} from run {run['id']} to {destination}")
            return
    raise SystemExit(f"No non-expired artifact named {artifact_name!r} found in recent {workflow} runs.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    resolve_parser = sub.add_parser("resolve", help="resolve a pull request to a CI artifact")
    resolve_parser.add_argument("pr", type=int, help="NoiseModelling pull request number")
    resolve_parser.add_argument("--repo", default=DEFAULT_REPO, help="NoiseModelling repository")
    resolve_parser.add_argument("--workflow", default=DEFAULT_WORKFLOW, help="CI workflow path")
    resolve_parser.add_argument("--artifact-zip", type=Path, help="use an already downloaded artifact")
    resolve_parser.add_argument("--output", type=Path, help="write the manifest here instead of stdout")

    download_parser = sub.add_parser("download-latest", help="download the latest artifact of a workflow")
    download_parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""),
                                 help="repository owning the workflow (default: $GITHUB_REPOSITORY)")
    download_parser.add_argument("--workflow", required=True, help="workflow file name or id")
    download_parser.add_argument("--artifact", required=True, help="artifact name")
    download_parser.add_argument("--dest", type=Path, required=True, help="extraction directory")

    args = parser.parse_args()

    if args.command == "resolve":
        manifest = resolve(args.pr, args.repo, args.workflow, args.artifact_zip)
        payload = json.dumps(manifest, indent=2, sort_keys=False) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(payload, encoding="utf-8")
            print(f"Wrote {args.output}")
        else:
            print(payload, end="")
        return 0

    if not args.repo:
        raise SystemExit("--repo is required (or set GITHUB_REPOSITORY)")
    download_latest(args.repo, args.workflow, args.artifact, args.dest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
