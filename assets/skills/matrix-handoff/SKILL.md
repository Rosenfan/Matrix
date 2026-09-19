---
name: matrix-handoff
description: Export an approved Matrix Contract as a bounded task package for any implementation agent (Claude Code, opencode, or another agent), without changing Matrix workflow state.
---

# Matrix Handoff (Implementation Handoff)

This is an optional Matrix sidecar, not a Matrix phase. It must not call `transition`, `archive`, or write `matrix.yaml` or `events.jsonl`. It supports only a matching full or legacy-full three-artifact Contract; new lightweight hotfix/tweak changes are intentionally unsupported.

Human-readable handoff text uses `artifact_language` from inspect; stable machine-readable headings and metadata keys remain unchanged.

## When to Use

Use `$matrix-handoff` when:

- The active change is in Build and the Design -> Build transition has approved the contract
- You want a different agent than the designing one to implement the frozen plan — for example Codex designs and Claude Code implements, or zcode designs and opencode implements
- You need a bounded task package with all implementation details

## Preconditions

The exporter performs this read-only check before writing anything:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
```

If `matrix` is genuinely absent from PATH, use the bundled runtime from the installed root Matrix Skill. Do not fall back when the primary command starts and returns an error.

If the build guard reports `CONTRACT_CHANGED` or `CONTRACT_UNAPPROVED`, return to `$matrix-design` and approve a new contract through Build. The exporter reads the approved bytes of `proposal.md`, `design.md`, and `plan.md`; it does not invent missing facts.

## Export

The user chooses the implementation agent explicitly. Pass it with `--agent <agent-id>` (kebab-case); optionally name the designing agent with `--from <agent-id>`.

```powershell
# Generic agent handoff: writes artifacts/handoff-task-<ID>.md
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --agent opencode
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --agent claude-code --from codex

# Legacy compatibility form (Claude Code): writes artifacts/claude-task.md
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --target generic

# FnSec: exports its formal task package. Add --apply-fnsec-board only when
# active.md is NO_ACTIVE_OBJECTIVE; an existing task is never overwritten.
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --target fnsec --apply-fnsec-board
```

`--agent` and `--target` are mutually exclusive. Prefer `--agent` for new handoffs; `--target generic` remains for compatibility.

## Task Package Contents

The exported package (`artifacts/handoff-task-<task-id>.md`) metadata records `Implementation actor` (the `--agent` value) and `Decision owner` (the `--from` value, or "Matrix change owner"), plus the approved contract hash and revision and the same frozen snapshot of proposal, design, and plan. Objective, allowed work, prohibited work, and stop conditions travel unchanged — they are agent-independent.

## After the Implementation Agent Completes

Verify that the following evidence is present before proceeding to `$matrix-verify`:

- [ ] `artifacts/verification.md` exists with a `## Build evidence` section
- [ ] Build evidence includes concrete commands and outcomes
- [ ] All tests in the plan's validation section have been run
- [ ] Any `NEEDS_DECISION` items have been resolved or documented

If evidence is missing, ask the implementation agent to complete it before proceeding.

## Resuming Matrix Workflow

After the implementation agent completes and evidence is present:

1. Run build guard to verify evidence:
   ```powershell
   node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
   ```

2. If guard passes, transition to verify:
   ```powershell
   node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
   ```

3. Enter `$matrix-verify` to continue the verification flow

If the build guard fails, return to the implementation agent to complete missing evidence.

## Important Notes

- This sidecar does NOT change Matrix phase, workflow, or guard result
- The Matrix state remains in `build` phase; export itself does not advance it
- The implementation agent must produce evidence that satisfies the build guard conditions
- After successful transition to verify, the normal verify flow continues
