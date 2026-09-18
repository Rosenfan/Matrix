---
name: matrix-archive
description: Close and archive a verified Matrix change. Use when the active Matrix phase is archive.
---

# Matrix Archive

This is the final Matrix phase. Read the proposal, plan, and verification evidence; summarize changed behavior, verification, residual risks, and follow-up work. Ask for explicit confirmation before committing or archiving.

Write archive summaries and handoff prose in `artifact_language`; keep Runtime-required English heading tokens unchanged.

Archive is Matrix-owned in both Prim and Arch. Do not invoke companion implementation, review, or architecture capabilities here.

## Mandatory two-step Archive

Run the read-only preflight and review its bounded effect summary. Then submit exactly the hash returned by that preflight:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --dry-run
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --expect-preflight <sha256-returned-by-dry-run>
```

Bare Archive is rejected. Runtime reacquires the project Archive boundary and recomputes the entire protected change-directory manifest before committing.
For hotfix/tweak, ask for explicit confirmation after reviewing the preflight, then use the returned command with `--confirmed`. Runtime rejects a shortcut Archive without it.

- `ARCHIVE_PREFLIGHT_CHANGED`: run dry-run again and review the new summary.
- `ARCHIVE_BUSY`: retry later. Do not remove or take over the lock; stale-lock recovery belongs to the later doctor/repair change.
- Guard or Contract failure: use the returned recovery command and do not submit.

If acceptance criteria or design must change while awaiting confirmation, use the sole Archive recovery path:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap
```

After successful commit, the change is under `.matrix/archive/` and the workflow is complete.
