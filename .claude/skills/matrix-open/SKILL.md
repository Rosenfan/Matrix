---
name: matrix-open
description: Open or resume the Matrix open phase by clarifying a development request into an evidence-backed proposal. Use after $matrix initializes a change or when the active Matrix phase is open.
---

# Matrix Open

Read the active Matrix change with `matrix_state.py inspect`. Produce `artifacts/proposal.md` containing exactly these substantive sections: `## Goal`, `## Scope`, `## Non-goals`, `## Acceptance`, and `## Risks`.

## Skills to Use

For a **full workflow**, use `grill-with-docs` to resolve ambiguity before writing the proposal. This skill automatically:

1. Runs a `/grilling` session to stress-test the plan through relentless Q&A
2. Invokes `/domain-modeling` to establish shared vocabulary
3. Creates or updates `CONTEXT.md` with domain terms
4. Creates ADRs (Architecture Decision Records) for significant decisions

For **hotfix/tweak**, use `grilling` directly (without docs) — keep it concise but preserve acceptance criteria.

## Process

1. Run `grill-with-docs` (or `grilling` for hotfix/tweak)
2. Write `proposal.md` with all required sections
3. Ask the user to confirm when scope or risk is material
4. Run the guard
5. If guard passes, run transition to advance to design phase
6. **Then enter `$matrix-design` to continue the workflow**

```powershell
python .matrix/scripts/matrix_state.py guard open
python .matrix/scripts/matrix_state.py transition design
```
