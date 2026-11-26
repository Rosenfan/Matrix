Distilled from Matt Pocock's skills (https://github.com/mattpocock/skills @ 24fe0ef, v1.3.1), MIT License, Copyright (c) 2026 Matt Pocock.

# Engineering craft

Five practices from Matt Pocock's skills, restated for `auto` Runs that change a codebase. They are judgment aids, not gates: none of them pauses a Run or requires a ceremony. The Agent decides when a practice applies and records the decision in the brief.

## 1. Deep modules and the seam as the test boundary

- A module is deep when a small interface hides a large amount of behavior. Depth is measured at the interface — how much a caller or a test can do per unit of interface it must learn — never as a ratio of implementation lines to interface lines.
- The interface is everything a caller must know: parameters and results, plus ordering rules, invariants, failure modes, and required configuration.
- A seam is the place where behavior can be swapped without editing that place; it is where an interface lives. Where the seam sits is a design decision of its own, separate from what hides behind it.
- Callers and tests cross the same seam. A test that reaches past the interface — private methods, internal collaborators, a side channel such as querying the database directly — means the module has the wrong shape. Tests that survive an internal refactor are the proof that the seam is right.
- Accept dependencies instead of constructing them, and return results instead of mutating shared state. Both shrink what a test must set up.
- A seam is real only when something varies across it: one adapter is a hypothetical seam, two (production and an in-memory double, for example) justify it. Do not expose an internal seam through the public interface just because tests use it.
- Deletion test: imagine removing the module. If the complexity vanishes, it was a pass-through; if it reappears in every caller, it was earning its keep.
- Classify a module's dependencies before deepening it: in-process (merge and test directly), locally substitutable (test with the stand-in), remote but owned (a port with real and in-memory adapters), truly external (a port with a mock in tests).
- When the interface shape itself is uncertain, sketch two or three deliberately different interfaces — fewest entry points, most flexible, easiest for the common caller — and compare them on depth, on where change concentrates, and on seam placement. The Agent picks one and records why.
- Replace, do not layer: once tests exist at the deepened interface, delete the unit tests that targeted the shallow modules it absorbed.

## 2. Vertical slices and tests that cannot prove themselves

- Work one vertical slice at a time: one failing test, the smallest implementation that makes it pass, repeat. Each cycle is a tracer bullet that shows what the next slice should be.
- Do not slice horizontally — all tests first, then all implementation. Bulk tests verify imagined behavior and fix the structure before the implementation is understood.
- Red before green. See the test fail for the expected reason before writing the code that satisfies it.
- A test that cannot disagree with the code proves nothing. Three ways to write one by accident:
  - Tautological expectation: the expected value is recomputed the way the implementation computes it. Take expected values from an independent source — a known literal, a worked example, the specification.
  - Implementation coupling: asserting call counts or call order on internal collaborators, or a test name that describes how instead of what.
  - Side-channel observation: checking the result somewhere other than through the interface.
- Name tests after observable behavior in the repository's domain language (`GLOSSARY.md`, ADRs): "user can checkout with valid cart", not "checkout calls payment service".
- Mock only at boundaries you do not control — third-party APIs, time, randomness, sometimes the file system or database. Never mock your own modules.
- Refactoring is not part of the red-green cycle. Surface it through review.

## 3. Review on two separate axes

- Standards asks whether the change follows this repository's documented way of writing code. Read the documents that state it (`CONTRIBUTING.md`, `AGENTS.md`, lint configuration). Where nothing is documented, fall back to a fixed baseline of code smells: mysterious name, duplicated code, feature envy, data clumps, primitive obsession, repeated switches, shotgun surgery, divergent change, speculative generality, message chains, middle man, refused bequest.
- Two rules bind the baseline: a documented repository standard always overrides it, and every smell is a labelled judgment call ("possible Feature Envy"), never a violation. Skip anything tooling already enforces.
- Spec asks whether the change does what was asked. In `auto` the spec is the frozen `goal`, `scope`, and `acceptance[]` of the Run. Report requirements that are missing or partial, behavior nobody asked for, and requirements that look implemented but are wrong. Quote the acceptance id for each finding.
- Keep the two reports apart. Code can pass one axis and fail the other; merged or re-ranked findings let the stronger axis mask the weaker one. Give each axis its own count and its own worst finding, and do not name an overall winner.
- Pin the range first (`git diff <fixed-point>...HEAD`) and confirm it is non-empty before reviewing anything.
- Each axis reads better with a fresh context. When the host provides sub-agents, run the axes in separate sub-agents and declare `--reviewer subagent` in `run verify`.

## 4. YAGNI: converge scope on what actually changes

- Restructuring pays off only where future changes land. Before scanning for design improvements, decide where to look: if the user named an area, take it; otherwise walk `git log --oneline` and let the paths that keep appearing — the hot spots — pull attention first. Widen the scan only when the history shows no clear hot spot.
- Read `GLOSSARY.md` and the ADRs covering that area first. Do not re-litigate a recorded decision unless the friction is real enough to justify reopening it, and say so explicitly when it is.
- The friction worth finding: understanding one concept means bouncing between many small modules; an interface nearly as complex as its implementation; pure functions extracted only for testability while the real bugs hide in how they are called; modules that leak across their seams; code that is untested or untestable through its current interface.
- Delete speculative generality: abstractions, parameters, and hooks added for needs the spec does not have.
- Rank the candidates and recommend one. Give a strong read with reasons instead of a menu; a hybrid is fine when elements combine well.
- State each benefit concretely: which interface shrinks, where change and bugs come to sit together, which tests can be deleted.

## 5. Investigate first, ask only at the decision frontier

- Treat the work as a tree of decisions: each one hangs on the decisions above it. The frontier is every decision whose prerequisites are already settled.
- Finding facts is the Agent's job. Anything that can be looked up — the file system, available tools, Git history, logs, configuration — is looked up, never asked of the user.
- A fact still under investigation is an unsettled prerequisite: only the questions downstream of it wait; the rest of the frontier moves on.
- Only decisions reach the user, and only the ones they must own (the interruption boundaries in `uaap-protocol.md`). Technical decisions are made and recorded by the Agent. A decision that does belong to the user is asked with a recommended answer attached.
- Exploration is complete when nothing is silently assumed: every branch has been settled by evidence, decided by the Agent, or put to the user.

## Using them in a Run

- Understand: investigate first (5); when the request is an architecture or refactoring task, converge on the hot spots (4) before framing.
- Frame: acceptance items describe observable behavior at the seams (1, 2); checks are the commands that exercise them.
- Execute: move in vertical slices (2); apply deep-module thinking wherever a new interface is created (1).
- Verify: review on both axes (3) and declare the reviewer honestly, as `domain-verification.md` requires.
