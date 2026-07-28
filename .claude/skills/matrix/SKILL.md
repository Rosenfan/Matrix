---
name: matrix
description: Route, initialize, resume, and govern a persistent Matrix development workflow. Use when the user starts a feature, change, bug fix, or asks to resume managed development.
---

# Matrix

Use Matrix as the development-workflow entrypoint. Its source of truth is the current repository's `.matrix/`; never infer a phase from chat history.

## Route

First run:

```powershell
matrix workflow inspect
```

If and only if the `matrix` executable is reported as absent, run the bundled fallback from this Skill directory instead:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
```

- If an active change exists, show its phase and frozen `orchestration`, report any Arch installation-integrity failure, and enter the returned `next_skill` only when the Runtime permits continuation.
- If no active change exists, classify the request: reproducible small bug → `$matrix-hotfix` with workflow `hotfix`; bounded small change with no public API/schema/architecture impact → `$matrix-tweak` with workflow `tweak`; otherwise full Matrix with workflow `full`.
- Do not create Matrix state for questions, read-only investigation, or requests outside software development.
- Before `init`, derive a short kebab-case change id and an accurate title. Start with `full` unless a shortcut clearly applies.

```powershell
matrix workflow init <change-id> --workflow <full|hotfix|tweak> --orchestration <prim|arch> --title "<title>"
```

An explicit mode wins; otherwise Runtime uses the project `default_orchestration`. The resolved value is immutable for the change and is shown in init, inspect, and the initialized Event. Then enter `$matrix-open`.

## Orchestration

- **Prim** uses Matrix's own capability in every phase and never requires Matt Skills.
- **Arch** conditionally invokes the initialization-verified ten-Skill cohort when documented task-fact triggers are present.

Both modes share the same Matrix phase graph, artifacts, guards, Return/Abort, Contract, transactions, and Archive protocol. Companion Skills never write Matrix state, transition, commit, archive, or create competing workflow artifacts. Announce each Arch capability and trigger before invoking it; do not ask for redundant per-Skill permission.

A correctly installed Arch capability that fails gets at most one Matrix-owned fallback for the same bounded capability, with failure and evidence recorded. A missing, modified, or incomplete Arch installation must be repaired with `matrix init --with-mattpocock`; never switch the active change to Prim.

## Recovery

Use Runtime commands instead of editing Matrix state:

```powershell
matrix workflow return design --reason design-gap
matrix workflow return build --reason verification-failed
matrix workflow return design --reason acceptance-or-design-gap
matrix workflow return design --reason acceptance-or-design-gap # from Archive, before terminal archive
matrix workflow abort --reason <requirement-cancelled|superseded|no-longer-valuable|blocked|other>
```

Return preserves the change but moves the current `verification.md` into revisioned evidence history, so the returned phase must produce fresh current evidence. Abort preserves the last phase and moves the terminal change into `.matrix/archive/`; it never undoes worktree changes.

If any mutation reports `WORKFLOW_RECOVERY_REQUIRED`, stop normal phase work and run the read-only diagnosis:

```powershell
matrix workflow doctor
```

Never infer a repair target or strategy. Use only the exact command returned by doctor:

```powershell
matrix workflow doctor --repair --transaction <id> --strategy <continue|rollback>
matrix workflow doctor --repair --lock <id>
```

## Optional Claude handoff

`$matrix-claude` is an optional sidecar command used after the approved Design -> Build transition. It exports the matching approved contract to a Claude Code task package. It never changes the Matrix phase, workflow, guard result, or runtime state.
Use it only when the user explicitly chooses Codex design with Claude Code implementation; never inject it into the standard path.

## Cross-Cutting Skills

### Handoff (`handoff`)
When context is running low and work needs to continue in a fresh session, use `handoff` at any stage boundary. It compacts the conversation into a handoff document with suggested skills for the next agent. Save to the OS temp directory, not the workspace.

## Rules

- A phase can advance only through `matrix workflow transition`; run its guard first.
- A phase can move backward only through one of the documented `matrix workflow return` intents.
- The Build transition approves the exact bytes of proposal, design, and plan. Any later byte change blocks Build, Verify, Archive, and Claude export until a controlled Return to Design and a new Build approval.
- A successful Archive is always a two-step optimistic commit: run `matrix workflow archive --dry-run`, then pass its exact hash to `matrix workflow archive --expect-preflight <sha256>`. Never bypass the preflight.
- `matrix workflow doctor` is read-only. Every transaction or stale-lock repair must explicitly bind the identity reported by doctor; do not edit or delete `.matrix/transactions/` or `.matrix/workflow.lock`.
- Do not replace required evidence with an assertion that work is complete.
- Pause for user confirmation at material architecture/scope decisions and before archive/commit.
- On scope expansion, run `matrix workflow return design --reason design-gap` and enter `$matrix-design`; never silently continue the old plan.
