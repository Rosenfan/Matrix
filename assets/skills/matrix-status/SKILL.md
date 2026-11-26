---
name: matrix-status
description: Inspect the active Matrix run or classic change and report its disk-backed phase, budget, lease, and recovery command. Use when the user asks for Matrix status, the next step, or to resume interrupted Matrix work.
---

# Matrix Status

Run the same state kernel used by the main entry, then report what is on disk — never chat history.

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor
```

Report, in `default_workflow` terms:

- **auto**: the leased run (`run_id`, phase, status, revision), budget headroom (`iteration`/`submit_failures`/`stagnation`/`verifier_attempt` against their caps), pending waits, and the exact `continuation.next_command`. List other suspended runs from `runs` and note which holds the lease. For run details use `node <matrix-skill-directory>/scripts/matrix-runtime.mjs run inspect <run-id>`.
- **classic**: the change id, workflow, profile, phase, guard result, `next_skill`, and any Arch integrity findings (repair with `matrix init --with-mattpocock`; never reinterpret the change as Prim).
- **Neither** (`NO_ACTIVE_CHANGE`): say so plainly and route by the reported `default_workflow`.

Both commands are read-only. Do not infer status from conversation history, run `--repair`, or modify state. If a guard or check is failing, name the missing evidence and point to the entry skill (`$matrix` for auto runs, the phase skill for classic). If the doctor reports `WORKFLOW_RECOVERY_REQUIRED` or an unknown-host lock, surface its exact repair command and the manual-verification hint instead of improvising.
