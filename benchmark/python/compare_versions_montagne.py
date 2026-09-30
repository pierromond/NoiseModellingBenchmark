#!/usr/bin/env python3
"""Build the La Montagne pairwise comparisons and the comparison to measurements.

The logic lives in bench/compare.py (shared with the Clisson dataset).
"""
from bench.compare import run_montagne

if __name__ == "__main__":
    run_montagne()
