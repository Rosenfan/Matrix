---
name: matrix-design
description: Design and freeze the active Matrix change before implementation. Use when the active Matrix phase is design or when build scope requires redesign.
---

# Matrix Design

Read the active proposal. Write `artifacts/design.md` with `## Decisions`, `## Boundaries`, `## Test seams`, and `## Risks`; write `artifacts/plan.md` with `## Steps`, `## Validation`, and `## Stop conditions`.

## Skills to Use (Recommended Order)

1. **`domain-modeling`** — First, establish or refine the domain vocabulary. Update `CONTEXT.md` with any new terms from the proposal. This ensures all subsequent design work uses consistent language.

2. **`research`** — If the design requires investigating external APIs, documentation, or specifications, spawn a background research agent. It will investigate primary sources and write findings to a Markdown file.

3. **`wayfinder`** — For complex codebases, use this to explore and understand existing module structure, seams, and dependencies before making design decisions.

4. **`prototype`** — When a design question needs empirical validation (e.g., "does this state model feel right?" or "what should this UI look like?"), build a throwaway prototype. Two modes:
   - **Logic prototype**: interactive terminal app to test state machines
   - **UI prototype**: multiple UI variations on a single route

5. **`codebase-design`** — Finally, define module boundaries, interfaces, and test seams. Use its "design-it-twice" pattern to explore alternative approaches before committing.

## Process

1. Start with `domain-modeling` to ground the vocabulary
2. Use `research` for external dependencies (runs in background)
3. Use `wayfinder` to explore complex existing code
4. Use `prototype` to validate key design questions
5. Use `codebase-design` to finalize module boundaries
6. Confirm material architecture choices with the user before freezing
7. Run the guard
8. If guard passes, ask the user to choose implementation method:

```powershell
python .matrix/scripts/matrix_state.py guard design
```

## Implementation Decision Point

After the design guard passes, the user chooses:

### Option A: Continue with Codex (default)

Run transition and enter `$matrix-build`:

```powershell
python .matrix/scripts/matrix_state.py transition build
```

Then enter `$matrix-build` to implement directly in this session.

### Option B: Use Claude Code for implementation

Run `$matrix-claude` to export the frozen design as a bounded task package. This:
- Does NOT change Matrix phase or state
- Creates `artifacts/claude-task.md` with all implementation details
- Includes acceptance criteria, test seams, and required commands

After Claude Code completes and returns results, run the transition and enter `$matrix-verify`:

```powershell
python .matrix/scripts/matrix_state.py transition build
python .matrix/scripts/matrix_state.py guard build
python .matrix/scripts/matrix_state.py transition verify
```

Then enter `$matrix-verify` to verify the implementation.
