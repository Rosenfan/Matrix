# Classic workflow compatibility

`classic` is the pre-0.2.0 Matrix workflow, unchanged: the `matrix/change/v2` state machine with five phases, two orchestration modes, guard conditions, Return and Abort recovery, and a two-step archive. Follow this file when `inspect` returns `default_workflow: classic`, or when the user asks to continue a classic change inside an `auto` project. The phase Skills remain the authority for each phase's commands and evidence; commands run as `node <matrix-skill-directory>/scripts/matrix-runtime.mjs <args>`.

## When classic applies

- A project initialized before 0.2.0 that has not opted into `auto`.
- A project whose `config.yaml` has no `default_workflow`; it resolves as `classic` (`config.yaml` first, then `workflow` in `installation.json`, then `classic`).
- Work that must run under `Arch`, the Matt Skills cohort frozen at v1.3.1.
- Any change already in flight under `.matrix/changes/`.

`matrix update` never changes the workflow. To come back to classic after switching, run `matrix init --default-workflow classic`; to leave classic, run `matrix init --default-workflow auto`.

## Workflow profiles

| Workflow | Phases | Use for |
|---|---|---|
| `full` | `open → design → build → verify → archive` | Features and changes that touch architecture, a public API, or schema |
| `hotfix` | `open → build → verify → archive` (shared `lightweight` profile) | A reproducible small bug with no architecture, API, schema, or multi-module impact |
| `tweak` | `open → build → verify → archive` (shared `lightweight` profile) | A bounded small change with no schema, public API, architecture, or cross-module impact |

When no change is active, classify the request and initialize it with a short kebab-case id and an accurate title. Start with `full` unless a shortcut clearly applies:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs init <change-id> --workflow <full|hotfix|tweak> --title "<title>"
```

Runtime resolves `orchestration` from the project default (`arch` when the verified Matt cohort is installed, otherwise the built-in `prim` baseline; pass `--orchestration <prim|arch>` only when explicitly overriding). The resolved mode is frozen for the change and cannot be switched later. When a change is active, report its phase and frozen `orchestration`, then enter the returned `next_skill` only when Runtime permits continuation.

## Baseline (`prim`) and Arch

- **Prim (`prim` baseline)**: the always-available built-in orchestration value used when Matt Skills are not installed; every phase uses Matrix's own capability.
- **Arch (`arch`)**: Matrix conditionally invokes, only when task facts trigger them, the ten reviewed automatic capabilities of the cohort frozen by the change. Arch is bound to Matt Skills v1.3.1 (commit `24fe0ef`): Matrix reviews all 27 official roles and installs the 25 compatible Skills project-locally, each verified against the Matt installation receipt.
- `implement` and `implement-spec` are incompatible. Matrix neither installs nor calls them; keep pre-existing copies (including any legacy `resolving-merge-conflicts`) as unmanaged extras and never suggest them inside an active change.
- A correctly installed Arch capability that fails gets at most one Matrix-owned fallback for the same capability, with the failure and evidence recorded. A missing, modified, or incomplete Arch installation must be repaired with `matrix init --with-mattpocock`; never switch an active change to Prim to get past it.
- Under Arch, `matrix-verify` binds the review to the current revision: `review --source code-review --fixed-point <ref> --standards <passed|failed> --spec <passed|failed>`. Never label a fallback as a successful `code-review` run.
- The remaining Matt Skills are never nested. `ask-matt`, `grill-with-docs`, `triage`, `to-spec`, `to-tickets`, `grill-me`, `teach`, `wait-what`, and `pr` remain `standalone`; `setup-matt-pocock-skills`, `improve-codebase-architecture`, `wayfinder`, `handoff`, `retro`, and `to-questionnaire` are explicit handoffs. Explain why one fits and let the user invoke it.

## How the Skills work together

| Skill | Role |
|---|---|
| `matrix` | Entry point: `inspect`, classify, `init`, route to the active phase |
| `matrix-open` | Clarify the request into `proposal.md`; for `hotfix` and `tweak`, produce the compact Contract before any implementation edit |
| `matrix-design` | `full` only: write `design.md` and `plan.md`, freeze the Contract |
| `matrix-build` | Implement the approved Contract in bounded vertical slices and record build evidence |
| `matrix-verify` | Run the Contract's validation commands and produce the Standards and Spec review evidence |
| `matrix-archive` | Two-step archive of the verified change |
| `matrix-hotfix`, `matrix-tweak` | Guidance for the `lightweight` profile; no separate state machine, started through `matrix` |
| `matrix-status` | Read-only report of phase, guard result, and recovery command |

Companion Skills never write Matrix state, transition, commit, archive, or create competing workflow artifacts.

## Forward transitions and the executor gate

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard open
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition design
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard design
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --executor <current|model|subagent|handoff:<agent-id>>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --confirmed --executor <choice>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard verify
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition archive
```

- A phase advances only through `transition`, and only after its `guard` passes.
- The `--executor` gate stays in classic. Before Build, present the implementation-actor choice: continue with the current agent, delegate slices to a lightweight subagent, switch the model in the user's client, or hand off to another agent reading `.matrix/`. `full` takes the choice after the design guard (`transition build --executor ...`); `lightweight` merges it into the `transition build --confirmed` pause. Runtime rejects Build entry without it (`EXECUTOR_CONFIRMATION_REQUIRED`) and stores the choice as `implementation_actor`.
- Archive is a mandatory two-step optimistic commit; bare archive is rejected:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --dry-run
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --expect-preflight <sha256-returned-by-dry-run>
```

For `hotfix` and `tweak`, ask for explicit confirmation after reviewing the preflight, then add `--confirmed` to the second command.

## Return and Abort

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return build --reason verification-failed
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs abort --reason <requirement-cancelled|superseded|no-longer-valuable|blocked|other>
```

- `design-gap` (from Build): implementation exposed a scope or design change. Runtime upgrades a `lightweight` change to `full`. Never continue the old contract silently.
- `verification-failed` (from Verify): the implementation is wrong; go back to Build.
- `acceptance-or-design-gap` (from Verify, or from Archive before the terminal commit): the acceptance criteria or the design must change.
- Return keeps the change and rotates the current `verification.md` (and, under Arch, `review-receipt.json`) into revisioned evidence history; the phase returned to must produce fresh evidence. Never copy stale conclusions back.
- Abort keeps the last phase, moves the change to `.matrix/archive/`, and never undoes worktree changes.

## Recovery

When a mutation reports `WORKFLOW_RECOVERY_REQUIRED`, stop phase work and run the read-only diagnosis:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor
```

Use only the exact repair command doctor returns, binding the identity it reports:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --transaction <id> --strategy <continue|rollback>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --lock <id>
```

Never edit or delete `.matrix/transactions/` or `.matrix/workflow.lock`, and never infer a repair target or strategy yourself.

## Keep classic and auto apart

- A classic change uses `init`, `guard`, `transition`, `review`, `archive`, `return`, and `abort`. A Run uses only `run *`. Do not call the classic `init` for Run work, and do not open a Run to carry a classic change.
- Both share one write-ahead-log gate: an unfinished transaction of either blocks mutations of the other. `doctor` reports it.
- A normal new request does not resume an unrelated classic change.
- Classic hashes and compatibility are governed by ADR-0003 and ADR-0004; `auto` is decoupled from Matt Skills by ADR-0005.
