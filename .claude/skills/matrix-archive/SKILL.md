---
name: matrix-archive
description: Close and archive a verified Matrix change. Use when the active Matrix phase is archive.
---

# Matrix Archive

Read the proposal, plan, and verification evidence. Summarize changed behavior, verification, residual risks, and follow-up work in `artifacts/verification.md` or the project's normal delivery document. Ask for explicit confirmation before committing or archiving.

After confirmation, run:

```powershell
python .claude/skills/matrix/scripts/matrix_state.py archive
```

Do not archive if the verify guard fails.
