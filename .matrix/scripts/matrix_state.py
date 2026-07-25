#!/usr/bin/env python3
"""Deterministic state and guard kernel shared by every Matrix Skill.

Matrix is project-owned, not agent-owned.  All core state and scripts live
under a single ``.matrix/`` directory at the project root, shared by every
AI coding agent (Claude Code, Codex, …).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

PHASES = ("open", "design", "build", "verify", "archive")
NEXT = {"open": "design", "design": "build", "build": "verify", "verify": "archive"}
SKILLS = {phase: f"$matrix-{phase}" for phase in PHASES}

# Legacy locations (relative to project root) that may hold old Matrix state.
_LEGACY_MATRIX_DIRS = (".codex/matrix", ".claude/matrix")


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Project root — find the single source of truth
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def find_project_root() -> Path | None:
    """Locate the project root directory.

    1. Walk up from *cwd* looking for an existing ``.matrix/`` directory.
    2. Fall back to the git repository root.
    3. Return *None* if neither exists.
    """
    # 1. Walk up: look for .matrix/
    probe = Path.cwd().resolve()
    for parent in [probe] + list(probe.parents):
        if (parent / ".matrix").is_dir():
            return parent

    # 2. Git root
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0:
            candidate = Path(out.stdout.strip())
            if candidate.is_dir():
                return candidate
    except Exception:
        pass

    return None


def resolve_for_init() -> Path:
    """Resolve project root for ``init`` (may create ``.matrix/`` here)."""
    pr = find_project_root()
    return pr if pr is not None else Path.cwd().resolve()


def resolve_for_read() -> Path:
    """Resolve project root for read operations.

    Falls back to *cwd* so that legacy state detection or migration
    can still work in non-git directories.
    """
    pr = find_project_root()
    return pr if pr is not None else Path.cwd().resolve()


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def mat_root(project_root: Path) -> Path:
    """Return the Matrix root: ``.matrix/`` under *project_root*."""
    return project_root / ".matrix"


def state_dir(project_root: Path) -> Path:
    """Return the state directory: ``.matrix/state/``."""
    return mat_root(project_root) / "state"


def active_path(project_root: Path) -> Path:
    return state_dir(project_root) / "active.json"


def change_dir(change_id: str, project_root: Path) -> Path:
    return state_dir(project_root) / "changes" / change_id


def flow_path(change_id: str, project_root: Path) -> Path:
    return change_dir(change_id, project_root) / "matrix.yaml"


def artifact(change_id: str, name: str, project_root: Path) -> Path:
    return change_dir(change_id, project_root) / "artifacts" / name


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def fail(message):
    print(f"MATRIX ERROR: {message}", file=sys.stderr)
    raise SystemExit(2)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def parse_flow(flow_p: Path):
    values = {}
    for line in flow_p.read_text(encoding="utf-8").splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def write_flow(flow_p: Path, values: dict):
    order = (
        "schema", "id", "workflow", "status", "phase", "title",
        "created_at", "updated_at", "acceptance", "scope",
    )
    flow_p.write_text(
        "\n".join(f"{key}: {values.get(key, '')}" for key in order) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Migration from legacy locations
# ---------------------------------------------------------------------------

def _collect_legacy(project_root: Path) -> list[Path]:
    """Return legacy dirs that contain an ``active.json``."""
    result = []
    for leaf in _LEGACY_MATRIX_DIRS:
        candidate = (project_root / leaf).resolve()
        if (candidate / "active.json").is_file():
            result.append(candidate)
    return result


def _oldest_active(legacy_dirs: list[Path]) -> str | None:
    """Read the change id from the first legacy dir that has one."""
    for d in legacy_dirs:
        try:
            return load_json(d / "active.json").get("change_id")
        except Exception:
            pass
    return None


def _migrate_legacy_state(project_root: Path) -> bool:
    """Migrate state from legacy directories into ``.matrix/``.

    Returns *True* if migration was performed.
    The original legacy directory is backed up (not deleted).
    """
    legacies = _collect_legacy(project_root)
    if not legacies:
        return False

    dst = state_dir(project_root)

    # --- conflict detection ---
    if len(legacies) > 1:
        items = []
        for d in legacies:
            cid = _oldest_active([d]) or "?"
            rel = d.relative_to(project_root).as_posix()
            items.append(f"  {rel} → change '{cid}'")
        fail(
            "Multiple legacy Matrix states found:\n"
            + "\n".join(items)
            + "\n\nCannot auto-migrate.  Resolve manually:\n"
            "  1. Decide which change to keep.\n"
            "  2. Copy its contents into .matrix/state/.\n"
            "  3. Remove the other legacy directory."
        )

    # --- single legacy source — safe migration ---
    src = legacies[0]
    print(f"Migrating state from '{src.relative_to(project_root)}' to '.matrix/' …",
          file=sys.stderr)

    # Backup the old directory
    backup = src.with_name(f"{src.name}.bak.{now()[:10]}")
    if not backup.exists():
        shutil.copytree(str(src), str(backup))
        print(f"  Backup kept at '{backup}'", file=sys.stderr)

    # Ensure target structure
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "changes").mkdir(parents=True, exist_ok=True)
    (mat_root(project_root) / "archive").mkdir(parents=True, exist_ok=True)

    # Copy state files — active.json → state_dir, config/gitignore → mat_root
    active_src = src / "active.json"
    if active_src.is_file():
        shutil.copy2(str(active_src), str(dst / "active.json"))
    for name in ("config.yaml", ".gitignore"):
        fp = src / name
        if fp.is_file():
            shutil.copy2(str(fp), str(mat_root(project_root) / name))

    # Copy change directories
    src_changes = src / "changes"
    if src_changes.is_dir():
        for child in sorted(src_changes.iterdir()):
            if child.is_dir():
                target = dst / "changes" / child.name
                if not target.exists():
                    shutil.copytree(str(child), str(target))

    # Copy archive
    src_archive = src / "archive"
    if src_archive.is_dir():
        for child in sorted(src_archive.iterdir()):
            if child.is_dir():
                target = mat_root(project_root) / "archive" / child.name
                if not target.exists():
                    shutil.copytree(str(child), str(target))

    print(f"  → ready at '{dst}'", file=sys.stderr)
    return True


# ---------------------------------------------------------------------------
# Active change (with legacy fallback)
# ---------------------------------------------------------------------------

def get_active(project_root: Path, allow_migration: bool = True) -> str:
    """Return the active change id.

    Checks ``.matrix/state/`` first; falls back to legacy migration when
    *allow_migration* is *True*.
    """
    active = active_path(project_root)

    # 1. Primary path
    if active.is_file():
        change = load_json(active).get("change_id")
        if isinstance(change, str) and flow_path(change, project_root).is_file():
            return change

    # 2. Attempt legacy migration
    if allow_migration and _migrate_legacy_state(project_root):
        if active.is_file():
            change = load_json(active).get("change_id")
            if isinstance(change, str) and flow_path(change, project_root).is_file():
                return change

    # 3. Nothing found — give a clear error
    if not mat_root(project_root).is_dir():
        fail(
            "No .matrix/ directory found in this project.\n"
            "Run 'matrix_state.py init' to create one, or change to a "
            "directory inside the project."
        )
    fail("No active Matrix change. Start with $matrix <request>.")


# ---------------------------------------------------------------------------
# Guard / checks
# ---------------------------------------------------------------------------

def meaningful(path: Path, headings=()) -> bool:
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8").strip()
    if len(text) < 40:
        return False
    return all(h in text for h in headings)


def checks(change_id: str, phase: str, project_root: Path):
    base = change_dir(change_id, project_root) / "artifacts"
    if phase == "open":
        return [
            ("proposal.md has goal, scope, and acceptance",
             meaningful(base / "proposal.md", ("## Goal", "## Scope", "## Acceptance"))),
        ]
    if phase == "design":
        return [
            ("design.md has decisions and test seams",
             meaningful(base / "design.md", ("## Decisions", "## Test seams"))),
            ("plan.md has ordered implementation steps",
             meaningful(base / "plan.md", ("## Steps", "## Validation"))),
        ]
    if phase == "build":
        return [
            ("plan.md exists", meaningful(base / "plan.md", ("## Steps",))),
            ("verification.md has build evidence",
             meaningful(base / "verification.md", ("## Build evidence",))),
        ]
    if phase == "verify":
        return [
            ("verification.md has test evidence",
             meaningful(base / "verification.md", ("## Test evidence",))),
            ("verification.md has review evidence",
             meaningful(base / "verification.md", ("## Review evidence",))),
        ]
    return [("verify guard passed before archive",
             meaningful(base / "verification.md", ("## Test evidence", "## Review evidence")))]


def guard(change_id: str, phase: str, project_root: Path, output: bool = True) -> bool:
    results = checks(change_id, phase, project_root)
    ok = all(result for _, result in results)
    if output:
        print(f"Matrix guard: {change_id} / {phase}")
        for label, result in results:
            print(f"[{'PASS' if result else 'FAIL'}] {label}")
    return ok


# ---------------------------------------------------------------------------
# Event log
# ---------------------------------------------------------------------------

def event_log(change_id: str, event_name: str, before, after, project_root: Path):
    log_dir = change_dir(change_id, project_root)
    log_dir.mkdir(parents=True, exist_ok=True)
    p = log_dir / "events.jsonl"
    with p.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {"at": now(), "event": event_name, "from": before, "to": after},
                ensure_ascii=False,
            )
            + "\n"
        )


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def init(args):
    project_root = resolve_for_init()
    mr = mat_root(project_root)
    sd = state_dir(project_root)
    active = active_path(project_root)

    change = re.sub(r"[^a-z0-9]+", "-", args.change.lower()).strip("-")
    if not change:
        fail("Change id must contain letters or digits.")

    # Refuse if already active
    if active.is_file():
        try:
            existing = load_json(active).get("change_id", "")
            if existing and flow_path(existing, project_root).is_file():
                fail(f"Active Matrix change already exists: {existing}.")
        except Exception:
            pass

    # Warn about legacy state
    legacies = _collect_legacy(project_root)
    if legacies and not active.is_file():
        rels = [str(d.relative_to(project_root)) for d in legacies]
        print(
            f"Warning: Legacy state found at {', '.join(rels)}. "
            "Run 'inspect' first to migrate it.",
            file=sys.stderr,
        )

    # Create directories
    (sd / "changes" / change / "artifacts").mkdir(parents=True)
    mr.mkdir(exist_ok=True)
    (mr / "archive").mkdir(exist_ok=True)

    # Config
    cfg = mr / "config.yaml"
    if not cfg.is_file():
        cfg.write_text("schema: matrix/config/v1\nauto_transition: true\n", encoding="utf-8")

    # Internal .gitignore (inside .matrix/)
    (mr / ".gitignore").write_text(
        "state/active.json\n"
        "state/changes/*/run-state.json\n"
        "state/changes/*/events.jsonl\n"
        "state/changes/*/artifacts/handoff.md\n"
        "archive/*/run-state.json\n"
        "archive/*/events.jsonl\n"
        "archive/*/artifacts/handoff.md\n",
        encoding="utf-8",
    )

    # Change metadata
    values = {
        "schema": "matrix/change/v1",
        "id": change,
        "workflow": args.workflow,
        "status": "active",
        "phase": "open",
        "title": args.title,
        "created_at": now(),
        "updated_at": now(),
        "acceptance": "pending",
        "scope": "pending",
    }
    write_flow(sd / "changes" / change / "matrix.yaml", values)
    write_json(
        sd / "changes" / change / "run-state.json",
        {"schema": "matrix/run/v1", "current_step": "open",
         "iteration": 0, "pending_gate": None, "updated_at": now()},
    )
    write_json(active, {"change_id": change})
    event_log(change, "initialized", None, "open", project_root)
    print(f"Initialized Matrix change '{change}'. Next: {SKILLS['open']}")


def inspect(args):
    project_root = resolve_for_read()
    change = get_active(project_root)
    flow = parse_flow(flow_path(change, project_root))
    phase = flow.get("phase", "invalid")
    if phase not in PHASES:
        fail(f"Invalid phase '{phase}'.")
    print(
        json.dumps(
            {
                "change_id": change,
                "workflow": flow.get("workflow"),
                "phase": phase,
                "next_skill": SKILLS[phase],
                "guard_pass": guard(change, phase, project_root, False),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def transition(args):
    project_root = resolve_for_read()
    change = get_active(project_root)
    flow = parse_flow(flow_path(change, project_root))
    before = flow.get("phase")
    expected = NEXT.get(before)
    if args.to != expected:
        fail(
            f"Illegal transition {before} -> {args.to}; "
            f"expected {expected or 'archive command'}."
        )
    if not guard(change, before, project_root):
        fail("Current phase guard failed; state was not changed.")
    flow["phase"] = args.to
    flow["updated_at"] = now()
    write_flow(flow_path(change, project_root), flow)
    event_log(change, "transition", before, args.to, project_root)
    print(f"Transitioned {change}: {before} -> {args.to}. Next: {SKILLS[args.to]}")


def archive_cmd(args):
    project_root = resolve_for_read()
    change = get_active(project_root)
    flow = parse_flow(flow_path(change, project_root))
    if flow.get("phase") != "archive":
        fail("Only an archive-phase change can be archived.")
    if not guard(change, "archive", project_root):
        fail("Archive guard failed; state was not changed.")
    flow["status"] = "archived"
    flow["updated_at"] = now()
    write_flow(flow_path(change, project_root), flow)
    event_log(change, "archived", "archive", "archived", project_root)
    src = change_dir(change, project_root)
    dst = mat_root(project_root) / "archive" / change
    shutil.move(str(src), str(dst))
    active_path(project_root).unlink()
    print(f"Archived Matrix change '{change}'.")


def handoff(args):
    project_root = resolve_for_read()
    change = get_active(project_root)
    flow = parse_flow(flow_path(change, project_root))
    phase = flow["phase"]
    p = artifact(change, "handoff.md", project_root)
    p.write_text(
        f"# Matrix handoff: {change}\n\n"
        f"- Workflow: {flow['workflow']}\n"
        f"- Current phase: {phase}\n"
        f"- Resume with: `{SKILLS[phase]}`\n"
        f"- Guard passes: {guard(change, phase, project_root, False)}\n",
        encoding="utf-8",
    )
    print(p)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Matrix — project-owned deterministic development workflow."
    )
    subs = parser.add_subparsers(dest="command", required=True)

    p = subs.add_parser("init")
    p.add_argument("change")
    p.add_argument("--workflow", choices=("full", "hotfix", "tweak"), default="full")
    p.add_argument("--title", required=True)
    p.set_defaults(func=init)

    subs.add_parser("inspect").set_defaults(func=inspect)

    p = subs.add_parser("guard")
    p.add_argument("phase", choices=PHASES)
    def guard_func(a):
        pr = resolve_for_read()
        sys.exit(0 if guard(get_active(pr), a.phase, pr) else 1)
    p.set_defaults(func=guard_func)

    p = subs.add_parser("transition")
    p.add_argument("to", choices=PHASES[1:])
    p.set_defaults(func=transition)

    subs.add_parser("archive").set_defaults(func=archive_cmd)
    subs.add_parser("handoff").set_defaults(func=handoff)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
