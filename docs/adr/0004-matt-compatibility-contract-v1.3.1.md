# Bind Matrix 0.1.7 to the reviewed Matt Skills v1.3.1 release

Matrix 0.1.7 supersedes the version binding of ADR-0003 (Matt Skills v1.2.3) with Matt Skills v1.3.1 at commit `24fe0ef7737efae15c87225755e9f6f5965e4888`, and pins `skills@1.7.4` for candidate production. The compatibility procedure of ADR-0003 is unchanged: one reviewed Matrix patch per upstream release, no floating `main`, content-verified project-local installation.

Review outcome for the upstream delta between v1.2.3 and v1.3.1:

- Upstream removed `resolving-merge-conflicts` with no replacement. Matrix's incompatible list drops it accordingly; pre-existing project copies remain unmanaged extras, and `matrix-build` keeps a defensive instruction not to hand lifecycle control to such copies.
- Upstream graduated `implement-spec`, `pr`, and `retro` into the official Engineering bucket (official roles: 25 → 27).
  - `retro` is user-invoked and improves the agent environment rather than code; it joins the explicit-handoff cohort like `improve-codebase-architecture`.
  - `pr` is model-invoked and produces PR text only; it joins the standalone cohort like `code-review`.
  - `implement-spec` runs an entire spec through implementer subagents across worktrees; it owns the implementation process, conflicting with Matrix build-phase governance, so it joins `implement` in the incompatible list. Installable Skills: 23 → 25.
- All 27 content identities were recomputed from the exact v1.3.1 archive via `skills@1.7.4 --copy`; the upgrade is required because the skills CLI now recognizes the `zcode` agent (project-level `.zcode/skills/`).
- Upstream renamed the domain-doc convention `CONTEXT.md`/`CONTEXT-MAP.md` to `GLOSSARY.md`/`GLOSSARY-MAP.md`; Matrix's own repository glossary follows the new name, and the skills installed at v1.3.1 read only the new names.

Consequences: reproducibility and the two-trust-domain supply-chain posture are preserved; upgrading an installed 0.1.6 project changes the Matt catalog digest, so the first `matrix update` reports Matt update-required and one `matrix update --with-mattpocock` completes the repair. Legacy changes created before 0.1.5 keep their frozen `LEGACY_ARCH_SKILLS` cohort, which is intentionally untouched.
