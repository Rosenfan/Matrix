# Use a CLI-first runtime with a bundled Skill fallback

Matrix will expose one platform-neutral Node command surface through the `matrix` CLI and install an equivalent self-contained runtime beside its Skills. Skills use the CLI first and fall back to their bundled runtime only when the CLI is genuinely absent, following Comet's proven distribution model; this removes platform-path and Python dependencies without making installed workflows depend on a permanently available global package.

## Consequences

Claude Code and Codex share the same runtime contract, installed asset versions remain separate from the npm package version, and a present-but-failing CLI must report its error rather than silently falling back.
