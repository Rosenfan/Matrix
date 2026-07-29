---
name: matrix-open
description: Open or resume the Matrix open phase by clarifying a development request into an evidence-backed proposal. Use after $matrix initializes a change or when the active Matrix phase is open.
---

# Matrix Open

Run `matrix workflow inspect` and follow its `profile` and `evidence_policy`.

Use its `artifact_language` for all proposal prose. Keep the required English heading tokens exactly as specified for Runtime guards; only the text beneath them is localized.

- **full**: produce `proposal.md` with `## Goal`, `## Scope`, `## Non-goals`, `## Acceptance`, and `## Risks`, then continue to Design.
- **lightweight**: produce the complete compact Contract before editing project implementation. Include `## Goal`, `## Scope`, `## Non-goals`, `## Approach`, `## Acceptance`, `## Validation`, `## Risks`, and `## Upgrade conditions`.
- **hotfix evidence**: also include `## Expected behavior`, `## Actual behavior`, and `## Reproduction`.
- **tweak evidence**: also include `## Current behavior`, `## Preserved behavior`, and `## Diff boundary`.

## Prim

Use Matrix's own capability to clarify the request and write the proposal.

## Arch

Invoke `grilling` only when material ambiguity remains or the user asks to stress-test the request. Invoke `domain-modeling` only when domain vocabulary, invariants, or an architectural decision is unclear. Announce the capability and reason before invoking it; selecting Arch already authorizes triggered capabilities.

Companion output is evidence for the Matrix proposal. It must not create another workflow, proposal, confirmation state, or phase transition. If a correctly installed capability fails, perform at most one Matrix-owned fallback for that same capability and record the failure and evidence. Installation-integrity failures require `matrix init --with-mattpocock` and are not eligible for fallback.

## Process

1. Resolve only ambiguities required by the active workflow.
2. Write the canonical proposal and synchronize material companion conclusions into it.
3. For full, ask for confirmation when scope or risk is material, then enter Design.
4. For lightweight, always present the compact Contract and wait for explicit confirmation before entering Build.

```powershell
matrix workflow guard open
# full
matrix workflow transition design
# hotfix/tweak, only after explicit confirmation
matrix workflow transition build --confirmed
```
