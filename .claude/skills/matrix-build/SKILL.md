---
name: matrix-build
description: Implement the frozen active Matrix plan with test-first vertical slices. Use when the active Matrix phase is build.
---

# Matrix Build

Read `plan.md`, `design.md`, and repository instructions. Implement only the frozen scope.

## Skills to Use

### Primary: `implement`

Use the `implement` skill to execute the plan. It automatically:

1. Uses `/tdd` at pre-agreed seams for red-green-refactor cycles
2. Runs typechecking regularly
3. Runs single test files regularly during development
4. Runs the full test suite once at the end
5. Uses `/code-review` to review the work when done
6. Commits work to the current branch

### On Failure: `diagnosing-bugs`

When encountering crashes, test failures, or build failures:

1. **Stop** — do not propose source code fixes before root cause is located
2. Load the `diagnosing-bugs` skill
3. Follow its feedback-loop discipline: build a tight red/pass signal first
4. Only after root cause is identified, implement the fix through `implement` + `tdd`
5. Record the diagnosis and fix in `artifacts/verification.md` under `## Build evidence`

### On Merge Conflicts: `resolving-merge-conflicts`

If merge conflicts occur during implementation, use the `resolving-merge-conflicts` skill to resolve them systematically.

## Scope Discipline

If implementation exposes a scope or design change, **stop and return to `$matrix-design`**; do not amend the plan silently.

## Process

1. Load `implement` skill
2. Implement through vertical slices with TDD
3. On failure: load `diagnosing-bugs` skill
4. On merge conflicts: load `resolving-merge-conflicts` skill
5. Record concrete commands and outcomes under `## Build evidence` in `artifacts/verification.md`
6. Run the guard
7. If guard passes, run transition to advance to verify phase
8. **Then enter `$matrix-verify` to continue the workflow**

```powershell
python .claude/skills/matrix/scripts/matrix_state.py guard build
python .claude/skills/matrix/scripts/matrix_state.py transition verify
```
