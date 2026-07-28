---
name: matrix-verify
description: Verify the active Matrix change against its plan and review its diff. Use when the active Matrix phase is verify.
---

# Matrix Verify

Run the plan's acceptance commands and record their output summaries under `## Test evidence` in `artifacts/verification.md`.

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

Run `matrix workflow inspect` and read the frozen mode.

- **Prim**: Matrix performs the Standards and Spec review itself.
- **Arch**: invoke `code-review` to produce both review axes; announce the invocation and reason.

Review findings are inputs to Matrix Verify; a companion cannot decide the phase outcome, broaden approved architecture, transition, or archive. Do not invoke post-review architecture wrappers. A correctly installed review capability gets at most one same-capability Matrix fallback; installation-integrity failure stops verification.

## Failure Handling

If verification or review fails:
- If the issue is in the implementation, run `matrix workflow return build --reason verification-failed`, then enter `$matrix-build` or ask Claude Code to fix.
- If the issue is in the acceptance criteria or design, run `matrix workflow return design --reason acceptance-or-design-gap`, then enter `$matrix-design`.

Both Return paths rotate the current `verification.md` into revisioned evidence history. Do not copy stale conclusions back into the new current evidence.

If documents or public behavior changed, record the required synchronization work before the guard.

## Process

1. Check that `artifacts/verification.md` exists with `## Build evidence`
2. Run the plan's acceptance commands (from `plan.md` `## Validation` section)
3. Record test output under `## Test evidence`
4. Produce both Standards and Spec review axes through the selected orchestration mode
6. Record findings under `## Review evidence`
7. Run the guard
8. If it passes, transition to archive and enter `$matrix-archive`

```powershell
matrix workflow guard verify
matrix workflow transition archive
```

## Evidence Requirements

The guard checks for:

1. **Test evidence** — Output from running the plan's validation commands
2. **Review evidence** — Findings from the two-axis code review

Both must be present and substantive (>40 chars each) to pass the guard.
