#!/usr/bin/env python3
"""GitHub API helpers used by the CI workflow (read JSON on stdin).

Subcommands:
  workflow-id <path>       print the workflow id whose `.path` matches <path>
  latest-artifact <repo>   print run id / head sha / artifact id / name / url
                           for the first non-expired NoiseModelling-* artifact
                           of the runs passed on stdin. Needs $GH_TOKEN.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request


def cmd_workflow_id(path: str) -> None:
    for workflow in json.load(sys.stdin).get("workflows", []):
        if workflow.get("path") == path:
            print(workflow["id"])
            return


def cmd_latest_artifact(repo: str) -> None:
    token = os.environ.get("GH_TOKEN", "")
    try:
        runs = json.load(sys.stdin).get("workflow_runs", [])
    except Exception:
        runs = []

    for run in runs:
        url = "https://api.github.com/repos/%s/actions/runs/%s/artifacts" % (repo, run["id"])
        request = urllib.request.Request(
            url,
            headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"},
        )
        try:
            artifacts = json.load(urllib.request.urlopen(request)).get("artifacts", [])
        except Exception:
            continue
        for artifact in artifacts:
            if artifact.get("name", "").startswith("NoiseModelling-") and not artifact.get("expired", False):
                print(run["id"])
                print(run["head_sha"])
                print(artifact["id"])
                print(artifact["name"])
                print(artifact["archive_download_url"])
                return


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    cmd, arg = sys.argv[1], sys.argv[2]
    if cmd == "workflow-id":
        cmd_workflow_id(arg)
    elif cmd == "latest-artifact":
        cmd_latest_artifact(arg)
    else:
        print(f"unknown command: {cmd}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
