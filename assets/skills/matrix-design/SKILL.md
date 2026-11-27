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
2. Write and synchronize the canonical Matrix design and plan. Pin exact target file paths, seam invariants, and focused validation commands in `plan.md` so Build never needs to re-scan the repository.
3. Confirm material architecture choices with the user before freezing.
4. Run the guard, then choose the implementation actor.

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard design
```

## Implementation Decision Point

After the design guard passes and before `transition build`, pause and present the implementation-actor choice to the user. Do not transition without an explicit choice. The Runtime enforces this gate: `transition build` fails with `EXECUTOR_CONFIRMATION_REQUIRED` unless it carries the recorded choice, which is stored as `implementation_actor` in the change state.

### Option A: Continue with the current agent / model (default)

Run transition and enter `$matrix-build`:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --executor current
```

Then enter `$matrix-build` to implement directly in this session.

### Option B: Delegate Build slices to a lightweight subagent

When the host supports write subagents on a fast/cost-effective model (for example `flash`, `haiku`, or `sonnet`), approve the Contract with `--executor subagent`:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --executor subagent
```

Delegate bounded slice edits, unit tests, and drafting `## Build evidence` in `artifacts/verification.md` to the subagent pointed directly at `artifacts/design.md` and `artifacts/plan.md`. The lead agent retains exclusive ownership of `guard build`, `transition verify`, and `$matrix-verify`.

### Option C: Switch the model, keep this agent

The user switches the model in their own client (for example, a stronger model for design, an efficient one for implementation), returns to this session, and confirms. Then run the transition with `--executor model`. Matrix cannot see the client-side model; it provides the mandatory pause point only.

### Option D: Hand off to another agent in this workspace

Approve the frozen Contract by transitioning to Build with the chosen agent recorded (`--executor handoff:<agent-id>`). The implementation agent opens this repository, runs `$matrix`, and implements directly from the pinned coordinates in `artifacts/design.md` and `artifacts/plan.md` without re-scanning the codebase. After it records `## Build evidence` in `artifacts/verification.md`, run the Build guard and enter `$matrix-verify`:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
```

Record the chosen option in `design.md` under `## Decisions` so it freezes with the Contract.
