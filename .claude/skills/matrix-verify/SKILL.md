---
name: matrix-verify
description: Verify the active Matrix change against its plan and review its diff. Use when the active Matrix phase is verify.
---

# Matrix Verify

Run the approved Contract's acceptance commands and record their output summaries under `## Test evidence` in `artifacts/verification.md`.

Write verification prose in `artifact_language` from inspect while preserving the required English evidence headings.

## Input Sources

This phase can receive implementation from two sources:

1. **Direct Codex implementation** — from `$matrix-build` phase
2. **Claude Code implementation** — from `$matrix-claude` sidecar

Regardless of source, the verification process is the same: check that implementation evidence meets the plan's requirements.

## Prerequisites

Before starting verification, ensure:

- [ ] `artifacts/verification.md` exists
- [ ] `## Build evidence` section is present and substantive
- [ ] All commands from the plan's `## Validation` section have been run
- [ ] Test results are recorded

If these are missing (e.g., Claude Code didn't produce complete evidence), return to `$matrix-build` or ask Claude Code to补充.

## Orchestration

Run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` and read the frozen mode.

- **Prim**: Matrix performs the Standards and Spec review itself.
- **Arch**: invoke `code-review` to produce both review axes; announce the invocation and reason.

Review findings are inputs to Matrix Verify; a companion cannot decide the phase outcome, broaden approved architecture, transition, or archive. Do not invoke post-review architecture wrappers. A correctly installed review capability gets at most one same-capability Matrix fallback; installation-integrity failure stops verification.

Under `## Review evidence`, preserve two substantive subsections named `### Standards` and `### Spec`. Arch must then ask the project Runtime to bind those results to the current revision:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs review --source code-review --fixed-point <ref> --standards <passed|failed> --spec <passed|failed>
```

If `code-review` cannot run because the Git baseline is unavailable, the committed HEAD diff is empty, staged/unstaged/untracked candidate files exist, or the capability actually fails, document that limitation and use the single bounded fallback for this revision:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs review --source matrix-fallback --reason <git-baseline-unavailable|empty-head-diff|uncommitted-worktree|capability-execution-failed> [--fixed-point <ref-for-empty-head-diff-or-uncommitted-worktree>] --standards <passed|failed> --spec <passed|failed>
```

Never label fallback output as a successful `code-review` run. `empty-head-diff` requires the fixed point so Runtime can verify the empty three-dot diff. `uncommitted-worktree` requires a fixed point and Runtime binds the staged, unstaged, and untracked candidate content into `candidate_hash`; any later change makes the receipt stale. If a receipt already exists or either axis failed, use a controlled Return before another attempt.

## Failure Handling

If verification or review fails:
- If the issue is in the implementation, run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs return build --reason verification-failed`, then enter `$matrix-build` or ask Claude Code to fix.
- If the issue is in the acceptance criteria or design, run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap`, then enter `$matrix-design`.

Both Return paths rotate the current `verification.md` and any `review-receipt.json` into revisioned evidence history. Do not copy stale conclusions or receipts back into the new current evidence.

If documents or public behavior changed, record the required synchronization work before the guard.

## Process

1. Check that `artifacts/verification.md` exists with `## Build evidence`
2. Run the approved validation commands (full plan or lightweight proposal)
3. Record test output under `## Test evidence`
4. Produce both Standards and Spec review axes through the selected orchestration mode
5. Record findings under `## Review evidence` with `### Standards` and `### Spec`
6. In Arch, record the Runtime review receipt for the current revision
7. Run the guard
8. If it passes, transition to archive and enter `$matrix-archive`

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard verify
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition archive
```

## Evidence Requirements

The guard checks for:

1. **Test evidence** — Output from running the plan's validation commands
2. **Review evidence** — Separate Standards and Spec findings from the selected review path
3. **Arch review receipt** — Runtime-bound identity for the current Contract, evidence, workspace, and normal or fallback source

Full requires Test and Review evidence. Hotfix additionally requires `## Regression evidence`; tweak additionally requires `## Scope review evidence`.
