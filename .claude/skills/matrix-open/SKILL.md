---
name: matrix-open
description: Open or resume the Matrix open phase by clarifying a development request into an evidence-backed proposal. Use after $matrix initializes a change or when the active Matrix phase is open.
---

# Matrix Open

Read the active Matrix change with `matrix_state.py inspect`. Produce `artifacts/proposal.md` containing exactly these substantive sections: `## Goal`, `## Scope`, `## Non-goals`, `## Acceptance`, and `## Risks`.

For a full workflow, use `grill-with-docs` or `grilling` to resolve ambiguity before writing the proposal. For hotfix/tweak, keep this concise but preserve acceptance criteria. Ask the user to confirm when scope or risk is material.

Run the gate, then advance only if it passes:

```powershell
python .claude/skills/matrix/scripts/matrix_state.py guard open
python .claude/skills/matrix/scripts/matrix_state.py transition design
```
