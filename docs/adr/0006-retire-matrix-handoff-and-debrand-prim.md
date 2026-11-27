# Retire matrix-handoff, diagnose orphaned retired Skills, and de-brand Prim

Matrix 0.2.0 introduced the `auto` workflow (`understand → execute → verify → close`) while keeping `classic` (`matrix/change/v2`) unchanged with ten Matrix Skills (ADR-0005). Two legacy surfaces from the 0.1.x era remained over-represented:

1. **`matrix-handoff` (and the Runtime `export` / `handoff` commands)**: `export` concatenated `proposal.md`, `design.md`, and `plan.md` into a duplicate Markdown file (`artifacts/handoff-task-<id>.md` or `artifacts/claude-task.md`) for external stateless tools. Because all supported and open-standard hosts (Claude Code, Codex, ZCode, opencode, Kimi Code) share the repository working tree and read `.matrix/` directly, duplicating artifacts neither isolated state nor saved tokens. Token efficiency comes from pinning exact target file coordinates and focused check commands inside the canonical `brief.md` (`auto`) or `design.md` + `plan.md` (`classic`), optionally delegating bounded implementation slices to a lightweight-model subagent while keeping Runtime state ownership with the lead agent.
2. **Promoted `Prim` branding**: Once `auto` became the default autonomous workflow without a Matt Skills dependency, presenting `Prim` alongside `Arch` in interactive setup and product copy created a false three-way choice. In `classic`, orchestration is already determined by whether the verified Matt Skills cohort is installed (`arch` when installed, `prim` otherwise).

## Decisions

1. **Retire `matrix-handoff` and remove `export` / `handoff` Runtime commands**:
   - `MATRIX_SKILLS` shrinks from ten Skills to nine (`matrix`, `matrix-open`, `matrix-design`, `matrix-build`, `matrix-verify`, `matrix-archive`, `matrix-hotfix`, `matrix-tweak`, `matrix-status`).
   - `assets/skills/matrix-handoff/` and `assets/skills-zh-CN/matrix-handoff/` are removed, along with the `export` and `handoff` commands in `src/workflow.js`.
   - `assets/skills/matrix/scripts/matrix_claude.py` remains in `matrix` as a thin compatibility shim to `matrix_state.py` so existing entry wrappers do not break.
   - Classic's Build entry gate (`--executor <current|model|subagent|handoff:<agent-id>>` recorded in `implementation_actor`) is preserved and extended with `subagent` for host-managed lightweight subagent slice execution.

2. **Detect orphaned retired Skills without unattended deletion**:
   - Because `managedSkillSet` intersects recorded manifest entries with `MATRIX_SKILLS`, removing a Skill from `MATRIX_SKILLS` leaves pre-existing directories on disk unmanaged (as previously observed with 0.1.5's `matrix-claude`, which still carried an older bundled runtime).
   - `catalog.js` defines `RETIRED_MATRIX_SKILLS = ["matrix-claude", "matrix-handoff"]`, and `distribution.diagnose()` emits a read-only advisory `RETIRED_SKILL_PRESENT` whenever any retired directory exists in a configured platform's skill root. Matrix never deletes Skill directories unattended.

3. **De-brand `Prim` at the product surface while keeping `prim` in the state schema**:
   - Interactive `matrix init` removes the redundant `Arch` vs `Prim` prompt; Classic installations with Matt Skills default to `arch`, and Classic installations without Matt Skills resolve to `prim` (`--default-orchestration <prim|arch>` remains supported for automation).
   - `ORCHESTRATIONS = ["prim", "arch"]` in `src/workflow.js` and `default_orchestration: prim` in `config.yaml` / `installation.json` stay intact so all in-flight and archived `matrix/change/v2` changes remain valid without schema migration.

## Consequences

- Partially updates ADR-0005 where it stated that Classic installs ten Matrix Skills; Classic now installs nine.
- Existing installations upgrading via `matrix update` retain any previously installed `matrix-handoff` or `matrix-claude` directory untouched on disk until the user removes it, and `matrix doctor` surfaces `RETIRED_SKILL_PRESENT` so stale bundled runtimes cannot hide silently.
- Token savings across model switches, subagent slices, and cross-agent resumes rely on context-pinned coordinates in `brief.md` / `plan.md` rather than duplicate task-package exports.
