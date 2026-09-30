#!/usr/bin/env python3
"""Build the Clisson pairwise comparisons (website/data/comparisons.json).

The logic lives in bench/compare.py (shared with the La Montagne dataset).
"""
from bench.compare import run_clisson

if __name__ == "__main__":
    run_clisson()
