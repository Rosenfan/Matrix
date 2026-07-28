---
name: matrix-build
description: Implement the frozen active Matrix plan with test-first vertical slices. Use when the active Matrix phase is build.
---

# Matrix Build

Run `matrix workflow inspect`. Read `plan.md`, `design.md`, the approved Contract, and repository instructions. Implement only the frozen scope.

## Prim

Use Matrix's own implementation and test discipline.

## Arch

- invoke `tdd` when the change modifies observable behavior at a testable seam;
- invoke `diagnosing-bugs` only when an actual failure exists and root cause is not established;
- invoke `resolving-merge-conflicts` only for an in-progress merge or rebase conflict.

Announce each triggered capability and reason. No companion may commit, review, transition, archive, or broaden scope. A correctly installed capability gets at most one Matrix-owned fallback for that same capability; record the Skill, failure, fallback, and evidence. Installation-integrity failure stops the phase.

## Scope Discipline

If implementation exposes a scope or design change, **stop and run**:

```powershell
matrix workflow return design --reason design-gap
```

Then enter `$matrix-design`; do not amend the plan silently. The Runtime preserves old verification evidence in revision history and requires fresh evidence after the redesigned plan returns to Build.

## Process

1. Implement the approved plan in bounded vertical slices.
2. Use only triggered Arch capabilities.
3. Record commands, outcomes, capability invocations and fallbacks under `## Build evidence`.
4. Run the guard and transition, then enter `$matrix-verify`.

```powershell
matrix workflow guard build
matrix workflow transition verify
```
