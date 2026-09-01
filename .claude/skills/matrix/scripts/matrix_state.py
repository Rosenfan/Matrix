#!/usr/bin/env python3
"""Compatibility adapter for the authoritative Node Workflow Runtime."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def development_runtime() -> Path | None:
    """Return an explicitly selected source runtime for repository tests only."""
    configured = os.environ.get("MATRIX_DEVELOPMENT_RUNTIME")
    return Path(configured).resolve() if configured else None


def primary_runtime() -> str | None:
    if os.name == "nt":
        return shutil.which("matrix.cmd") or shutil.which("matrix.exe")
    return shutil.which("matrix")


def runtime_command(args: list[str]) -> list[str]:
    development = development_runtime()
    if development is not None:
        if not development.is_file():
            raise RuntimeError(f"Configured Matrix development runtime was not found: {development}")
        node = shutil.which("node")
        if node is None:
            raise RuntimeError("Node.js is required to run the Matrix workflow.")
        return [node, str(development), *args]

    bundled = Path(__file__).with_name("matrix-runtime.mjs")
    node = shutil.which("node")
    if node is not None and bundled.exists():
        return [node, str(bundled), *args]

    primary = primary_runtime()
    if primary is not None:
        return [primary, "workflow", *args, "--json"]

    raise RuntimeError("Matrix CLI is absent and the bundled workflow runtime was not found.")


def run_runtime(args: list[str]) -> int:
    try:
        completed = subprocess.run(runtime_command(args), cwd=Path.cwd(), check=False)
    except (OSError, RuntimeError) as error:
        print(f"MATRIX ERROR [RUNTIME_UNAVAILABLE]: {error}", file=sys.stderr)
        return 2
    return completed.returncode


def main() -> int:
    return run_runtime(sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
