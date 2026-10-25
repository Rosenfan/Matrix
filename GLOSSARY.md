# Matrix

This context defines the language used for distributing Matrix, integrating it with agent environments, and governing Matrix changes.

## Language

**Verified platform**:
An agent environment for which Matrix guarantees both successful installation and executable workflow behavior. The initial verified platforms are Claude Code and Codex.
_Avoid_: Supported tool, detected platform

**Detected platform**:
An agent environment whose project or user configuration is present on disk; detection alone does not imply Matrix compatibility.
_Avoid_: Installed platform, verified platform

**Global launcher**:
The user-wide `matrix` command that initializes or updates installations and enters a project. It auto-delegates workflow commands only to an exact same-release, hash-verified project runtime; a different or unidentified project release stops with an explicit direct-runtime command. Older launchers cannot retroactively provide this check. It never replaces a project's compatibility authority.
_Avoid_: Primary runtime, project runtime, compatibility authority

**Project runtime**:
The self-contained runtime distributed with a project-installed Matrix Skill and authoritative for workflow operations in that project. It is entered directly by the installed Matrix Skill, or automatically only after a same-release launcher verifies its release identity and content hash.
_Avoid_: Backup copy, global launcher, fallback runtime

**Project compatibility authority**:
The installed Matrix release and receipts that govern one project's workflow and Matt compatibility. It outranks user-wide installations and cannot be assembled by merging project and global assets.
_Avoid_: Global default, merged installation, PATH priority

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

**Matt compatibility contract**:
The stable Matt Pocock release, resolved commit, complete official Skill set, compatible installable subset, and reviewed role catalog supported by one Matrix release. It is both the integration baseline and the source of the Matt subset installed by that Matrix release.
_Avoid_: Floating latest, compatibility range, installed Skills

**Matt installation receipt**:
Matrix's project-local record of the Matt compatibility contract and content hashes successfully installed on one platform. It distinguishes a compatible installation from a later user modification without relying on `skills-lock.json` or global Matt Skills.
_Avoid_: skills-lock.json, role catalog, update reminder

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

**Automatic Arch cohort**:
The fixed, reviewed set of model-invoked Matt capabilities that one Matrix release may call conditionally inside Matrix-owned phases. Each Arch change freezes the cohort identity it was created with.
_Avoid_: Managed Arch cohort, every installed Skill, fixed pipeline

**Explicit Matt handoff**:
A Matrix explanation and recommendation that leaves invocation of a user-invoked Matt Skill to the user. It cannot advance Matrix state or silently nest the recommended Skill.
_Avoid_: Automatic invocation, companion transition

**Arch readiness**:
Whether every Skill in the Automatic Arch cohort is present and matches its Matt installation receipt on each configured platform. Missing or modified standalone Skills do not remove Arch readiness.
_Avoid_: Latest upstream, every installed Skill, Arch selected

**Review candidate**:
The exact implementation state covered by Verify review. A normal `code-review` candidate is the fixed-point-to-HEAD committed diff with no candidate worktree changes; an explicit `uncommitted-worktree` fallback additionally binds staged, unstaged, and untracked content by hash.
_Avoid_: Current files, review prose, HEAD only

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
