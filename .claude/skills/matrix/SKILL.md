---
name: matrix
description: Route, initialize, resume, and govern a persistent Matrix development workflow. Use when the user starts a feature, change, bug fix, or asks to resume managed development.
---

# Matrix

Use Matrix as the development-workflow entrypoint. Its source of truth is the current repository's `.matrix/`; never infer a phase from chat history.

Read `artifact_language` from `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect`. Keep required Markdown heading tokens unchanged, but write every user-facing artifact body, explanation, and handoff in that language: English for `en`, Chinese for `zh-CN`.

## Route

For every workflow command, run the Runtime bundled with this project Skill so the project compatibility authority wins over a different global launcher:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
```

Use the global `matrix` command for `init`, `update`, and bootstrap only. A trusted 0.1.4 launcher auto-delegates only to an exact, hash-verified 0.1.4 project Runtime. A different or unidentified project release remains authoritative but must be invoked through the exact direct command returned by the launcher. Older launchers cannot provide this cross-release check and must not be used as the project workflow entrypoint.

- If an active change exists, show its phase and frozen `orchestration`, report any Arch installation-integrity failure, and enter the returned `next_skill` only when the Runtime permits continuation.
- If no active change exists, classify the request: reproducible small bug → `$matrix-hotfix` with workflow `hotfix`; bounded small change with no public API/schema/architecture impact → `$matrix-tweak` with workflow `tweak`; otherwise full Matrix with workflow `full`.
- Do not create Matrix state for questions, read-only investigation, or requests outside software development.
- Before `init`, derive a short kebab-case change id and an accurate title. Start with `full` unless a shortcut clearly applies.

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs init <change-id> --workflow <full|hotfix|tweak> --orchestration <prim|arch> --title "<title>"
```

An explicit mode wins; otherwise Runtime uses the project `default_orchestration`. The resolved value is immutable for the change and is shown in init, inspect, and the initialized Event. Then enter `$matrix-open`.

## Orchestration

- **Prim** uses Matrix's own capability in every phase and never requires Matt Skills.
- **Arch** conditionally invokes the ten reviewed automatic capabilities frozen by the active Change. Matrix 0.1.4 reviews all 25 official Matt Skills v1.2.3 roles and installs only the 23 compatible Skills project-locally; `implement` and raw `resolving-merge-conflicts` are excluded.

Both orchestration modes use the same selected workflow profile. `full` uses `open → design → build → verify → archive`; `hotfix` and `tweak` share one internal `lightweight` profile, `open → build → verify → archive`, with different evidence policies. Companion Skills never write Matrix state, transition, commit, archive, or create competing workflow artifacts.

A correctly installed Arch capability that fails gets at most one Matrix-owned fallback for the same bounded capability, with failure and evidence recorded. A missing, modified, or incomplete Arch installation must be repaired with `matrix init --with-mattpocock`; never switch the active change to Prim.

## Recovery

Use Runtime commands instead of editing Matrix state:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return build --reason verification-failed
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap # from Archive, before terminal archive
node <matrix-skill-directory>/scripts/matrix-runtime.mjs abort --reason <requirement-cancelled|superseded|no-longer-valuable|blocked|other>
```

Return preserves the change but moves the current `verification.md` into revisioned evidence history, so the returned phase must produce fresh current evidence. Abort preserves the last phase and moves the terminal change into `.matrix/archive/`; it never undoes worktree changes.

If any mutation reports `WORKFLOW_RECOVERY_REQUIRED`, stop normal phase work and run the read-only diagnosis:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor
```

Never infer a repair target or strategy. Use only the exact command returned by doctor:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --transaction <id> --strategy <continue|rollback>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --lock <id>
```

## Optional Claude handoff

`$matrix-claude` is an optional sidecar command used after the approved Design -> Build transition. It exports the matching approved contract to a Claude Code task package. It never changes the Matrix phase, workflow, guard result, or runtime state.
Use it only when the user explicitly chooses Codex design with Claude Code implementation; never inject it into the standard path.

## Cross-Cutting Skills

Matrix never nests user-invoked Matt Skills. When relevant, explain the reason and ask the user to invoke one explicitly: `setup-matt-pocock-skills` for one-time setup, `improve-codebase-architecture` for an out-of-band scan, `wayfinder` for generating a separate large-effort candidate, `handoff` at a context boundary, or `to-questionnaire` when another person owns blocking facts. `ask-matt`, `grill-with-docs`, `triage`, `to-spec`, `to-tickets`, `grill-me`, `teach`, and `wait-what` remain standalone. Matrix does not install or manage `implement` or raw `resolving-merge-conflicts`; preserve pre-existing copies as unmanaged extras and never suggest them inside an active Change.

## Rules

- A phase can advance only through `node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition`; run its guard first.
- A phase can move backward only through one of the documented `node <matrix-skill-directory>/scripts/matrix-runtime.mjs return` intents.
- Full Build approval binds proposal, design, and plan. Lightweight Build approval binds its compact proposal, requires `transition build --confirmed`, and rejects project implementation changes made after initialization but before approval.
- A successful Archive is always a two-step optimistic commit: run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --dry-run`, then pass its exact hash to `node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --expect-preflight <sha256>`. Never bypass the preflight.
- `node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor` is read-only. Every transaction or stale-lock repair must explicitly bind the identity reported by doctor; do not edit or delete `.matrix/transactions/` or `.matrix/workflow.lock`.
- Do not replace required evidence with an assertion that work is complete.
- Pause for user confirmation at material architecture/scope decisions and before archive/commit.
- On shortcut scope expansion, run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap`; Runtime upgrades the change to `full`. Never silently continue the old contract.
