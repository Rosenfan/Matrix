---
name: matrix-build
description: Implement the frozen active Matrix plan with test-first vertical slices. Use when the active Matrix phase is build.
---

# Matrix Build

Read `plan.md`, `design.md`, and repository instructions. Implement only the frozen scope. Use `implement` and its `tdd` loop at the confirmed seams. Run focused checks regularly.

Record concrete commands and outcomes under `## Build evidence` in `artifacts/verification.md`. If implementation exposes a scope or design change, stop and return to `$matrix-design`; do not amend the plan silently.

## Failure Diagnosis

When encountering crashes, test failures, or build failures:

1. **Stop** — do not propose source code fixes before root cause is located
2. Use the Skill tool to load `diagnosing-bugs`
3. Follow its feedback-loop discipline: build a tight red/pass signal first
4. Only after root cause is identified, implement the fix through `implement` + `tdd`
5. Record the diagnosis and fix in `artifacts/verification.md` under `## Build evidence`

```powershell
python .claude/skills/matrix/scripts/matrix_state.py guard build
python .claude/skills/matrix/scripts/matrix_state.py transition verify
```
