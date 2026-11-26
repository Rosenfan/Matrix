# Domain verification

Choose evidence that fits the task; do not force one domain's proof onto another. The Runtime decides a Run's outcome only from the frozen `acceptance[]` items and `required_checks[]`, and a declared reviewer is never a proof of trust. This file defines what honest evidence looks like for each kind of task. Run commands as `node <matrix-skill-directory>/scripts/matrix-runtime.mjs <args>`.

## Evidence by task type

| Task type | What Runtime executes | What the Agent must attach |
|---|---|---|
| Code change | Every frozen `--check` command, at `run submit` | A `failed` reason naming the check id and the failing behavior |
| Research, architecture review, security assessment, product analysis | Nothing (`--no-checks-reason`) | Traceability: each conclusion bound to a file path with line number, a command and its output, or a named external source |
| Operations (configuration, migration, deployment, data repair) | A read-only probe of the resulting state | Before/after state, the exact commands run, and what was deliberately left untouched |

A Run that mixes types declares the checks of its executable part and supplies traceability for the rest.

## Code changes

- Declare the checks in `run frame --check "C1=<command>"`. `run submit` runs all of them itself, without holding the lock, streaming output to `.matrix/runs/<run-id>/logs/` with a default timeout of 120 seconds. The recorded exit status is the only accepted result; never mark a check passed yourself. Runtime refuses a check command that carries a literal credential.
- `run check --cmd "<command>"` is for exploration. It never satisfies an acceptance item.
- Prefer commands whose exit code is the verdict: the repository's test command, a lint or type check, a build, a focused script. One command may back several acceptance items.
- After a passing submit, state the mapping in the verify summary: "A1 passed — C1 `node --test` exit 0".
- Leave the implementation untouched between a passing submit and `run close`: Runtime compares the working tree with the submitted state at `run verify` and with the verified state at `run close`, and sends the Run back to `execute` on a difference.

## Research and analysis deliverables

- Every claim carries its source: `src/workflow.js:1103`, the command and the lines it printed, or an external document with its URL and the date consulted. A claim without a source is a hypothesis; label it as one.
- Prefer primary sources: code and tests over design documents, a recorded run over a recollection, the standard or vendor document over a second-hand summary.
- Keep three categories apart in the deliverable: verified, inferred, not checked. "Not verified" is a legitimate finding, and `blocked` is its matching verify result.
- Capture the facts you rely on with `run check` (a `git log`, a grep count, a script's output) so they stay on record.

## Operations

- Prove the resulting state with a command a reviewer can re-run: `curl -fsS <health-url>`, a count query, a dry run of the tool. A zero exit code from the mutating command is not the proof.
- Record the state before and after, exactly what changed, and what was deliberately left alone.
- Freeze only read-only probes as checks. A command that mutates is the work, never a `--check`.

## Two-axis review

Run both axes for every Run that produces a diff or a document, and keep them apart (see `engineering-craft.md`).

1. Standards — conformance to this repository's documented conventions, plus the labelled code-smell baseline when nothing is documented. Sources: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, lint configuration, ADRs.
2. Spec — fidelity to the frozen `goal`, `scope`, and `acceptance[]`: missing or partial items, work nobody asked for, items that look done but are wrong. Cite the acceptance id for each finding.
3. Write one finding per line in the file passed as `--findings-file <path>`, each prefixed with its axis — `Standards:` or `Spec:` — and give each axis its own count and worst finding in `--summary`. Never merge or re-rank across the two.
4. Record risks the acceptance items do not cover — security, compatibility, data loss — as findings even when every item passes.
5. Make no edit between the review and `run verify`. A review of earlier bytes is not evidence for later ones.

## Reviewer declarations

`run verify --reviewer <self|subagent|external>` records who produced the verdict. All three are declarations, not proofs of trust: the Runtime cannot see the reviewer's context, so it stores the label and prints it in `verification.md` for the user to weigh. Declare what actually happened.

| Value | Meaning | Use when |
|---|---|---|
| `self` | The same Agent session that did the work also reviewed it | The default in a single-session Run; state it plainly |
| `subagent` | A separate sub-agent of this host, with its own context, did the review | The host provides sub-agents and one actually reviewed the diff or deliverable |
| `external` | A party outside this session reviewed it: the user, another tool, CI, a reviewer in another client | The result exists and can be quoted, and you say where it came from |

- Never declare `subagent` or `external` when no such reviewer ran. An overstated label is worse than `self`.
- A sub-agent shares the host and usually the instructions: it brings a fresh context, not independence. `external` is only as strong as its source; a second model in the same session is still `self`.
- No value means "independent" or "trusted". The user decides how much weight to give; the Agent's duty is to make that judgment possible.
- A malformed result is not a verdict: Runtime counts it as a verifier attempt (three lead to `await-user`) and ignores it for stagnation.

## When to write `--no-checks-reason`

- Write it only when no command can truthfully decide the outcome: a research report, an architecture assessment, a product analysis. Give the reason in one sentence and name the evidence attached instead.
- Never use it to skip a failing, slow, or inconvenient test.
- A Run that changes code needs at least one executable check: the test or build the repository already defines, or a focused command written for the change. "Documentation only" is not a reason when the repository has a docs build or lint.
- Declaring `no_checks_reason` while code outside `.matrix/` has changed makes `run submit` return `CODE_CHANGED_WITHOUT_CHECKS`. Treat it as a request for a real check. Adding one takes a new `run frame`, which needs user confirmation once `execute` has started.
- A check that fails is a failed round to fix, not a check to drop. Removing or weakening a frozen check changes the acceptance and needs the user.

## Before `run verify`

- Every acceptance id has exactly one result; every `failed` or `blocked` result carries a reason, passed through `--result-file <path>` when it contains `:` or `=`.
- Every `passed` item points to a check the Runtime executed or to a source a reader can open.
- Every `failed` item names the cause well enough to fix it without re-investigating.
- The reviewer value matches what happened, and the findings file holds both axes.
