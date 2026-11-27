---
name: matrix
description: Start or resume an autonomous Matrix run for a user goal, or drive the classic five-phase software workflow. Use when the user explicitly invokes $matrix, asks to start/resume/check Matrix work, or continues a run or change that already exists in .matrix/. Do not invoke for casual questions, read-only investigation, or one-line typo fixes (answer directly without creating a run).
---

# Matrix

Matrix is the single workflow entrypoint. Its source of truth is the current repository's `.matrix/`; never infer a phase or run state from chat history.

Write user-facing prose in `artifact_language` when a classic change reports it; run artifacts follow the repository's working language otherwise. Machine commands, identifiers, and schema fields stay in English.

## First action

Run the Runtime bundled with this project Skill so the project compatibility authority wins over a global launcher:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
```

Route on the returned `default_workflow`:

- `auto` → follow the Autonomous Run protocol below.
- `classic` → follow [references/classic-compat.md](references/classic-compat.md) (the five-phase `full` / `hotfix` / `tweak` workflow, with optional Arch orchestration).
- `NO_ACTIVE_CHANGE` still carries both fields; route the same way.

## No-Run fast path

Do not create a run for: pure questions, read-only investigation, planning chat, or a single-line typo fix. Answer or fix directly. A run exists to preserve intent, evidence, and acceptance for real work.

## Autonomous Run protocol (`auto`)

Full protocol details: [references/uaap-protocol.md](references/uaap-protocol.md). Engineering craft: [references/engineering-craft.md](references/engineering-craft.md). Evidence standards per task type: [references/domain-verification.md](references/domain-verification.md).

### 1. Start and understand

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run start --request "<the user's request verbatim>" [--id <kebab-id>] [--title "<title>"]
```

`--request` must carry the user's words unchanged (use `--request-file <path>` for long text). Then investigate before asking: read the code, docs, logs, and Git history; form a root-cause diagnosis; decide the technical approach yourself. Only three boundaries justify interrupting the user: materially different readings of the goal, private facts you cannot look up, and irreversible/high-visibility actions. Decisions that only shape the implementation are yours — record them in the brief, not as questions.

### 2. Frame the boundary

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run frame --goal "<one sentence>" --accept "A1=<observable outcome>" [--accept "A2=..."] --check "C1=<command>" [--check "C2=..."] --expect-revision <n>
```

- `--check` commands must be real, executable verifications (tests, builds, linters, scripts). Matrix runs them itself at submit time; never pass a command you have not verified exists. `--no-checks-reason "<text>"` is only for tasks with genuinely no executable check.
- Acceptance items must be observable by someone other than you.
- Pass `--require-confirmation` (or `--wait "<question>"`) when the request is vague, exploratory, or the change is broad — the run pauses for a single confirmation of goal + acceptance + checks. With a clear, bounded request, call frame without those flags and echo the returned `frame` summary to the user as you proceed.
- Record a context-pinned `brief.md` (`--brief-file`) naming the exact target files/functions, seam invariants, and focused check commands you already located so resumed sessions or subagents never re-scan the whole repository.
- After execute has started, re-framing always requires user confirmation.

### 3. Execute and adapt

Work autonomously. You may use any installed skill, MCP tool, or your own judgment; no external skill may write Matrix state, skip `run submit` checks, or declare the run complete.
- **Minimal resume**: when resuming an active run in a new session or another agent, read `run inspect` + `.matrix/runs/<id>/brief.md` (and the latest failing `logs/` tail if any) and navigate directly to the pinned files instead of re-scanning the codebase.
- **Lightweight subagent slices**: for multi-slice coding when the host supports write subagents on a fast/cost-effective model (e.g. `flash`, `haiku`, `sonnet`), you may delegate bounded code edits and local unit test runs to a subagent pointed at `brief.md`. The lead agent retains exclusive ownership of `run frame`, `run pivot`, `run submit`, `run verify`, and `run close`, and steps in directly if a slice fails twice.
- If the approach changes but the goal and acceptance do not, record it instead of restarting:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run pivot --reason "<why>" [--scope "<new approach>"] --expect-revision <n>
```

A pivot invalidates this round's check results and verdicts. Exploratory diagnostics may be recorded with `run check --cmd "<command>"`, but they never count as acceptance.

### 4. Submit — the Runtime runs the checks

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run submit --summary "<what this candidate changes>" --expect-revision <n>
```

Matrix executes every frozen check outside the lock, streams logs to `.matrix/runs/<id>/logs/`, and judges by exit codes only. Failures return you to execute with the failing check output; repeated failures pause for the user. Never restate check results yourself — the Runtime's record is the only one that counts.

### 5. Verify honestly

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run verify --reviewer <self|subagent|external> --result "A1=<passed|failed|blocked>[:<reason>]" [--result "A2=..."] [--summary "<text>"] --expect-revision <n>
```

- Cover every acceptance ID exactly once; a missing or duplicate ID is rejected.
- `--reviewer` is a provenance declaration, not a badge: `self` (this session re-checked), `subagent` (a separate read-only agent execution), `external` (another agent/session the user runs). Claim only what actually happened.
- `failed` returns the run to execute (stagnation is tracked); `blocked` pauses for the user; all `passed` moves to close.

### 6. Close

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run close --expect-revision <n>
```

Matrix renders `verification.md` from the run state, archives the run to `.matrix/archive/runs/<id>/`, and clears the lease. If the worktree changed after verification, Matrix refuses and sends the run back to execute. On the way out, persist durable, verified engineering facts the way this repository already does (AGENTS.md / GLOSSARY.md / docs/adr/) — never task chatter.

### Multi-run and safety

Runs are leases: at most one run executes per working tree (`run list`, `run select <id>`, `run select --none`). Parallel implementation belongs in separate Git worktrees. A new request never silently resumes an unrelated run or classic change — show what is in flight and ask.

Never execute irreversible, high-visibility actions (force push, history rewrite, bulk deletion, publishing, payments, messages, purchases) without explicit user confirmation in the moment. Decisions that need a professional license (legal, medical, financial) are surfaced as information only — the user decides.

## Rules

- Every state change goes through the Runtime commands above; never edit `.matrix/runs/`, `current-run.json`, `workflow.lock`, or `transactions/` by hand. If a command reports `WORKFLOW_RECOVERY_REQUIRED`, stop and run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor`, then use only the exact repair command it returns.
- Carry `--expect-revision` from the previous command's output; on `REVISION_MISMATCH`, re-run inspect instead of retrying blind.
- Missing a niche capability? Tell the user `npx skills find <keyword>` exists; never install third-party skills unattended. `matrix skills audit <path-or-name>` scans a candidate for conflicts before mounting.
- Classic-mode instructions live in [references/classic-compat.md](references/classic-compat.md); never mix its phases into an auto run.
