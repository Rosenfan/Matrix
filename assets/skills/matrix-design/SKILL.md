---
name: matrix-design
description: Design and freeze the active Matrix change before implementation. Use when the active Matrix phase is design or when build scope requires redesign.
---

# Matrix Design

Design is used by `full` and resumable legacy shortcut changes only. A new lightweight hotfix/tweak moves directly from Open to Build and must not create Design artifacts merely to satisfy the full guard.

Use `artifact_language` from `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` for all design and plan prose. Keep Runtime-required English heading tokens unchanged.

Run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect`, read the active proposal and frozen `orchestration`, then write `artifacts/design.md` with `## Decisions`, `## Boundaries`, `## Test seams`, and `## Risks`; write `artifacts/plan.md` with `## Steps`, `## Validation`, and `## Stop conditions`.

## Prim

Use Matrix's own capability to investigate the repository and design the change.

## Arch

Invoke only capabilities whose task-fact trigger is proven:

- `domain-modeling` for unclear vocabulary, invariants, or architectural decisions;
- `research` when required external facts cannot be established from the repository;
- `prototype` when a material design decision needs disposable empirical evidence;
- `codebase-design` when a deep-module, interface, or test-seam decision remains;
- `writing-for-agents` when the Contract creates or changes Skills, `AGENTS.md`, `CLAUDE.md`, or documents reached through agent pointers.

Order follows actual dependencies; never run a fixed companion sequence. Announce each invocation and reason. A correctly installed capability gets at most one same-capability Matrix fallback; installation-integrity failure stops the phase.

Long-lived domain, ADR, or research artifacts follow repository conventions, and material conclusions must be synchronized into the canonical design or plan. Prototypes default to an OS temporary directory unless the approved design promotes a project path. Companion output cannot own Matrix state or create a competing plan.

`wayfinder` and `improve-codebase-architecture` are explicit handoffs outside the active Design. Recommend one only when its purpose fits, then let the user invoke it; a selected result may enter a separate governed Change.

## Process

1. Establish repository facts and resolve only triggered design questions.
2. Write and synchronize the canonical Matrix design and plan.
3. Confirm material architecture choices with the user before freezing.
4. Run the guard, then choose the implementation actor.

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard design
```

## Implementation Decision Point

After the design guard passes and before `transition build`, pause and present the implementation-actor choice to the user. Do not transition without an explicit choice:

### Option A: Continue with the current agent / model (default)

Run transition and enter `$matrix-build`:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build
```

Then enter `$matrix-build` to implement directly in this session.

### Option B: Switch the model, keep this agent

The user switches the model in their own client (for example, a stronger model for design, an efficient one for implementation), returns to this session, and confirms. Then run transition exactly as in Option A. Matrix cannot see the client-side model; it provides the mandatory pause point only.

### Option C: Switch the implementation agent

First approve the frozen contract by transitioning to Build, then run `$matrix-handoff` to export a bounded task package for the chosen agent (for example Codex designs, Claude Code implements; or zcode designs, opencode implements). This:
- Does not change the Build phase or state beyond the preceding transition
- Creates `artifacts/handoff-task-<task-id>.md` with all implementation details
- Includes acceptance criteria, test seams, and required commands

After the implementation agent completes and returns results, run the Build guard and enter `$matrix-verify`:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
```

Then enter `$matrix-verify` to verify the implementation.

Record the chosen option in `design.md` under `## Decisions` so it freezes with the Contract.
