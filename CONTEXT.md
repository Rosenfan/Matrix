# Matrix Installer

This context defines the language used for distributing Matrix and integrating it with agent environments.

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
