---
name: matrix-design
description: Design and freeze the active Matrix change before implementation. Use when the active Matrix phase is design or when build scope requires redesign.
---

# Matrix Design

Design is used by `full` and resumable legacy shortcut changes only. A new lightweight hotfix/tweak moves directly from Open to Build and must not create Design artifacts merely to satisfy the full guard.

Use `artifact_language` from `matrix workflow inspect` for all design and plan prose. Keep Runtime-required English heading tokens unchanged.

Run `matrix workflow inspect`, read the active proposal and frozen `orchestration`, then write `artifacts/design.md` with `## Decisions`, `## Boundaries`, `## Test seams`, and `## Risks`; write `artifacts/plan.md` with `## Steps`, `## Validation`, and `## Stop conditions`.

## Prim

Use Matrix's own capability to investigate the repository and design the change.

## Arch

Invoke only capabilities whose task-fact trigger is proven:

- `domain-modeling` for unclear vocabulary, invariants, or architectural decisions;
- `research` when required external facts cannot be established from the repository;
- `wayfinder` when module ownership or dependency seams are unknown;
- `prototype` when a material design decision needs disposable empirical evidence;
- `codebase-design` when a deep-module, interface, or test-seam decision remains.

Order follows actual dependencies; never run a fixed companion sequence. Announce each invocation and reason. A correctly installed capability gets at most one same-capability Matrix fallback; installation-integrity failure stops the phase.

Long-lived domain, ADR, or research artifacts follow repository conventions, and material conclusions must be synchronized into the canonical design or plan. Prototypes default to an OS temporary directory unless the approved design promotes a project path. Companion output cannot own Matrix state or create a competing plan.

## Process

1. Establish repository facts and resolve only triggered design questions.
2. Write and synchronize the canonical Matrix design and plan.
3. Confirm material architecture choices with the user before freezing.
4. Run the guard, then choose the implementation actor.

```powershell
matrix workflow guard design
```

## Implementation Decision Point

After the design guard passes, the user chooses:

### Option A: Continue with Codex (default)

Run transition and enter `$matrix-build`:

```powershell
matrix workflow transition build
```

Then enter `$matrix-build` to implement directly in this session.

### Option B: Use Claude Code for implementation

First approve the frozen contract by transitioning to Build, then run `$matrix-claude` to export a bounded task package. This:
- Does not change the Build phase or state beyond the preceding transition
- Creates `artifacts/claude-task.md` with all implementation details
- Includes acceptance criteria, test seams, and required commands

After Claude Code completes and returns results, run the Build guard and enter `$matrix-verify`:

```powershell
matrix workflow guard build
matrix workflow transition verify
```

Then enter `$matrix-verify` to verify the implementation.
