---
name: matrix-open
description: Open or resume the Matrix open phase by clarifying a development request into an evidence-backed proposal. Use after $matrix initializes a change or when the active Matrix phase is open.
---

# Matrix Open

Run `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` and follow its `profile` and `evidence_policy`.

Use its `artifact_language` for all proposal prose. Keep the required English heading tokens exactly as specified for Runtime guards; only the text beneath them is localized.

- **full**: produce `proposal.md` with `## Goal`, `## Scope`, `## Non-goals`, `## Acceptance`, and `## Risks`, then continue to Design.
- **lightweight**: produce the complete compact Contract before editing project implementation. Include `## Goal`, `## Scope`, `## Non-goals`, `## Approach`, `## Acceptance`, `## Validation`, `## Risks`, and `## Upgrade conditions`.
- **hotfix evidence**: also include `## Expected behavior`, `## Actual behavior`, and `## Reproduction`.
- **tweak evidence**: also include `## Current behavior`, `## Preserved behavior`, and `## Diff boundary`.

## Prim

Use Matrix's own capability to run a structured clarification (goal, scope, non-goals, acceptance, risks, constraints) and write the proposal.

## Arch

Announce the capability and reason, then invoke `grilling` by default at the start of Open to clarify the request. Invoke `domain-modeling` only when domain vocabulary, invariants, or an architectural decision is unclear. Selecting Arch already authorizes triggered capabilities.

**Clarification exemption**: skip the clarification pass only when the user both (1) arrives with a clear execution plan and (2) explicitly states that no clarification is needed. Even then, write the exemption record into `clarification.md`.

## Clarification artifact (mandatory)

Before writing the proposal, produce `<change>/clarification.md` — on every path, clarification or exemption:

- Clarified: `## Questions` / `## Answers` / `## Resolved scope` (English heading tokens fixed; body in `artifact_language`).
- Exempted: `## Exemption record` (exemption reason + the user's plan highlights + how the proposal adopts it).

lightweight (hotfix/tweak) applies too, with a single round of core questions. The file is Open-phase evidence: it does not participate in Contract identity and the Runtime does not check for it; changes left in open by 0.1.5 or earlier proceed without backfilling it.

If progress is blocked by facts or decisions owned by another person, explain why `to-questionnaire` fits and ask the user to invoke it. Do not invoke the wrapper yourself.

Companion output is evidence for the Matrix proposal. It must not create another workflow, proposal, confirmation state, or phase transition. If a correctly installed capability fails, perform at most one Matrix-owned fallback for that same capability and record the failure and evidence. Installation-integrity failures require `matrix init --with-mattpocock` and are not eligible for fallback.

## Process

1. Resolve only ambiguities required by the active workflow.
2. Write the canonical proposal and synchronize material companion conclusions into it.
3. For full, ask for confirmation when scope or risk is material, then enter Design.
4. For lightweight, always present the compact Contract and wait for explicit confirmation before entering Build.

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard open
# full
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition design
# hotfix/tweak, only after explicit confirmation
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --confirmed
```
