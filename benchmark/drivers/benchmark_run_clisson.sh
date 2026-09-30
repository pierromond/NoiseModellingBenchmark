#!/usr/bin/env bash
# Thin wrapper around scripts/bench.sh (dataset: clisson).
# CLI unchanged: [--version <v> | --aggregate-only]
exec bash "$(dirname "$0")/../scripts/bench.sh" --dataset clisson "$@"
