# Matrix Workflow

A structured development workflow for Claude Code that enforces evidence-based phase transitions through proposal, design, build, verify, and archive stages.

## What is Matrix?

Matrix is a Claude Code skill set that manages software development as a deterministic state machine. Every change goes through five phases, each with explicit guard conditions that must pass before advancing:

```
open → design → build → verify → archive
```

No phase can be skipped. No transition happens without evidence. This prevents "looks done to me" and forces rigorous completion tracking.

## Installation

### Prerequisites

- [Claude Code](https://docs.anthropic.com/claude-code) installed and configured
- Python 3.8+ available in your PATH

### Install the Skills

Copy the `.claude/skills/matrix*` directories into your project's `.claude/skills/` directory:

```bash
# From your project root
cp -r /path/to/matrix-workflow/.claude/skills/matrix* .claude/skills/
```

This will install:
- `matrix/` — Main entry point and state management scripts
- `matrix-open/` — Open phase: clarify requirements into a proposal
- `matrix-design/` — Design phase: freeze architecture and plan
- `matrix-build/` — Build phase: implement with test-first slices
- `matrix-verify/` — Verify phase: run tests and review
- `matrix-archive/` — Archive phase: close and archive the change
- `matrix-hotfix/` — Shortcut for small bug fixes
- `matrix-tweak/` — Shortcut for bounded small changes
- `matrix-status/` — Inspect current workflow state
- `matrix-claude/` — Optional: export design for Claude Code implementation

## Usage

### Start a New Change

In Claude Code, invoke the matrix skill:

```
$matrix
```

Or describe your request and let Claude route it:

```
I want to add user authentication to the API
```

Matrix will:
1. Classify your request (full workflow, hotfix, or tweak)
2. Initialize a change with a unique ID
3. Enter the `open` phase to clarify requirements

### Phase Workflow

Each phase has specific deliverables and guard conditions:

| Phase | Deliverables | Guard Condition |
|-------|--------------|-----------------|
| **open** | `proposal.md` with Goal, Scope, Acceptance, Risks | All sections present and substantive |
| **design** | `design.md` with Decisions, Test seams; `plan.md` with Steps | Documents exist with required sections |
| **build** | Implementation code, `verification.md` with Build evidence | Plan exists, build evidence recorded |
| **verify** | Test results, code review in `verification.md` | Test and review evidence present |
| **archive** | Final summary, git commit | Verify guard passed |

### Check Status

```
$matrix-status
```

Reports the current phase, guard result, and next step.

### Resume Interrupted Work

If context is lost or you return to a project later:

```
$matrix
```

Matrix reads the state file and resumes from the current phase.

## How It Works

Matrix stores state in `.codex/matrix/` within your project:

```
.codex/matrix/
├── active.json          # Current change ID
├── config.yaml          # Workflow configuration
├── changes/
│   └── <change-id>/
│       ├── matrix.yaml  # Phase, workflow, timestamps
│       ├── run-state.json
│       ├── events.jsonl
│       └── artifacts/
│           ├── proposal.md
│           ├── design.md
│           ├── plan.md
│           └── verification.md
└── archive/             # Completed changes
```

The `matrix_state.py` script enforces transitions:

```bash
# Check if current phase guard passes
python .claude/skills/matrix/scripts/matrix_state.py guard open

# Advance to next phase (only if guard passes)
python .claude/skills/matrix/scripts/matrix_state.py transition design
```

## Workflow Types

| Type | Use Case | Phases |
|------|----------|--------|
| **full** | New features, architecture changes | All 5 phases |
| **hotfix** | Reproducible small bugs | Simplified open → build → verify → archive |
| **tweak** | Bounded changes, no API/schema impact | Simplified open → build → verify → archive |

## Optional: Claude Code Handoff

The `matrix-claude` skill exports a frozen design as a Claude Code task package. Use when you want Codex to design and Claude Code to implement:

```
$matrix-claude
```

This creates a bounded task specification without changing Matrix state.

## Complementary Skills

The following skills from [Matt Pocock's skill collection](https://github.com/mattpocock/claude-code-skills) work well with Matrix:

- `grilling` — Stress-test plans through relentless Q&A
- `implement` — Execute implementation tasks
- `tdd` — Test-driven development loop
- `code-review` — Review code against baseline
- `diagnose` — Debug failures systematically
- `prototype` — Build UI prototypes

**These skills are NOT included** in this repository. Install them separately from [Matt Pocock's repository](https://github.com/mattpocock/claude-code-skills). Matrix will reference them when needed, but functions without them using built-in alternatives.

## Philosophy

Matrix enforces several engineering discipline principles:

1. **Evidence over assertion** — "Done" means guard conditions pass, not someone said so
2. **No silent scope creep** — Scope changes return to design phase
3. **Explicit transitions** — Every phase change is logged and deterministic
4. **Frozen plans** — Build implements what was designed, nothing more
5. **Context resilience** — State persists on disk, survives session interruptions

## License

MIT
