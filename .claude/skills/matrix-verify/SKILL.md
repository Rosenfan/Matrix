---
name: matrix-verify
description: Verify the active Matrix change against its plan and review its diff. Use when the active Matrix phase is verify.
---

# Matrix Verify

Run the plan's acceptance commands and record their output summaries under `## Test evidence` in `artifacts/verification.md`. Then use `code-review` against the implementation's fixed baseline and record its two axes under `## Review evidence`.

If verification or review fails, return to `$matrix-build`; do not advance. If documents or public behavior changed, record the required synchronization work before the guard.

## Optional: Architecture Improvement

After verification passes, if the change touched modules that could be deepened, use `improve-codebase-architecture` to scan for shallow-module opportunities. This is advisory — skip it for simple changes or when time is constrained.

```powershell
python .claude/skills/matrix/scripts/matrix_state.py guard verify
python .claude/skills/matrix/scripts/matrix_state.py transition archive
```
