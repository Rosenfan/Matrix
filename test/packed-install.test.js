import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, options) => {
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const executable = command === "npm" ? process.execPath : command;
  const invocation = command === "npm" ? [npmCli, ...args] : args;
  const result = spawnSync(executable, invocation, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stderr ?? result.error?.message}`);
  return result;
};

test("packed artifact runs recoverable Claude Code and Codex lifecycles without repository source", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-packed-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  run("npm", ["pack", "--pack-destination", temporary], { cwd: root, env: { ...process.env, npm_config_dry_run: "false" } });
  const tarball = fs.readdirSync(temporary).find((name) => name.endsWith(".tgz"));
  assert.ok(tarball);
  const prefix = path.join(temporary, "prefix");
  run("npm", ["install", "--ignore-scripts", "--prefix", prefix, path.join(temporary, tarball)], { cwd: temporary, env: { ...process.env, npm_config_dry_run: "false" } });
  const project = path.join(temporary, "project");
  fs.mkdirSync(project);
  const binary = path.join(prefix, "node_modules", "@rosenfan", "matrix", "bin", "matrix.js");
  run(process.execPath, [binary, "init", project, "--yes", "--language", "zh-CN", "--platform", "claude-code", "--platform", "codex", "--without-mattpocock"], { cwd: temporary });
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".claude", "skills", "matrix", "SKILL.md")));

  const codexRuntime = path.join(project, ".agents", "skills", "matrix", "scripts", "matrix-runtime.mjs");
  const claudeRuntime = path.join(project, ".claude", "skills", "matrix", "scripts", "matrix-runtime.mjs");
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "matrix", "scripts", "workflow-transaction.js")));
  assert.ok(fs.existsSync(path.join(project, ".claude", "skills", "matrix", "scripts", "workflow-transaction.js")));
  run(process.execPath, [claudeRuntime, "init", "packed-return", "--title", "Packed return"], { cwd: project });
  const artifacts = path.join(project, ".matrix", "changes", "packed-return", "artifacts");
  fs.writeFileSync(path.join(artifacts, "proposal.md"), "## Goal\nGoal text.\n\n## Scope\nScope text.\n\n## Non-goals\nNo extra work.\n\n## Acceptance\nAcceptance text.\n\n## Risks\nKnown risk.");
  run(process.execPath, [codexRuntime, "transition", "design"], { cwd: project });
  fs.writeFileSync(path.join(artifacts, "design.md"), "## Decisions\nDecision text.\n\n## Boundaries\nBounded scope.\n\n## Test seams\nSeam text.\n\n## Risks\nKnown risk.");
  fs.writeFileSync(path.join(artifacts, "plan.md"), "## Steps\nStep text.\n\n## Validation\nValidation text.\n\n## Stop conditions\nStop on scope change.");
  run(process.execPath, [claudeRuntime, "transition", "build"], { cwd: project });

  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nInitial build evidence that must be invalidated.");
  run(process.execPath, [codexRuntime, "return", "design", "--reason", "design-gap"], { cwd: project });
  assert.ok(fs.existsSync(path.join(artifacts, "evidence-history", "revision-3-verification.md")));
  run(process.execPath, [claudeRuntime, "transition", "build"], { cwd: project });

  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nFresh build evidence after the design Return.");
  run(process.execPath, [codexRuntime, "transition", "verify"], { cwd: project });
  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nBuild command passed with sufficient detail.\n\n## Test evidence\nTests passed with sufficient detail.\n\n## Review evidence\n### Standards\nNo blocking standards findings.\n\n### Spec\nNo blocking specification findings.");
  const returned = run(process.execPath, [binary, "workflow", "return", "build", "--reason", "verification-failed", "--json"], { cwd: project });
  assert.equal(JSON.parse(returned.stdout).phase, "build");
  assert.ok(fs.existsSync(path.join(artifacts, "evidence-history", "revision-6-verification.md")));

  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nFresh build evidence after verification failure.");
  run(process.execPath, [claudeRuntime, "transition", "verify"], { cwd: project });
  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nBuild command passed with sufficient detail.\n\n## Test evidence\nTests passed with sufficient detail.\n\n## Review evidence\n### Standards\nNo blocking standards findings.\n\n### Spec\nNo blocking specification findings.");
  run(process.execPath, [codexRuntime, "return", "design", "--reason", "acceptance-or-design-gap"], { cwd: project });
  assert.ok(fs.existsSync(path.join(artifacts, "evidence-history", "revision-8-verification.md")));

  fs.writeFileSync(path.join(artifacts, "design.md"), "## Decisions\nConfirmed final decision text.\n\n## Boundaries\nFinal bounded scope.\n\n## Test seams\nConfirmed seam text.\n\n## Risks\nKnown risk.");
  fs.writeFileSync(path.join(artifacts, "plan.md"), "## Steps\nConfirmed final step text.\n\n## Validation\nConfirmed validation text.\n\n## Stop conditions\nStop on scope change.");
  run(process.execPath, [claudeRuntime, "transition", "build"], { cwd: project });
  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nFresh final build evidence with sufficient detail.");
  run(process.execPath, [codexRuntime, "transition", "verify"], { cwd: project });
  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nFresh final build evidence with sufficient detail.\n\n## Test evidence\nFresh final tests passed with sufficient detail.\n\n## Review evidence\n### Standards\nNo blocking standards findings.\n\n### Spec\nNo blocking specification findings.");
  run(process.execPath, [claudeRuntime, "transition", "archive"], { cwd: project });
  const packedPreflight = JSON.parse(run(process.execPath, [codexRuntime, "archive", "--dry-run"], { cwd: project }).stdout);
  run(process.execPath, [codexRuntime, "archive", "--expect-preflight", packedPreflight.preflight_hash], { cwd: project });
  const archivedInspect = run(process.execPath, [claudeRuntime, "inspect", "packed-return"], { cwd: project });
  assert.equal(JSON.parse(archivedInspect.stdout).status, "archived");
  assert.equal(JSON.parse(archivedInspect.stdout).next_skill, null);

  run(process.execPath, [codexRuntime, "init", "packed-abort", "--title", "Packed abort"], { cwd: project });
  run(process.execPath, [claudeRuntime, "abort", "--reason", "superseded"], { cwd: project });
  assert.equal(fs.existsSync(path.join(project, ".matrix", "active.json")), false);
  assert.match(fs.readFileSync(path.join(project, ".matrix", "archive", "packed-abort", "matrix.yaml"), "utf8"), /^status: aborted$/m);
  run(process.execPath, [codexRuntime, "init", "packed-reinit", "--title", "Packed reinit"], { cwd: project });
});
