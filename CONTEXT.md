# Matrix

This context defines the language used for distributing Matrix, integrating it with agent environments, and governing Matrix changes.

## Language

**Verified platform**:
An agent environment for which Matrix guarantees both successful installation and executable workflow behavior. The initial verified platforms are Claude Code and Codex.
_Avoid_: Supported tool, detected platform

**Detected platform**:
An agent environment whose project or user configuration is present on disk; detection alone does not imply Matrix compatibility.
_Avoid_: Installed platform, verified platform

**Primary runtime**:
The Matrix command-line runtime preferred when it is available on the user's PATH.
_Avoid_: Global runtime, installer

**Bundled runtime**:
The self-contained runtime distributed with an installed Matrix Skill and used only when the primary runtime is absent.
_Avoid_: Backup copy, second implementation

**Product language**:
The selected language for installer interaction, installed Skill guidance, workflow artifact prose, diagnostics, and summaries. Commands, schema fields, and machine identifiers remain language-neutral English.
_Avoid_: UI locale, translation setting

**Managed component**:
A user-visible component that Matrix init may inspect and change. The managed components are Matrix and Matt Pocock skills only.
_Avoid_: npm dependency, integration

**Managed asset**:
A file or directory whose installed version and content hash were recorded by Matrix and can therefore be updated safely when unchanged.
_Avoid_: Existing file, installed component

**User-modified asset**:
A managed asset whose current content no longer matches Matrix's recorded hash, or a pre-existing asset with no trustworthy Matrix installation record.
_Avoid_: Conflict, outdated asset

## Workflow Language

**Canonical workflow state**:
The single authoritative record of an active Matrix change's workflow, orchestration, phase, status, and revision.
_Avoid_: Current step, duplicated state

**Orchestration mode**:
The immutable per-change choice of which capability provider performs work inside Matrix-owned phases. Its machine values are `prim` and `arch`.
_Avoid_: Workflow type, alternate lifecycle

**Prim**:
The orchestration mode in which Matrix uses its own capabilities and does not depend on the Matt Pocock Skill cohort.
_Avoid_: Basic mode, fallback mode

**Arch**:
The orchestration mode in which Matrix conditionally invokes the initialization-verified atomic Skill cohort while retaining all lifecycle ownership.
_Avoid_: Wrapper workflow, automatic pipeline

**Managed Arch cohort**:
The ten atomic companion capabilities installed and content-verified for every Agent platform configured in the project. Excluded or user-owned extra Skills are not part of its integrity contract.
_Avoid_: Every installed Skill, platform-local availability

**Forward transition**:
A guard-approved advance from the current phase to its normal successor.
_Avoid_: Next, successful return

**Return**:
A reasoned re-entry into an earlier phase that preserves the change and its artifacts while invalidating conclusions produced after the destination phase.
_Avoid_: Rollback, reverse transition

**Abort**:
A terminal outcome that releases the active selection while preserving the abandoned change and its audit history.
_Avoid_: Delete, cleanup

**Workflow revision**:
A monotonically increasing identifier for a committed workflow-state change.
_Avoid_: Iteration, artifact version

**Evidence validity**:
Whether recorded build, test, or review evidence still applies to the canonical workflow revision and decisions it was produced against.
_Avoid_: Evidence presence, guard pass

**Workflow contract**:
The proposal, design, and plan that collectively define the approved scope, decisions, implementation steps, and acceptance boundary for a Matrix change.
_Avoid_: Artifact bundle, brief

**Contract identity**:
The content-derived identity of a Workflow contract used to distinguish one exact contract from another.
_Avoid_: File timestamp, revision number

**Contract approval**:
Confirmation that a specific Workflow contract is authorized to enter Build; it no longer applies when the Contract identity changes.
_Avoid_: Guard pass, phase approval

**Implementation handoff**:
An optional export of an approved Workflow contract to another implementation actor; it does not own workflow phase changes or acceptance of the returned work.
_Avoid_: Alternate workflow, delegated approval
