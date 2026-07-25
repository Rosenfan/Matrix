---
name: matrix-archive
description: Close and archive a verified Matrix change. Use when the active Matrix phase is archive.
---

# Matrix Archive

This is the **final phase** of the Matrix workflow. After archiving, the workflow is complete.

## Process

1. Read the proposal, plan, and verification evidence
2. Summarize changed behavior, verification, residual risks, and follow-up work in `artifacts/verification.md` or the project's normal delivery document
3. Ask for explicit confirmation before committing or archiving
4. Run the archive command (this also runs the verify guard)
5. **Workflow complete** — no further phase transitions needed

```powershell
python .matrix/scripts/matrix_state.py archive
```

Do not archive if the verify guard fails.

## After Archive

The change is moved to the Matrix archive directory (`.matrix/archive/`). To start a new change, run `$matrix` again.
