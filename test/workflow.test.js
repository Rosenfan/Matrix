import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { invoke } from "../src/workflow.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacyState = path.join(root, ".claude", "skills", "matrix", "scripts", "matrix_state.py");
const legacyClaude = path.join(root, ".claude", "skills", "matrix", "scripts", "matrix_claude.py");

function legacy(args, cwd) { return spawnSync("python", [legacyState, ...args], { cwd, encoding: "utf8" }); }
function writeFrozenArtifacts(cwd, id) {
  const artifacts = path.join(cwd, ".matrix", "changes", id, "artifacts");
  fs.writeFileSync(path.join(artifacts, "proposal.md"), "## Goal\nGoal text.\n\n## Scope\nScope text.\n\n## Acceptance\nAcceptance text.");
  fs.writeFileSync(path.join(artifacts, "design.md"), "## Decisions\nDecision text.\n\n## Test seams\nSeam text.");
  fs.writeFileSync(path.join(artifacts, "plan.md"), "## Steps\nStep text.\n\n## Validation\nValidation text.");
}

test("Node workflow initializes, inspects, guards, and preserves guard semantics", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-workflow-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const initialized = invoke(["init", "test-change", "--title", "Test change"], { cwd });
  assert.equal(initialized.ok, true);
  assert.ok(fs.existsSync(path.join(cwd, ".matrix", "changes", "test-change", "matrix.yaml")));
  assert.equal(invoke(["inspect"], { cwd }).phase, "open");
  assert.equal(invoke(["transition", "design"], { cwd }).code, "GUARD_FAILED");
  const proposal = path.join(cwd, ".matrix", "changes", "test-change", "artifacts", "proposal.md");
  fs.writeFileSync(proposal, "## Goal\nA valid goal.\n\n## Scope\nA valid scope.\n\n## Acceptance\nA valid acceptance list.");
  assert.equal(invoke(["transition", "design"], { cwd }).phase, "design");
});

test("bundled workflow module has a command-line JSON envelope", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-runtime-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const result = invoke(["init", "runtime", "--title", "Runtime"], { cwd });
  assert.equal(result.code, "OK");
});

test("Node workflow writes legacy-compatible state, events, handoff, export, and archive", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-lifecycle-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  assert.equal(invoke(["init", "release", "--title", "Release"], { cwd }).ok, true);
  const artifacts = path.join(cwd, ".matrix", "changes", "release", "artifacts");
  assert.ok(fs.existsSync(path.join(cwd, ".matrix", "changes", "release", "run-state.json")));
  assert.ok(fs.existsSync(path.join(cwd, ".matrix", "changes", "release", "events.jsonl")));
  fs.writeFileSync(path.join(artifacts, "proposal.md"), "## Goal\nGoal text.\n\n## Scope\nScope text.\n\n## Acceptance\nAcceptance text.");
  assert.equal(invoke(["transition", "design"], { cwd }).ok, true);
  fs.writeFileSync(path.join(artifacts, "design.md"), "## Decisions\nDecision text.\n\n## Test seams\nSeam text.");
  fs.writeFileSync(path.join(artifacts, "plan.md"), "## Steps\nStep text.\n\n## Validation\nValidation text.");
  assert.equal(invoke(["export", "release-task"], { cwd }).ok, true);
  assert.ok(fs.existsSync(path.join(artifacts, "claude-task.md")));
  assert.equal(invoke(["transition", "build"], { cwd }).ok, true);
  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Build evidence\nBuild command passed with sufficient detail.");
  assert.equal(invoke(["transition", "verify"], { cwd }).ok, true);
  fs.writeFileSync(path.join(artifacts, "verification.md"), "## Test evidence\nTests passed with enough detail.\n\n## Review evidence\nReview passed with enough detail.");
  assert.equal(invoke(["transition", "archive"], { cwd }).ok, true);
  assert.equal(invoke(["archive"], { cwd }).ok, true);
  assert.ok(fs.existsSync(path.join(cwd, ".matrix", "archive", "release", "events.jsonl")));
});

test("CLI and bundled workflow runtime return the same inspect envelope", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-parity-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  invoke(["init", "parity", "--title", "Parity"], { cwd });
  const cli = spawnSync(process.execPath, [path.join(root, "bin", "matrix.js"), "workflow", "inspect", "--json"], { cwd, encoding: "utf8" });
  const runtime = spawnSync(process.execPath, [path.join(root, "src", "workflow.js"), "inspect"], { cwd, encoding: "utf8" });
  assert.equal(runtime.status, 0);
  assert.equal(cli.status, 0);
  assert.deepEqual(JSON.parse(runtime.stdout), JSON.parse(cli.stdout));
});

test("Node workflow exports FnSec packages without overwriting an active board", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-fnsec-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  assert.equal(invoke(["init", "fnsec", "--title", "FnSec"], { cwd }).ok, true);
  const artifacts = path.join(cwd, ".matrix", "changes", "fnsec", "artifacts");
  fs.writeFileSync(path.join(artifacts, "proposal.md"), "## Goal\nGoal text.\n\n## Scope\nScope text.\n\n## Acceptance\nAcceptance text.");
  assert.equal(invoke(["transition", "design"], { cwd }).ok, true);
  fs.writeFileSync(path.join(artifacts, "design.md"), "## Decisions\nDecision text.\n\n## Test seams\nSeam text.");
  fs.writeFileSync(path.join(artifacts, "plan.md"), "## Steps\nStep text.\n\n## Validation\nValidation text.");
  const tasks = path.join(cwd, "docs", "tasks"); fs.mkdirSync(tasks, { recursive: true }); fs.writeFileSync(path.join(tasks, "active.md"), "NO_ACTIVE_OBJECTIVE\n");
  const exported = invoke(["export", "--task-id", "task-1", "--target", "fnsec", "--apply-fnsec-board"], { cwd });
  assert.equal(exported.ok, true); assert.ok(fs.existsSync(exported.path)); assert.match(fs.readFileSync(path.join(tasks, "active.md"), "utf8"), /CLAUDE_QUEUED/);
  assert.equal(invoke(["export", "--task-id", "task-2", "--target", "fnsec", "--apply-fnsec-board"], { cwd }).code, "FNSEC_BOARD_OCCUPIED");
});

test("Node workflow preserves legacy Python lifecycle and exporter contracts", (t) => {
  const nodeCwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-node-parity-")); const pythonCwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-python-parity-"));
  t.after(() => fs.rmSync(nodeCwd, { recursive: true, force: true })); t.after(() => fs.rmSync(pythonCwd, { recursive: true, force: true }));
  assert.equal(invoke(["init", "parity", "--title", "Parity"], { cwd: nodeCwd }).ok, true);
  assert.equal(legacy(["init", "parity", "--title", "Parity"], pythonCwd).status, 0);
  assert.deepEqual(Object.fromEntries(Object.entries(invoke(["inspect"], { cwd: nodeCwd })).filter(([key]) => ["change_id", "workflow", "phase", "next_skill", "guard_pass"].includes(key))), JSON.parse(legacy(["inspect"], pythonCwd).stdout));
  assert.equal(invoke(["transition", "design"], { cwd: nodeCwd }).code, "GUARD_FAILED"); assert.notEqual(legacy(["transition", "design"], pythonCwd).status, 0);
  for (const cwd of [nodeCwd, pythonCwd]) { const artifacts = path.join(cwd, ".matrix", "changes", "parity", "artifacts"); fs.writeFileSync(path.join(artifacts, "proposal.md"), "## Goal\nGoal text.\n\n## Scope\nScope text.\n\n## Acceptance\nAcceptance text."); }
  assert.equal(invoke(["transition", "design"], { cwd: nodeCwd }).ok, true); assert.equal(legacy(["transition", "design"], pythonCwd).status, 0);
  writeFrozenArtifacts(nodeCwd, "parity"); writeFrozenArtifacts(pythonCwd, "parity");
  assert.equal(invoke(["export", "--task-id", "PARITY-1", "--target", "generic"], { cwd: nodeCwd }).ok, true);
  const pythonExport = spawnSync("python", [legacyClaude, "export", "--task-id", "PARITY-1", "--target", "generic"], { cwd: pythonCwd, encoding: "utf8" }); assert.equal(pythonExport.status, 0, pythonExport.stderr);
  for (const cwd of [nodeCwd, pythonCwd]) assert.match(fs.readFileSync(path.join(cwd, ".matrix", "changes", "parity", "artifacts", "claude-task.md"), "utf8"), /CLAUDE_QUEUED/);
  assert.deepEqual(Object.fromEntries(Object.entries(invoke(["inspect"], { cwd: nodeCwd })).filter(([key]) => ["change_id", "workflow", "phase", "next_skill", "guard_pass"].includes(key))), JSON.parse(legacy(["inspect"], pythonCwd).stdout));
});
