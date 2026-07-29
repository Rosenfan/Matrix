---
name: matrix-build
description: Implement the frozen active Matrix plan with test-first vertical slices. Use when the active Matrix phase is build.
---

# Matrix Build

Run `matrix workflow inspect` and implement only its approved Contract. Full and `legacy-full` read proposal/design/plan. `lightweight` reads the approved compact proposal and must not backfill Design artifacts.

Write build evidence and user-facing explanations in `artifact_language`; preserve any Runtime-required English heading tokens.

## Prim

Use Matrix's own implementation and test discipline.

## Arch

- invoke `tdd` when the change modifies observable behavior at a testable seam;
- invoke `diagnosing-bugs` only when an actual failure exists and root cause is not established;
- invoke `resolving-merge-conflicts` only for an in-progress merge or rebase conflict.

Announce each triggered capability and reason. No companion may commit, review, transition, archive, or broaden scope. A correctly installed capability gets at most one Matrix-owned fallback for that same capability; record the Skill, failure, fallback, and evidence. Installation-integrity failure stops the phase.

## Scope Discipline

If implementation exposes a scope or design change, **stop and run**; a lightweight change is upgraded to full by this Return:

```powershell
matrix workflow return design --reason design-gap
```

Then enter `$matrix-design`; do not amend the plan silently. The Runtime preserves old verification evidence in revision history and requires fresh evidence after the redesigned plan returns to Build.

## Process

1. Implement the approved plan in bounded vertical slices.
2. Use only triggered Arch capabilities.
3. Record common facts under `## Build evidence`. Hotfix also requires `## Reproduction evidence` and `## Root cause`; tweak also requires `## Scope evidence`.
4. Run the guard and transition, then enter `$matrix-verify`.

```powershell
matrix workflow guard build
matrix workflow transition verify
```
