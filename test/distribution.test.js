import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MATRIX_SKILLS, MATT_SKILLS, hashDirectory } from "../src/catalog.js";
import { createDistribution, recoverPendingTransaction } from "../src/distribution.js";
import { invoke } from "../src/workflow.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-distribution-"));
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { project, home };
}

test("requires a platform when no verified platform can be detected", (t) => {
  const { project, home } = fixture(t);
  const result = createDistribution().evaluate({ projectRoot: project, home, language: "en" });
  assert.equal(result.code, "INPUT_REQUIRED");
});

test("Matt catalog closes grill-with-docs' required Skill dependencies", () => {
  assert.ok(MATT_SKILLS.includes("grill-with-docs"));
  assert.ok(MATT_SKILLS.includes("grilling"));
  assert.ok(MATT_SKILLS.includes("domain-modeling"));
});

test("plans and commits Claude Code and Codex without touching unrelated skills", (t) => {
  const { project, home } = fixture(t);
  const custom = path.join(project, ".agents", "skills", "custom");
  fs.mkdirSync(custom, { recursive: true });
  fs.writeFileSync(path.join(custom, "SKILL.md"), "custom");
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["claude-code", "codex"], language: "en" });
  assert.equal(evaluation.ok, true);
  assert.deepEqual(evaluation.actions.map((item) => item.matrix), ["install", "install"]);
  const result = distribution.commit(evaluation.plan);
  assert.equal(result.ok, true);
  for (const skill of MATRIX_SKILLS) {
    assert.ok(fs.existsSync(path.join(project, ".claude", "skills", skill, "SKILL.md")));
    assert.ok(fs.existsSync(path.join(project, ".agents", "skills", skill, "SKILL.md")));
  }
  assert.ok(fs.existsSync(path.join(project, ".claude", "skills", "matrix", "scripts", "matrix-runtime.mjs")));
  const fallback = spawnSync(process.execPath, [path.join(project, ".claude", "skills", "matrix", "scripts", "matrix-runtime.mjs"), "inspect"], { cwd: project, encoding: "utf8" });
  assert.equal(fallback.status, 2);
  assert.equal(JSON.parse(fallback.stdout).code, "NO_ACTIVE_CHANGE");
  assert.equal(fs.readFileSync(path.join(custom, "SKILL.md"), "utf8"), "custom");
  assert.ok(fs.existsSync(path.join(project, ".matrix", "installation.json")));
  const repeated = distribution.evaluate({ projectRoot: project, home, platforms: ["claude-code", "codex"], language: "en" });
  assert.deepEqual(repeated.actions.map((item) => item.matrix), ["keep", "keep"]);
});

test("unowned Matrix-named files are blocked until explicitly approved for replacement", (t) => {
  const { project, home } = fixture(t);
  const target = path.join(project, ".claude", "skills", "matrix");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "SKILL.md"), "user version");
  const distribution = createDistribution();
  const blocked = distribution.evaluate({ projectRoot: project, home, platforms: ["claude-code"] });
  assert.equal(blocked.code, "USER_MODIFIED_BLOCKED");
  const approved = distribution.evaluate({ projectRoot: project, home, platforms: ["claude-code"], matrixPolicy: "replace" });
  assert.equal(approved.ok, true);
  const result = distribution.commit(approved.plan);
  assert.equal(result.ok, true);
  assert.ok(result.backups.length > 0);
});

test("byte-identical pre-manifest Matrix files are still treated as user-owned", (t) => {
  const { project, home } = fixture(t);
  const initial = createDistribution().evaluate({ projectRoot: project, home, platforms: ["claude-code"] });
  createDistribution().commit(initial.plan);
  fs.rmSync(path.join(project, ".matrix", "installation.json"));
  const result = createDistribution().evaluate({ projectRoot: project, home, platforms: ["claude-code"] });
  assert.equal(result.code, "USER_MODIFIED_BLOCKED");
});

test("sealed plans reject changed preconditions", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"] });
  fs.mkdirSync(path.join(project, ".agents", "skills", "matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md"), "changed");
  assert.equal(distribution.commit(evaluation.plan).code, "PLAN_STALE");
});

test("symlink mode centralizes only Matrix-managed skill directories", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], mode: "symlink" });
  const result = distribution.commit(evaluation.plan);
  assert.equal(result.ok, true);
  const matrix = path.join(project, ".agents", "skills", "matrix");
  assert.equal(fs.lstatSync(matrix).isSymbolicLink() || process.platform === "win32", true);
  assert.ok(fs.existsSync(path.join(project, ".matrix", "skills")));
});

test("Chinese installation uses the Chinese Matrix guidance cohort", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], language: "zh-CN" });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  const guidance = fs.readFileSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md"), "utf8");
  assert.match(guidance, /持久化的 Matrix 开发工作流/);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "matrix", "scripts", "matrix_state.py")));
});

test("project Matt detection combines local and global skills for the same platform", (t) => {
  const { project, home } = fixture(t);
  fs.mkdirSync(path.join(project, ".claude", "skills", "grill-with-docs"), { recursive: true });
  fs.writeFileSync(path.join(project, ".claude", "skills", "grill-with-docs", "SKILL.md"), "local");
  for (const skill of ["grilling", "domain-modeling", "research", "wayfinder", "prototype", "codebase-design", "implement", "tdd", "code-review", "diagnosing-bugs", "resolving-merge-conflicts", "improve-codebase-architecture"]) {
    fs.mkdirSync(path.join(home, ".claude", "skills", skill), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "skills", skill, "SKILL.md"), "global");
  }
  const evaluation = createDistribution().evaluate({ projectRoot: project, home, platforms: ["claude-code"] });
  assert.equal(evaluation.observations[0].matt.state, "complete");
  assert.equal(evaluation.observations[0].matt.inherited, 12);
  assert.deepEqual(evaluation.observations[0].matt.missing, []);
});

test("newer manifest-backed Matrix cohorts are kept without downgrade", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"] });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  const skill = path.join(project, ".agents", "skills", "matrix");
  fs.appendFileSync(path.join(skill, "SKILL.md"), "\nnewer release");
  const manifestFile = path.join(project, ".matrix", "installation.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.catalogVersion = "9.0.0";
  manifest.platforms.codex.skills.matrix.hash = hashDirectory(skill);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const refreshed = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"] });
  assert.equal(refreshed.observations[0].matrix, "newer");
  assert.equal(refreshed.actions[0].matrix, "keep");
});

test("damaged managed Matrix cohorts require explicit replacement", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"] });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  fs.rmSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md"));
  const damaged = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"] });
  assert.equal(damaged.code, "USER_MODIFIED_BLOCKED");
  assert.equal(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matrixPolicy: "replace" }).actions[0].matrix, "backup-replace");
});

test("transaction failure after backup restores every managed target and removes staging", (t) => {
  const { project, home } = fixture(t);
  const initial = createDistribution();
  const first = initial.evaluate({ projectRoot: project, home, platforms: ["claude-code", "codex"] });
  assert.equal(initial.commit(first.plan).ok, true);
  const manifestFile = path.join(project, ".matrix", "installation.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.catalogVersion = "0.0.0";
  for (const platform of ["claude-code", "codex"]) {
    const skill = path.join(project, platform === "claude-code" ? ".claude" : ".agents", "skills", "matrix");
    fs.appendFileSync(path.join(skill, "SKILL.md"), "\nold release");
    manifest.platforms[platform].skills.matrix.hash = hashDirectory(skill);
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const failing = createDistribution({ failAt(stage, detail) { if (stage === "after-commit" && detail.platform === "claude-code" && detail.skill === "matrix") throw new Error("injected failure"); } });
  const evaluation = failing.evaluate({ projectRoot: project, home, platforms: ["claude-code", "codex"] });
  const result = failing.commit(evaluation.plan);
  assert.equal(result.code, "MATRIX_COMMIT_FAILED");
  assert.match(fs.readFileSync(path.join(project, ".claude", "skills", "matrix", "SKILL.md"), "utf8"), /old release/);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md")));
  assert.equal(fs.existsSync(path.join(project, ".matrix", "staging")), false);
});

test("doctor diagnosis reports missing manifest and missing bundled runtime", (t) => {
  const { project, home } = fixture(t);
  const matrix = path.join(project, ".agents", "skills", "matrix");
  fs.mkdirSync(matrix, { recursive: true });
  fs.writeFileSync(path.join(matrix, "SKILL.md"), "manual");
  const diagnosis = createDistribution().diagnose({ projectRoot: project, home, platforms: ["codex"] });
  assert.deepEqual(diagnosis.diagnosis.map((item) => item.code), ["MANIFEST_MISSING", "MATRIX_USER_MODIFIED", "RUNTIME_MISSING", "MATT_MISSING"]);
});

test("installed bundled runtime matches the primary CLI workflow output", (t) => {
  const { project, home } = fixture(t);
  assert.equal(invoke(["init", "runtime", "--title", "Runtime"], { cwd: project }).ok, true);
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"] });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  const runtime = spawnSync(process.execPath, [path.join(project, ".agents", "skills", "matrix", "scripts", "matrix-runtime.mjs"), "inspect"], { cwd: project, encoding: "utf8" });
  const primary = spawnSync(process.execPath, [path.resolve("bin/matrix.js"), "workflow", "inspect", "--json"], { cwd: project, encoding: "utf8" });
  assert.equal(runtime.status, 0);
  assert.equal(primary.status, 0);
  assert.deepEqual(JSON.parse(runtime.stdout), JSON.parse(primary.stdout));
});

test("a durable transaction journal restores a committed target and prior manifest", (t) => {
  const { project, home } = fixture(t);
  const target = path.join(project, ".agents", "skills", "matrix"); const backup = path.join(project, ".matrix", "backups", "crash", "codex", "matrix");
  fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, "SKILL.md"), "new");
  fs.mkdirSync(backup, { recursive: true }); fs.writeFileSync(path.join(backup, "SKILL.md"), "old");
  const manifest = path.join(project, ".matrix", "installation.json"); const manifestBackup = path.join(project, ".matrix", "backups", "crash", "installation.json");
  fs.writeFileSync(manifest, "new manifest"); fs.writeFileSync(manifestBackup, "old manifest");
  fs.writeFileSync(path.join(project, ".matrix", "transaction.json"), JSON.stringify({ id: "crash", stagingRoot: path.join(project, ".matrix", "staging", "crash"), manifest: { path: manifest, existed: true, backup: manifestBackup, written: true }, operations: [{ target, backup, status: "committed" }] }));
  const recovered = recoverPendingTransaction({ projectRoot: project, home, scope: "project" });
  assert.equal(recovered.ok, true); assert.equal(recovered.recovered, true);
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), "old"); assert.equal(fs.readFileSync(manifest, "utf8"), "old manifest");
});

test("a completed transaction journal only finalizes cleanup and never rolls back new assets", (t) => {
  const { project, home } = fixture(t); const target = path.join(project, ".agents", "skills", "matrix");
  fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, "SKILL.md"), "new");
  fs.mkdirSync(path.join(project, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".matrix", "transaction.json"), JSON.stringify({ id: "done", state: "committed", stagingRoot: path.join(project, ".matrix", "staging", "done"), manifest: { path: path.join(project, ".matrix", "installation.json"), backup: null }, operations: [{ target, backup: null, status: "committed" }] }));
  assert.equal(recoverPendingTransaction({ projectRoot: project, home, scope: "project" }).ok, true);
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), "new");
});

test("failure after manifest replacement restores the old manifest", (t) => {
  const { project, home } = fixture(t); const initial = createDistribution();
  assert.equal(initial.commit(initial.evaluate({ projectRoot: project, home, platforms: ["codex"] }).plan).ok, true);
  const manifest = path.join(project, ".matrix", "installation.json"); const previous = fs.readFileSync(manifest, "utf8");
  const parsed = JSON.parse(previous); parsed.catalogVersion = "0.0.0";
  const matrix = path.join(project, ".agents", "skills", "matrix"); fs.appendFileSync(path.join(matrix, "SKILL.md"), "\nold release"); parsed.platforms.codex.skills.matrix.hash = hashDirectory(matrix); fs.writeFileSync(manifest, JSON.stringify(parsed));
  const failing = createDistribution({ failAt(stage) { if (stage === "after-manifest") throw new Error("manifest failure"); } });
  const evaluation = failing.evaluate({ projectRoot: project, home, platforms: ["codex"] });
  assert.equal(failing.commit(evaluation.plan).code, "MATRIX_COMMIT_FAILED");
  assert.equal(fs.readFileSync(manifest, "utf8"), JSON.stringify(parsed));
});

test("doctor reports and replacement repairs dangling managed links", (t) => {
  const { project, home } = fixture(t); const target = path.join(project, ".agents", "skills", "matrix");
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.symlinkSync(path.join(project, "missing-target"), target, process.platform === "win32" ? "junction" : "dir");
  const distribution = createDistribution();
  assert.ok(distribution.diagnose({ projectRoot: project, home, platforms: ["codex"] }).diagnosis.some((item) => item.code === "BROKEN_LINK"));
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matrixPolicy: "replace" });
  assert.equal(distribution.commit(evaluation.plan).ok, true); assert.ok(fs.existsSync(path.join(target, "SKILL.md")));
});

test("a malformed Matt directory remains missing and Matt execution is sealed into the plan", (t) => {
  const { project, home } = fixture(t); const malformed = path.join(project, ".agents", "skills", "tdd"); fs.mkdirSync(malformed, { recursive: true });
  const calls = []; const distribution = createDistribution({ mattAdapter: { installMissing(request) { calls.push(request); return { ok: false, code: "MATT_INSTALL_FAILED" }; } } });
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing" });
  assert.ok(evaluation.observations[0].matt.missing.includes("tdd"));
  const result = distribution.commit(evaluation.plan); assert.equal(result.code, "PARTIAL"); assert.equal(calls.length, 1); assert.deepEqual(calls[0].platforms, ["codex"]);
});

test("Matt success requires filesystem postconditions before Matrix reports completion", (t) => {
  const { project, home } = fixture(t); const distribution = createDistribution({ mattAdapter: { installMissing() { return { ok: true, code: "OK" }; } } });
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing" });
  const result = distribution.commit(evaluation.plan);
  assert.equal(result.ok, true); assert.equal(result.code, "PARTIAL"); assert.match(result.recovery, /with-mattpocock/);
});

test("runtime tampering is diagnosed as a managed Matrix modification", (t) => {
  const { project, home } = fixture(t); const distribution = createDistribution();
  assert.equal(distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"] }).plan).ok, true);
  fs.appendFileSync(path.join(project, ".agents", "skills", "matrix", "scripts", "matrix-runtime.mjs"), "\n// tampered");
  const diagnosis = distribution.diagnose({ projectRoot: project, home, platforms: ["codex"] });
  assert.equal(diagnosis.observations[0].matrix, "user-modified"); assert.ok(diagnosis.diagnosis.some((item) => item.code === "MATRIX_USER_MODIFIED"));
});
