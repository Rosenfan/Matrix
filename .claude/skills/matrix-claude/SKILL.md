---
name: matrix-claude
description: Export a frozen Matrix design as a bounded Claude Code task package without changing Matrix workflow state. Use when Codex should design and Claude Code should implement.
---

# Matrix Claude Handoff

This is an optional Matrix sidecar, not a Matrix phase. It must not call `transition`, `archive`, or write `matrix.yaml`, `run-state.json`, or `events.jsonl`.

## Preconditions

The exporter performs this read-only check before writing anything:

```powershell
python .claude/skills/matrix/scripts/matrix_state.py guard design
```

If the design guard fails, stop and return to `$matrix-design`. The exporter reads the active change's `proposal.md`, `design.md`, and `plan.md`; it does not invent missing facts.

## Export

Treat explicit invocation of `$matrix-claude` as the user's choice of Claude Code as the implementation actor. Generate the package with the deterministic exporter; it refuses a missing design guard and does not alter Matrix state.

```powershell
# Generic project: only exports a Matrix artifact.
python .claude/skills/matrix/scripts/matrix_claude.py export --task-id <ID> --target generic

# FnSec: exports its formal task package. Add --apply-fnsec-board only when
# active.md is NO_ACTIVE_OBJECTIVE; an existing task is never overwritten.
python .claude/skills/matrix/scripts/matrix_claude.py export --task-id <ID> --target fnsec --apply-fnsec-board
```

If the project has a documented collaboration protocol, use its package path and fields.

For FnSec, use `docs/tasks/claude-task-<ID>.md`, update `docs/tasks/active.md` to the Claude queued state, and require `docs/tasks/claude-result-<ID>.md`. Preserve its frozen-task and Codex-review rules.

For a project without a protocol, the exporter creates `artifacts/claude-task.md` beside the active Matrix artifacts. The package contains:

1. Task ID and explicit execution actor: Claude Code.
2. Objective and acceptance criteria copied from Matrix artifacts.
3. In-scope and out-of-scope boundaries.
4. Frozen design decisions and the ordered implementation plan.
5. Allowed and prohibited files/actions.
6. Required test, lint, typecheck, or build commands.
7. Stop conditions: ambiguity, scope expansion, failing acceptance, or a design conflict.
8. Required result: changed files, commands and outputs, tests, residual risks, and `NEEDS_DECISION` items.

After writing the package, report its path and give the user a copyable Claude Code invocation. Do not start Claude Code yourself, do not implement the package's code, and do not advance Matrix. When Claude returns a result, Codex resumes normal Matrix verification through `$matrix-verify`.
