#!/usr/bin/env python3
"""Compatibility adapter for the authoritative Node workflow exporter."""
from __future__ import annotations

import sys

from matrix_state import run_runtime


if __name__ == "__main__":
    raise SystemExit(run_runtime(sys.argv[1:]))
