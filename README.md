# Matrix Workflow

An evidence-driven development workflow with Prim and Arch orchestration, inspired by [Comet](https://github.com/rpamis/comet). Matrix can work with its own capabilities or conditionally invoke a verified cohort of [Matt Pocock's agent skills](https://github.com/mattpocock/skills) without giving up lifecycle ownership.

English | **[中文](./README.zh-CN.md)**

<p align="center">
  <img src="./assets/matrix-workflow-poster-en.svg" alt="Matrix Workflow" width="100%">
</p>

---

## Table of Contents

- [Why Matrix?](#why-matrix)
- [What It Does](#what-it-does)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Workflow Phases](#workflow-phases)
- [How It Works](#how-it-works)
- [Workflow Types](#workflow-types)
- [Integration with Matt Pocock's Skills](#integration-with-matt-pococks-skills)
- [License](#license)

---

## Why Matrix

[Matt Pocock's skills](https://github.com/mattpocock/skills) provide focused capabilities such as `/grilling`, `/tdd`, and `/code-review`. Using independent tools without a lifecycle owner leads to common problems:

- **No process memory**: You grill, then implement, but there's no record of what was decided
- **Phase confusion**: Did we finish design? Are we in build? Hard to tell after context loss
- **Silent scope creep**: Requirements change mid-build without returning to design
- **Missing evidence**: "Looks done" without verification proof

Matrix solves this with one deterministic state machine, explicit phases, guard conditions, and artifact tracking — inspired by [Comet](https://github.com/rpamis/comet)'s phase-based approach. Skills can assist a phase, but Matrix always owns the lifecycle.

---

## What It Does

Matrix provides two capability-orchestration modes over the same workflow:

```
open → design → build → verify → archive

Prim: Matrix performs phase work itself
Arch: Matrix invokes verified atomic Skills only when task facts trigger them
```

Recovery paths are controlled Runtime intents:

```text
build  --design-gap--------------------> design
verify --verification-failed-----------> build
verify --acceptance-or-design-gap------> design
any active phase --abort--------------> aborted
```

Each phase:
- Has specific deliverables (artifacts)
- Has guard conditions that must pass
- Logs all transitions
- Survives context loss (state on disk)

---

## Prerequisites

- [Claude Code](https://docs.anthropic.com/claude-code) and/or Codex installed
- Node.js 18+ (for the installer)
- Python is optional during the compatibility window; new installations run the bundled Node workflow runtime.

---

## Installation

Install the Matrix CLI once:

```bash
npm install --global @rosenfan/matrix
```

Then initialize Matrix inside any project:

```bash
cd /path/to/your/project
matrix init
```

The interactive setup lets you:

- Choose English or Chinese, project or global scope, and Claude Code, Codex, or both
- Copy skills (recommended) or symlink them for local development
- Safely update an existing installation with an automatic backup
- Install Matt Pocock's companion skills in the same flow
- Choose **Prim** or **Arch** as the project default without disabling the other available mode

For automation and CI:

```bash
# Safe non-interactive installation for both verified platforms
matrix init --yes --platform claude-code --platform codex --with-mattpocock

# Explicitly select the project default
matrix init --yes --with-mattpocock --default-orchestration arch

# Preview exactly what would change (including backups) without writing
matrix init --platform codex --dry-run --json

# Inspect Matrix ownership, Matt Skills inheritance, and the selected platform
matrix doctor --platform codex
```

Until the npm package is published, install directly from GitHub:

```bash
npm install --global github:Rosenfan/Matrix
```

Matrix installs:
- `matrix/` — Entry point and state management
- `matrix-open/` — Open phase and canonical proposal
- `matrix-design/` — Design, plan, and Contract approval
- `matrix-build/` — Bounded implementation and build evidence
- `matrix-verify/` — Test and two-axis review evidence
- `matrix-archive/` — Archive phase
- `matrix-hotfix/` — Shortcut for small bugs
- `matrix-tweak/` — Shortcut for bounded changes
- `matrix-status/` — Check current state
- `matrix-claude/` — Optional: export for Claude Code

---

## Quick Start

In Claude Code:

```
$matrix I want to add user authentication
```

Matrix will:
1. Initialize a change with workflow type `full` and frozen orchestration `prim|arch`
2. Enter `open`; Prim works directly, while Arch invokes only proven requirement triggers
3. Create `proposal.md` with Goal, Scope, Non-goals, Acceptance, Risks
4. Guard check: are all sections substantive?
5. If pass → transition to `design`

---

## Workflow Phases

| Phase | Arch capabilities (triggered, not a fixed sequence) | Deliverables | Guard Condition |
|-------|------------------------------------------------------|--------------|-----------------|
| **open** | `/grilling`, `/domain-modeling` | `proposal.md`; optional repository-standard context/ADR evidence | Goal, Scope, Non-goals, Acceptance, Risks present |
| **design** | `/domain-modeling`, `/research`, `/wayfinder`, `/prototype`, `/codebase-design` | `design.md`, `plan.md` | Decisions, Test seams, Steps documented |
| **build** | `/tdd`, `/diagnosing-bugs`, `/resolving-merge-conflicts` | Code, `verification.md` | Exact approved Contract matches; build evidence recorded |
| **verify** | `/code-review` | Test & review evidence | Test and review evidence present |
| **archive** | None; Matrix-owned in both modes | Archive record | Verify guard passed |

---

## How It Works

State is stored in `.matrix/`:

```
.matrix/
├── active.json              # Current change ID
├── config.yaml
├── changes/
│   └── <change-id>/
│       ├── matrix.yaml      # Canonical workflow, orchestration, phase, status, revision
│       ├── events.jsonl
│       └── artifacts/
│           ├── proposal.md
│           ├── design.md
│           ├── plan.md
│           ├── verification.md
│           └── evidence-history/
└── archive/
```

The state machine enforces transitions:

```bash
# Check guard
matrix workflow guard open

# Advance (only if guard passes)
matrix workflow transition design

# Return from verification failure; stale evidence is retained in history
matrix workflow return build --reason verification-failed

# Abort without deleting artifacts or undoing worktree changes
matrix workflow abort --reason requirement-cancelled

# Final Archive is a mandatory two-step optimistic commit
matrix workflow archive --dry-run
matrix workflow archive --expect-preflight <sha256-returned-by-dry-run>

# Diagnose an interrupted Workflow without writing
matrix workflow doctor

# Repair only the exact transaction or stale lock reported by doctor
matrix workflow doctor --repair --transaction <id> --strategy <continue|rollback>
matrix workflow doctor --repair --lock <id>
```

`matrix.yaml` is the only canonical workflow/orchestration/phase/status/revision record, using `matrix/change/v2`. The resolved `prim|arch` value is frozen at initialization. Older schemas are rejected without mutation. The Design -> Build transition records a SHA-256 identity of the exact bytes of `proposal.md`, `design.md`, and `plan.md`; any byte change blocks Build, Verify, Archive, and Claude export until a controlled Return to Design and a new approval. Final Archive requires a read-only dry-run and a hash-bound commit; Runtime recomputes the protected change-directory manifest inside the Archive boundary and rejects drift. Every multi-file Workflow mutation is protected by a durable journal under `.matrix/transactions/`. `matrix workflow doctor` is read-only, and recovery requires the exact transaction/strategy or lock identity it reports. Terminal journals become bounded audit receipts; unresolved or conflicting journals are never automatically deleted.

---

## Workflow Types

| Type | When to Use | Phases |
|------|-------------|--------|
| **full** | New features, architecture changes | All 5 phases |
| **hotfix** | Reproducible small bugs | Simplified: open → build → verify → archive |
| **tweak** | Bounded changes, no API/schema impact | Simplified: open → build → verify → archive |

---

## Special Feature: matrix-claude

**Default usage**: Just use the main workflow (`$matrix`). Whether you're using Codex or Claude Code, the standard flow works for both:

```
$matrix → open → design → build → verify → archive
```

**When to use `$matrix-claude`**: Only when you want to **split the work across tools** — use Codex for design, then hand off to Claude Code for implementation.

| Scenario | What to Do |
|----------|------------|
| Use one tool for everything (default) | Just use `$matrix`, no extra steps |
| Codex designs + Codex implements | Standard flow: design → build → verify |
| Codex designs + Claude Code implements | design → `$matrix-claude` → Claude Code → verify |

### How matrix-claude Works

1. Design phase completes, guard passes
2. Run `$matrix-claude` → exports frozen design as `artifacts/claude-task.md`
3. Claude Code reads the task package and implements
4. Claude Code produces evidence in `artifacts/verification.md`
5. Return to Matrix: build guard → verify → archive

The sidecar does NOT change Matrix state. It's a pure export — like taking a snapshot of the design for another tool to consume.

---

## Integration with Matt Pocock's Skills

Prim uses Matrix's own capability. Arch uses one initialization-verified cohort of ten atomic capabilities:

| Phase | Capability | Trigger |
|---|---|---|
| open | `/grilling` | Material ambiguity or explicit stress-test request |
| open/design | `/domain-modeling` | Unclear vocabulary, invariants, or architectural decisions |
| design | `/research` | Required external facts are unavailable in the repository |
| design | `/wayfinder` | Module ownership or dependency seams are unknown |
| design | `/prototype` | A material design question needs disposable evidence |
| design | `/codebase-design` | A deep-module, interface, or test-seam decision remains |
| build | `/tdd` | Observable behavior changes at a testable seam |
| build | `/diagnosing-bugs` | An actual failure exists and root cause is unknown |
| build | `/resolving-merge-conflicts` | A merge or rebase conflict is in progress |
| verify | `/code-review` | Standards and Spec review evidence is required |

`grill-with-docs`, `implement`, and `improve-codebase-architecture` are not Matrix-managed or automatically invoked. Existing user-installed copies are preserved as unmanaged extras. A companion never transitions, commits, archives, or writes Matrix state.

---

**Key difference**: Matt Pocock's skills are individual tools. Matrix adds:
- **State persistence**: Survives context loss
- **Phase enforcement**: Can't skip design and jump to build
- **Evidence requirements**: Guards check for artifacts, not assertions
- **Transition logging**: Full audit trail of phase changes

---

## License

[MIT](./LICENSE)
