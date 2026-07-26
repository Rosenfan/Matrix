#!/usr/bin/env python3
"""Deterministic state and guard kernel shared by every Matrix Skill."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

PHASES = ("open", "design", "build", "verify", "archive")
NEXT = {"open": "design", "design": "build", "build": "verify", "verify": "archive"}
SKILLS = {phase: f"$matrix-{phase}" for phase in PHASES}

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
def root(): return Path.cwd() / ".matrix"
def active_path(): return root() / "active.json"
def fail(message): print(f"MATRIX ERROR: {message}", file=sys.stderr); raise SystemExit(2)
def write_json(path, value): path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
def load_json(path): return json.loads(path.read_text(encoding="utf-8"))
def flow_path(change): return root() / "changes" / change / "matrix.yaml"
def parse_flow(path):
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1); values[key.strip()] = value.strip().strip('"')
    return values
def write_flow(path, values):
    order = ("schema", "id", "workflow", "status", "phase", "title", "created_at", "updated_at", "acceptance", "scope")
    path.write_text("\n".join(f"{key}: {values.get(key, '')}" for key in order) + "\n", encoding="utf-8")
def get_active():
    if not active_path().exists(): fail("No active Matrix change. Start with $matrix <request>.")
    change = load_json(active_path()).get("change_id")
    if not isinstance(change, str) or not flow_path(change).exists(): fail("active.json does not reference a valid Matrix change.")
    return change
def artifact(change, name): return root() / "changes" / change / "artifacts" / name
def meaningful(path, headings=()):
    if not path.exists(): return False
    text = path.read_text(encoding="utf-8").strip()
    if len(text) < 40: return False
    return all(h in text for h in headings)
def checks(change, phase):
    base = root() / "changes" / change / "artifacts"
    if phase == "open":
        return [("proposal.md has goal, scope, and acceptance", meaningful(base / "proposal.md", ("## Goal", "## Scope", "## Acceptance")))]
    if phase == "design":
        return [("design.md has decisions and test seams", meaningful(base / "design.md", ("## Decisions", "## Test seams"))), ("plan.md has ordered implementation steps", meaningful(base / "plan.md", ("## Steps", "## Validation")))]
    if phase == "build":
        return [("plan.md exists", meaningful(base / "plan.md", ("## Steps",))), ("verification.md has build evidence", meaningful(base / "verification.md", ("## Build evidence",)))]
    if phase == "verify":
        return [("verification.md has test evidence", meaningful(base / "verification.md", ("## Test evidence",))), ("verification.md has review evidence", meaningful(base / "verification.md", ("## Review evidence",)))]
    return [("verify guard passed before archive", meaningful(base / "verification.md", ("## Test evidence", "## Review evidence")))]
def guard(change, phase, output=True):
    results = checks(change, phase)
    ok = all(result for _, result in results)
    if output:
        print(f"Matrix guard: {change} / {phase}")
        for label, result in results: print(f"[{'PASS' if result else 'FAIL'}] {label}")
    return ok
def event(change, event_name, before, after):
    p = root() / "changes" / change / "events.jsonl"
    with p.open("a", encoding="utf-8") as handle: handle.write(json.dumps({"at": now(), "event": event_name, "from": before, "to": after}, ensure_ascii=False) + "\n")
def init(args):
    change = re.sub(r"[^a-z0-9]+", "-", args.change.lower()).strip("-")
    if not change: fail("Change id must contain letters or digits.")
    if active_path().exists(): fail(f"Active Matrix change already exists: {get_active()}.")
    directory = root() / "changes" / change
    if directory.exists() or (root() / "archive" / change).exists(): fail(f"Matrix change already exists: {change}.")
    (directory / "artifacts").mkdir(parents=True)
    root().mkdir(exist_ok=True); (root() / "archive").mkdir(exist_ok=True)
    (root() / "config.yaml").write_text("schema: matrix/config/v1\nauto_transition: true\n", encoding="utf-8") if not (root() / "config.yaml").exists() else None
    gitignore = root() / ".gitignore"
    ignored = "active.json\ninstallation.json\nchanges/*/run-state.json\nchanges/*/events.jsonl\nchanges/*/artifacts/handoff.md\n"
    gitignore.write_text(ignored, encoding="utf-8") if not gitignore.exists() else None
    values = {"schema":"matrix/change/v1", "id":change, "workflow":args.workflow, "status":"active", "phase":"open", "title":args.title, "created_at":now(), "updated_at":now(), "acceptance":"pending", "scope":"pending"}
    write_flow(directory / "matrix.yaml", values)
    write_json(directory / "run-state.json", {"schema":"matrix/run/v1", "current_step":"open", "iteration":0, "pending_gate":None, "updated_at":now()})
    write_json(active_path(), {"change_id":change})
    event(change, "initialized", None, "open")
    print(f"Initialized Matrix change '{change}'. Next: {SKILLS['open']}")
def inspect(_):
    change = get_active(); flow = parse_flow(flow_path(change)); phase = flow.get("phase", "invalid")
    if phase not in PHASES: fail(f"Invalid phase '{phase}'.")
    print(json.dumps({"change_id":change, "workflow":flow.get("workflow"), "phase":phase, "next_skill":SKILLS[phase], "guard_pass":guard(change, phase, False)}, ensure_ascii=False, indent=2))
def transition(args):
    change = get_active(); flow = parse_flow(flow_path(change)); before = flow.get("phase")
    expected = NEXT.get(before)
    if args.to != expected: fail(f"Illegal transition {before} -> {args.to}; expected {expected or 'archive command' }.")
    if not guard(change, before): fail("Current phase guard failed; state was not changed.")
    flow["phase"] = args.to; flow["updated_at"] = now(); write_flow(flow_path(change), flow); event(change, "transition", before, args.to)
    print(f"Transitioned {change}: {before} -> {args.to}. Next: {SKILLS[args.to]}")
def archive(_):
    change = get_active(); flow = parse_flow(flow_path(change))
    if flow.get("phase") != "archive": fail("Only an archive-phase change can be archived.")
    if not guard(change, "archive"): fail("Archive guard failed; state was not changed.")
    flow["status"] = "archived"; flow["updated_at"] = now(); write_flow(flow_path(change), flow); event(change, "archived", "archive", "archived")
    source = root() / "changes" / change; target = root() / "archive" / change; shutil.move(str(source), str(target)); active_path().unlink()
    print(f"Archived Matrix change '{change}'.")
def handoff(_):
    change = get_active(); flow = parse_flow(flow_path(change)); phase = flow["phase"]
    p = artifact(change, "handoff.md")
    p.write_text(f"# Matrix handoff: {change}\n\n- Workflow: {flow['workflow']}\n- Current phase: {phase}\n- Resume with: `{SKILLS[phase]}`\n- Guard passes: {guard(change, phase, False)}\n", encoding="utf-8")
    print(p)
def main():
    parser = argparse.ArgumentParser(); subs = parser.add_subparsers(dest="command", required=True)
    p = subs.add_parser("init"); p.add_argument("change"); p.add_argument("--workflow", choices=("full","hotfix","tweak"), default="full"); p.add_argument("--title", required=True); p.set_defaults(func=init)
    subs.add_parser("inspect").set_defaults(func=inspect)
    p = subs.add_parser("guard"); p.add_argument("phase", choices=PHASES); p.set_defaults(func=lambda a: sys.exit(0 if guard(get_active(), a.phase) else 1))
    p = subs.add_parser("transition"); p.add_argument("to", choices=PHASES[1:]); p.set_defaults(func=transition)
    subs.add_parser("archive").set_defaults(func=archive); subs.add_parser("handoff").set_defaults(func=handoff)
    args = parser.parse_args(); args.func(args)
if __name__ == "__main__": main()
