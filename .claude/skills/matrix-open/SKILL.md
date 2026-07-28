---
name: matrix-open
description: Open or resume the Matrix open phase by clarifying a development request into an evidence-backed proposal. Use after $matrix initializes a change or when the active Matrix phase is open.
---

# Matrix Open

Run `matrix workflow inspect`, read the active change and its frozen `orchestration`, then produce `artifacts/proposal.md` containing exactly these substantive sections: `## Goal`, `## Scope`, `## Non-goals`, `## Acceptance`, and `## Risks`.

## Prim

Use Matrix's own capability to clarify the request and write the proposal.

## Arch

Invoke `grilling` only when material ambiguity remains or the user asks to stress-test the request. Invoke `domain-modeling` only when domain vocabulary, invariants, or an architectural decision is unclear. Announce the capability and reason before invoking it; selecting Arch already authorizes triggered capabilities.

Companion output is evidence for the Matrix proposal. It must not create another workflow, proposal, confirmation state, or phase transition. If a correctly installed capability fails, perform at most one Matrix-owned fallback for that same capability and record the failure and evidence. Installation-integrity failures require `matrix init --with-mattpocock` and are not eligible for fallback.

## Process

1. Resolve only ambiguities required by the active workflow.
2. Write the canonical proposal and synchronize material companion conclusions into it.
3. Ask the user to confirm when scope or risk is material.
4. Run the guard and transition, then enter `$matrix-design`.

```powershell
matrix workflow guard open
matrix workflow transition design
```
