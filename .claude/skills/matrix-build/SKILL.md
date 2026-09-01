---
name: matrix-build
description: Implement the frozen active Matrix plan with test-first vertical slices. Use when the active Matrix phase is build.
---

# Matrix Build

Run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` and implement only its approved Contract. Full and `legacy-full` read proposal/design/plan. `lightweight` reads the approved compact proposal and must not backfill Design artifacts.

Write build evidence and user-facing explanations in `artifact_language`; preserve any Runtime-required English heading tokens.

## Prim

Use Matrix's own implementation and test discipline.

## Arch

- invoke `tdd` when the change modifies observable behavior at a testable seam;
- invoke `diagnosing-bugs` only when an actual failure exists and root cause is not established;
- invoke `writing-for-agents` when the approved Contract changes agent-facing instructions;
- invoke `wizard` only to generate and statically verify human-run shell steps required by the Contract; never execute the wizard end-to-end or collect secrets.

Resolve an in-progress merge/rebase through Matrix-owned conflict handling. Do not invoke raw `resolving-merge-conflicts`, because it can stage, continue, and commit outside Matrix lifecycle ownership. Never invoke `implement` inside an active Change.

Announce each triggered capability and reason. No companion may commit, review, transition, archive, or broaden scope. A correctly installed capability gets at most one Matrix-owned fallback for that same capability; record the Skill, failure, fallback, and evidence. Installation-integrity failure stops the phase.

## Scope Discipline

If implementation exposes a scope or design change, **stop and run**; a lightweight change is upgraded to full by this Return:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap
```

Then enter `$matrix-design`; do not amend the plan silently. The Runtime preserves old verification evidence in revision history and requires fresh evidence after the redesigned plan returns to Build.

## Process

1. Implement the approved plan in bounded vertical slices.
2. Use only triggered Arch capabilities.
3. Record common facts under `## Build evidence`. Hotfix also requires `## Reproduction evidence` and `## Root cause`; tweak also requires `## Scope evidence`.
4. Run the guard and transition, then enter `$matrix-verify`.

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
```
