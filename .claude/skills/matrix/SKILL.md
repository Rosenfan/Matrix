---
name: matrix
description: Route, initialize, resume, and govern a persistent Matrix development workflow. Use when the user starts a feature, change, bug fix, or asks to resume managed development.
---

# Matrix

Use Matrix as the development-workflow entrypoint. Its source of truth is the current repository's `.matrix/` directory — shared by every AI coding agent; never infer a phase from chat history.

## Route

First run:

```powershell
python .matrix/scripts/matrix_state.py inspect
```

- If an active change exists, show its phase and enter the returned `next_skill`.
- If no active change exists, classify the request: reproducible small bug → `$matrix-hotfix` with workflow `hotfix`; bounded small change with no public API/schema/architecture impact → `$matrix-tweak` with workflow `tweak`; otherwise full Matrix with workflow `full`.
- Do not create Matrix state for questions, read-only investigation, or requests outside software development.
- Before `init`, derive a short kebab-case change id and an accurate title. Start with `full` unless a shortcut clearly applies.

```powershell
python .matrix/scripts/matrix_state.py init <change-id> --workflow <full|hotfix|tweak> --title "<title>"
```

Then enter `$matrix-open`. State initialization creates tracked design artifacts and ignores machine-only state without changing the repository's existing `.gitignore`.

## Optional Claude handoff

`$matrix-claude` is an optional sidecar command that exports a frozen Matrix design to a Claude Code task package. It never changes the Matrix phase, workflow, guard result, or runtime state.

## Cross-Cutting Skills

### Handoff (`handoff`)
When context is running low and work needs to continue in a fresh session, use `handoff` at any stage boundary. It compacts the conversation into a handoff document with suggested skills for the next agent. Save to the OS temp directory, not the workspace.

## Rules

- A phase can advance only through `matrix_state.py transition`; run its guard first.
- Do not replace required evidence with an assertion that work is complete.
- Pause for user confirmation at material architecture/scope decisions and before archive/commit.
- On scope expansion, return to `$matrix-design`; never silently continue the old plan.
