---
name: matrix-status
description: Inspect the active Matrix workflow and report its disk-backed phase, guard result, and recovery command. Use when the user asks for Matrix status, next step, or to resume interrupted Matrix work.
---

# Matrix Status

Run the same Matrix state kernel used by the main entry and every phase Skill:

```powershell
python .claude/skills/matrix/scripts/matrix_state.py inspect
```

Report the returned change id, workflow, phase, guard result, and `next_skill`. Do not infer status from conversation history and do not modify state. If the guard is failing, name the missing evidence and direct the user to the current phase Skill.
