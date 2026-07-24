---
name: matrix-design
description: Design and freeze the active Matrix change before implementation. Use when the active Matrix phase is design or when build scope requires redesign.
---

# Matrix Design

Read the active proposal. Write `artifacts/design.md` with `## Decisions`, `## Boundaries`, `## Test seams`, and `## Risks`; write `artifacts/plan.md` with `## Steps`, `## Validation`, and `## Stop conditions`.

Use `prototype` only when a runnable experiment is needed to settle a design question. Use `domain-modeling` or `codebase-design` when terminology or module seams are the uncertainty. Use `research` when the design requires investigating external APIs, documentation, or specifications beyond the codebase. Confirm material architecture choices with the user before freezing the plan.

```powershell
python .claude/skills/matrix/scripts/matrix_state.py guard design
python .claude/skills/matrix/scripts/matrix_state.py transition build
```
