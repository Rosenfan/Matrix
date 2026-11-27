# UAAP protocol (auto workflow)

UAAP (Universal Autonomous Agent Protocol) is the working model of the `auto` workflow: the user expresses intent; the Agent understands, explores, decides, executes, and verifies. Run every Runtime command as `node <matrix-skill-directory>/scripts/matrix-runtime.mjs <args>`. Evidence rules are in `domain-verification.md`, engineering judgment in `engineering-craft.md`. When `inspect` returns `default_workflow: classic`, follow `classic-compat.md` instead.

## Start of every request

1. Run `inspect`. It returns `default_workflow`, `autonomy_level`, and the in-flight Run or classic change; `NO_ACTIVE_CHANGE` means nothing is in flight.
2. Apply the No-Run fast path: a pure question, a read-only investigation, or a single-file trivial typo fix is answered or done directly, without a Run.
3. Anything else starts a Run, keeping the user's words unchanged:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run start --request "<text>"
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run start --request-file <path> --id <run-id> --title "<text>" --domain "<label>"
```

Use `--request-file` for long text. `--id` is optional; `--domain` is only a hint label.

## Rebuild an ambiguous intent

A vague request ("this feels wrong, look into it") asks for a result, not a menu of options. Investigate until you can name the real problem, which may differ from the reported one. Choose the direction, write the goal, the findings, and your decisions into the brief (`--brief-file`), then tell the user what you found and what you will do.

## Explore before asking

Check everything checkable before asking anything: the repository (code, tests, `AGENTS.md`, `CLAUDE.md`, `GLOSSARY.md`, `docs/adr/`), Matrix state and archives, logs and command output, and Git history (`git log`, `git status`).

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run check --cmd "<command>" --expect-revision <n>
```

`run check` keeps a diagnostic command on record. It supports your reasoning and never counts as an acceptance result.

## The only reasons to interrupt the user

1. Substantive ambiguity in the outcome: different readings lead to materially different goals, scopes, or acceptance items.
2. Missing external private information: a fact only the user holds (a credential, a deadline, a decision owned by someone else) that the environment cannot supply.
3. An irreversible or high-risk outward action: deleting data, rewriting Git history, paying, publishing, sending a message as the user.

One limit sits outside this list: decisions that require a professional license (legal, medical, investment) are never made for the user. Lay out the facts, options, and risks, then stop.

Everything else is the Agent's to decide — structure, libraries, naming, test strategy, order of work. Make the call, record the reason in the brief, and do not open a technical poll.

## Frame

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run frame --goal "<text>" --accept "A1=<text>" --accept "A2=<text>" --check "C1=<command>" --scope "<text>" --expect-revision <n>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run frame --goal "<text>" --accept "A1=<text>" --no-checks-reason "<text>" --require-confirmation --expect-revision <n>
```

- `run frame` freezes `goal`, `acceptance[]`, and `required_checks[]` (or `no_checks_reason`). It needs at least one `--accept` and either `--check` or `--no-checks-reason`, never both. Frame once, after understanding. `--goal` and the short flags go through argv; long text goes through `--brief-file`.
- Pin investigation coordinates in `brief.md` (`--brief-file`): list the exact files/seams to touch, upstream/downstream contract invariants, and focused check commands so a resumed session, another agent, or a subagent never pays to re-scan the repository.
- Clear, bounded request: frame without `--wait` or `--require-confirmation`. Runtime goes straight to `execute` and returns a summary; echo it to the user and continue.
- Vague, exploratory, or wide request: investigate first, then add `--require-confirmation`. The confirmation covers only goal, acceptance, and checks, never technical options.
- `--wait "<question>"` holds the Run in `await-user` when one of the boundaries above forces a question. A project with `autonomy_level: strict` always waits for confirmation.
- Once `execute` has started, a new `run frame` always needs user confirmation; changing the goal or the acceptance items is never an internal decision.

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run resolve --answer "<text>" --confirmed --extend-budget <n> --expect-revision <n>
```

`run resolve` ends `await-user`. `--confirmed` marks the user's approval of a pending confirmation. `--answer` carries the user's actual words when the Run waits for an answer (`--answer-file` for long text). The `continuation` of the waiting Run names the form to use.

## Execute, pivot, submit

- Use any installed Skill the task needs; none is mandatory. Work in the smallest slice that produces observable evidence.
- **Minimal resume & lightweight subagent slices**: when resuming an active Run across sessions or agents, read `run inspect` + `.matrix/runs/<run-id>/brief.md` (plus the latest failing `logs/` tail if applicable) and go straight to the pinned files. When the host supports write subagents with selectable lightweight models (such as `flash`, `haiku`, or `sonnet`) and the task spans multiple bounded slices, the lead agent may delegate slice edits and local test runs to a fresh subagent fed `brief.md` while keeping exclusive ownership of every `run *` state command (taking over directly if a slice stalls twice).
- A change of method is a pivot, allowed while the Run is in `execute` or `verify`. It keeps the goal and the acceptance items and voids this round's submission and review conclusions, so `run submit` must run again:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run pivot --reason "<text>" --expect-revision <n>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run submit --summary "<text>" --expect-revision <n>
```

- `run submit` is the only way a check passes: Runtime runs every frozen check command itself, without holding the lock, streams the output to `.matrix/runs/<run-id>/logs/`, and records the exit status (default timeout 120 seconds; `--timeout <ms>` overrides). Never report a check as passed yourself.
- All checks passed moves the Run to `verify`. A failed check keeps it in `execute`: fix the cause, then submit again.

## Acceptance items and checks that can be verified

- An acceptance item (`A<n>=`) names one observable outcome: the file, endpoint, command, or behavior, and what counts as true. "Works well", "is clean", "is handled" are not acceptance items.
- A check (`C<n>=<command>`) is a command whose exit code is the verdict: `0` passes, anything else fails. It needs no interactive input and writes paths relative to the project root. Prefer a command the repository already defines — its test, lint, type-check, or build command — or a focused script. Run it once before you freeze it, and map every item that can be executed to a check.
- Commands are OS-specific. On Windows they run through the Windows shell, so `NODE_ENV=test cmd` and `export VAR=...` fail; put the environment in a script the command calls.
- Never put a credential in a command: Runtime refuses a command that carries a literal credential (`--token`, `Bearer `, `user:pass@`, `KEY=`) instead of storing it. `state.json` never stores command output, but streamed logs keep whatever a command prints. Read secrets from the environment.
- `--no-checks-reason "<text>"` replaces `--check` only when no command can truthfully decide the outcome — a research report, an architecture assessment, a product analysis. Never use it to skip a failing or slow test. A Run that changes code needs at least one executable check; declaring `no_checks_reason` while code outside `.matrix/` has changed makes `run submit` warn `CODE_CHANGED_WITHOUT_CHECKS`.

## Verify

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run verify --reviewer <self|subagent|external> --result "A1=<passed|failed|blocked>[:<reason>]" --expect-revision <n>
```

- Cover every acceptance id exactly once; use `--result-file <path>` when a reason contains `:` or `=`. Put review findings in `--findings-file <path>`.
- `--reviewer` declares who actually reviewed; it is not a claim of trust. `self` is the honest default. Declare `subagent` or `external` only when a separate reviewer really produced the result (see `domain-verification.md`).
- All `passed` moves the Run to `close`. Any `failed` returns it to `execute`: fix the cause and submit again. Any `blocked` moves it to `await-user`.

## Budget and await-user

| Counter | Counted when | Default limit |
|---|---|---|
| `iteration` | a submit passes all checks | 5 |
| `submit_failures` | a submit has a failing check | 5 |
| stagnation | a verify reports `failed` for the same unresolved items | 2 consecutive rounds, or 5 rounds in total |
| `verifier_attempt` | a verify result is malformed or the verifier fails | 3 (not counted as stagnation) |

- When a Run enters `await-user`, stop. Do not retry, re-frame, or edit state. Tell the user the frozen goal and acceptance, what was tried with its evidence, and which counter tripped.
- Wait for the user's decision, then pass it with `run resolve`, adding `--extend-budget <n>` when the returned `continuation` asks for it. Continuing past a limit is the user's decision; never extend a budget on your own initiative.

## Close

- After verification passes, run `run close --expect-revision <n>`. Runtime archives the Run to `.matrix/archive/runs/<run-id>/` and writes `verification.md` from state. It refuses to close and returns the Run to `execute` (`CANDIDATE_CHANGED`) when HEAD, the tracked diff, or untracked files outside `.matrix/` differ from the verified state; `run verify` applies the same check to the submitted state. Make no implementation edit between a passing submit and close.
- Before closing, offer to record durable, verified facts where the repository already keeps them (`AGENTS.md`, `CLAUDE.md`, `GLOSSARY.md`, `docs/adr/`). Do not create a parallel memory store.
- `run close --abort --reason "<text>"` ends a Run that should not continue. The archive keeps the record; the working tree is left as it is.

## Lease, several tasks, parallel work

- One workspace holds one lease, recorded in `.matrix/current-run.json`. Every mutating `run` command must target the Run that holds the lease and carry `--expect-revision <n>` from the last `continuation`; otherwise Runtime returns `LEASE_NOT_HELD`.
- Every command output includes `continuation`, the exact next command. Follow it instead of composing commands from memory. On `REVISION_MISMATCH`, run `run inspect` and use the `continuation` it returns.
- To continue another Run, list and select it. `run select --none` releases the lease:

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run list
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run select <run-id>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run inspect <run-id>
```

- Leaving a Run in `execute` while changes outside `.matrix/` are uncommitted returns the warning `WORKTREE_DIRTY_ON_LEASE_SWITCH`: commit or stash them first.
- Never drive two Runs in one working tree. For parallel implementation give each task its own `git worktree`.
- A Run and a classic change share one write-ahead-log gate, so an unfinished transaction of either blocks mutations of the other. Clear it with `doctor` as described in `classic-compat.md`.

## Do not resume unrelated work

`inspect` and `run inspect` list in-flight Runs and classic changes as candidates with their state. Report what is in flight. A normal new request does not resume an unrelated Run or classic change. Continue one only when the user asks for it or the request is plainly about it: `run select <run-id>` for a Run, the phase Skill for a classic change.

## When a capability is missing

If no installed Skill covers what the task needs, say so and suggest `npx skills find <keyword>`. The user decides what to install: never install, upgrade, or remove a Skill unattended, and never run `find-skills` inside the main flow. `matrix skills audit <path-or-name>` reports the conflict risk of an external Skill through a read-only static scan; it executes none of the Skill's scripts.
