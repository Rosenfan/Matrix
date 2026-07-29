---
name: matrix-status
description: Inspect the active Matrix workflow and report its disk-backed phase, guard result, and recovery command. Use when the user asks for Matrix status, next step, or to resume interrupted Matrix work.
---

# Matrix Status

Run the same Matrix state kernel used by the main entry and every phase Skill:

```powershell
matrix workflow inspect
matrix workflow doctor
```

Report the returned change id, workflow, `profile`, `evidence_policy`, frozen `orchestration`, phase, guard result, `next_skill`, Workflow health, unfinished transactions, available strategies, and exact recovery commands. If Arch integrity fails, identify the affected platform/Skill facts and report `matrix init --with-mattpocock`; do not reinterpret the change as Prim. Both commands are read-only. Do not infer status from conversation history, run `--repair`, or modify state. If the guard is failing, name the missing evidence and direct the user to the current phase Skill.
