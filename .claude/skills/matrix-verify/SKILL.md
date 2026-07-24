---
name: matrix-verify
description: Verify the active Matrix change against its plan and review its diff. Use when the active Matrix phase is verify.
---

# Matrix Verify

Run the plan's acceptance commands and record their output summaries under `## Test evidence` in `artifacts/verification.md`.

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

If verification or review fails, **return to `$matrix-build`**; do not advance.

If documents or public behavior changed, record the required synchronization work before the guard.

## Process

1. Run the plan's acceptance commands
2. Record test output under `## Test evidence`
3. Load `code-review` skill
4. Run both axes (Standards + Spec) in parallel
5. Record findings under `## Review evidence`
6. Optionally run `improve-codebase-architecture`
7. Run the guard
8. If guard passes, run transition to advance to archive phase
9. **Then enter `$matrix-archive` to continue the workflow**

```powershell
python .claude/skills/matrix/scripts/matrix_state.py guard verify
python .claude/skills/matrix/scripts/matrix_state.py transition archive
```
