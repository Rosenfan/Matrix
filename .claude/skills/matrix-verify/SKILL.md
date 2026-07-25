---
name: matrix-verify
description: Verify the active Matrix change against its plan and review its diff. Use when the active Matrix phase is verify.
---

# Matrix Verify

Run the plan's acceptance commands and record their output summaries under `## Test evidence` in `artifacts/verification.md`.

## Input Sources

This phase can receive implementation from two sources:

1. **Direct Codex implementation** — from `$matrix-build` phase
2. **Claude Code implementation** — from `$matrix-claude` sidecar

Regardless of source, the verification process is the same: check that implementation evidence meets the plan's requirements.

## Prerequisites

Before starting verification, ensure:

- [ ] `artifacts/verification.md` exists
- [ ] `## Build evidence` section is present and substantive
- [ ] All commands from the plan's `## Validation` section have been run
- [ ] Test results are recorded

If these are missing (e.g., Claude Code didn't produce complete evidence), return to `$matrix-build` or ask Claude Code to补充.

## Skills to Use

### Primary: `code-review`

Use the `code-review` skill to perform a two-axis review of the diff:

1. **Standards axis** — Does the code conform to this repo's documented coding standards? Includes a "smell baseline" (Fowler code smells) even when no standards are documented.

2. **Spec axis** — Does the code faithfully implement the originating issue/PRD/spec? Checks for:
   - Missing or partial requirements
   - Scope creep (behavior not asked for)
   - Wrong implementations of required behavior

Both axes run as parallel sub-agents and report separately. Record findings under `## Review evidence` in `artifacts/verification.md`.

### Optional: `improve-codebase-architecture`

After verification passes, if the change touched modules that could be deepened, use `improve-codebase-architecture` to scan for shallow-module opportunities. This is advisory — skip it for simple changes or when time is constrained.

## Failure Handling

If verification or review fails:
- If the issue is in the implementation → **return to `$matrix-build`** or ask Claude Code to fix
- If the issue is in the plan/design → return to `$matrix-design`

If documents or public behavior changed, record the required synchronization work before the guard.

## Process

1. Check that `artifacts/verification.md` exists with `## Build evidence`
2. Run the plan's acceptance commands (from `plan.md` `## Validation` section)
3. Record test output under `## Test evidence`
4. Load `code-review` skill
5. Run both axes (Standards + Spec) in parallel
6. Record findings under `## Review evidence`
7. Optionally run `improve-codebase-architecture`
8. Run the guard
9. If guard passes, run transition to advance to archive phase
10. **Then enter `$matrix-archive` to continue the workflow**

```powershell
python .matrix/scripts/matrix_state.py guard verify
python .matrix/scripts/matrix_state.py transition archive
```

## Evidence Requirements

The guard checks for:

1. **Test evidence** — Output from running the plan's validation commands
2. **Review evidence** — Findings from the two-axis code review

Both must be present and substantive (>40 chars each) to pass the guard.
