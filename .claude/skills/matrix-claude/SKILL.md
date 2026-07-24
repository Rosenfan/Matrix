---
name: matrix-claude
description: Export a frozen Matrix design as a bounded Claude Code task package without changing Matrix workflow state. Use when Codex should design and Claude Code should implement.
---

# Matrix Claude Handoff

This is an optional Matrix sidecar, not a Matrix phase. It must not call `transition`, `archive`, or write `matrix.yaml`, `run-state.json`, or `events.jsonl`.

## When to Use

Use `$matrix-claude` when:
- The design phase guard has passed (design is frozen)
- You want Claude Code (instead of Codex) to implement the design
- You need a bounded task package with all implementation details

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

## Task Package Contents

The exported package (`artifacts/claude-task.md`) contains everything Claude Code needs to implement and produce evidence for `$matrix-verify`:

1. **Task ID and execution actor**: Claude Code
2. **Objective and acceptance criteria** — copied from `proposal.md`
3. **In-scope and out-of-scope boundaries** — from `proposal.md`
4. **Frozen design decisions** — from `design.md` (Decisions, Boundaries, Test seams)
5. **Ordered implementation plan** — from `plan.md` (Steps, Validation)
6. **Allowed and prohibited files/actions** — to prevent scope creep
7. **Required commands** — test, lint, typecheck, build commands to run
8. **Stop conditions** — ambiguity, scope expansion, failing acceptance, design conflict
9. **Required evidence for verify**:
   - Changed files list
   - Commands and their outputs
   - Test results (pass/fail)
   - Build evidence
   - Residual risks
   - `NEEDS_DECISION` items (if any)

## After Claude Code Completes

When Claude Code returns results, verify that the following evidence is present before proceeding to `$matrix-verify`:

- [ ] `artifacts/verification.md` exists with `## Build evidence` section
- [ ] Build evidence includes concrete commands and outcomes
- [ ] All tests in the plan's validation section have been run
- [ ] Any `NEEDS_DECISION` items have been resolved or documented

If evidence is missing, ask Claude Code to补充 before proceeding.

## Resuming Matrix Workflow

After Claude Code completes and evidence is present:

1. Run build guard to verify evidence:
   ```powershell
   python .claude/skills/matrix/scripts/matrix_state.py guard build
   ```

2. If guard passes, transition to verify:
   ```powershell
   python .claude/skills/matrix/scripts/matrix_state.py transition verify
   ```

3. Enter `$matrix-verify` to继续验证流程

If the build guard fails, return to Claude Code to补充 missing evidence.

## Important Notes

- This sidecar does NOT change Matrix phase, workflow, or guard result
- The Matrix state remains in `design` phase until explicitly transitioned
- Claude Code must produce evidence that satisfies the build guard conditions
- After successful transition to verify, the normal verify流程 continues
