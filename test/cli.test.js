import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hashDirectory } from "../src/catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("non-interactive Codex initialization emits one JSON preview and performs no Matt install when disabled", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-cli-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const preview = spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--platform", "codex", "--without-mattpocock", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(preview.status, 0);
  assert.equal(JSON.parse(preview.stdout).actions[0].platform, "codex");
  const installed = spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--platform", "codex", "--without-mattpocock"], { cwd: root, encoding: "utf8" });
  assert.equal(installed.status, 0);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md")));
});

test("doctor emits a single structured diagnosis without writing", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-doctor-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.mkdirSync(path.join(project, ".agents", "skills", "matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md"), "manual");
  const result = spawnSync(process.execPath, ["bin/matrix.js", "doctor", project, "--platform", "codex", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 2);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.diagnosis.map((item) => item.code), ["MANIFEST_MISSING", "MATRIX_USER_MODIFIED", "RUNTIME_MISSING", "MATT_MISSING"]);
  assert.equal(fs.existsSync(path.join(project, ".matrix")), false);
});

test("workflow doctor is a separate read-only JSON command", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-workflow-doctor-cli-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [path.join(root, "bin", "matrix.js"), "workflow", "doctor", "--json"], { cwd: project, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, code: "OK", health: "healthy", findings: [], transactions: [], lock: null, repaired: false });
  assert.equal(fs.existsSync(path.join(project, ".matrix")), false);
});

test("non-interactive Matt setup resolves the default orchestration to Arch", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-cli-arch-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const preview = spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--platform", "codex", "--with-mattpocock", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).intent.defaultOrchestration, "arch");
});

test("Chinese doctor localizes Matt states and diagnostics", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-doctor-zh-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.mkdirSync(path.join(project, ".agents", "skills", "matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md"), "manual");
  const result = spawnSync(process.execPath, ["bin/matrix.js", "doctor", project, "--language", "zh-CN", "--platform", "codex", "--no-color"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /Matt Pocock Skills 状态为\s*未安装/);
  assert.match(result.stdout, /Matt v1\.2\.3：不完整/);
  assert.equal(result.stdout.includes("skills are missing"), false);
});

test("doctor inherits an installed project's language, scope, and exact platform set without writing", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-doctor-installed-intent-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const installed = spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--language", "zh-CN", "--scope", "project", "--platform", "codex", "--without-mattpocock"], { cwd: root, encoding: "utf8" });
  assert.equal(installed.status, 0, installed.stderr);
  const before = hashDirectory(project);
  const result = spawnSync(process.execPath, ["bin/matrix.js", "doctor", project, "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.intent.language, "zh-CN");
  assert.equal(output.intent.scope, "project");
  assert.deepEqual(output.intent.platforms, ["codex"]);
  assert.equal(output.observations[0].matrix, "matching");
  assert.equal(output.observations[0].skills.every((skill) => skill.state === "matching"), true);
  assert.equal(hashDirectory(project), before);
});

test("Matt replacement requires the dedicated init-only force flag", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-cli-force-matt-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const preview = spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--platform", "codex", "--with-mattpocock", "--force-matt", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).intent.mattPolicy, "replace");
});

test("update inherits the existing installation language and skips npm on request", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-cli-update-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const installed = spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--language", "zh-CN", "--platform", "codex", "--without-mattpocock"], { cwd: root, encoding: "utf8" });
  assert.equal(installed.status, 0, installed.stderr);
  const update = spawnSync(process.execPath, ["bin/matrix.js", "update", project, "--skip-self-update", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(update.status, 0, update.stderr);
  const output = JSON.parse(update.stdout);
  assert.equal(output.intent.language, "zh-CN");
  assert.equal(output.matt.status, "incomplete");
  assert.equal(output.matt.action, "matrix init . --with-mattpocock");
  assert.equal(fs.existsSync(path.join(project, ".matrix", "matt-installation.json")), false);
});

test("update succeeds independently when an existing Arch setup has incomplete Matt Skills", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-cli-update-incomplete-matt-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const installed = spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--platform", "codex", "--without-mattpocock"], { cwd: root, encoding: "utf8" });
  assert.equal(installed.status, 0, installed.stderr);
  const manifestFile = path.join(project, ".matrix", "installation.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.orchestration = { default: "arch", available: ["prim", "arch"] };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(project, ".matrix", "config.yaml"), "schema: matrix/config/v1\nauto_transition: true\ndefault_orchestration: arch\ninstallation_scope: project\nlanguage: en\n");
  const update = spawnSync(process.execPath, ["bin/matrix.js", "update", project, "--skip-self-update", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(update.status, 0, update.stderr);
  const output = JSON.parse(update.stdout);
  assert.equal(output.code, "OK");
  assert.equal(output.matt.status, "incomplete");
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, "utf8")).orchestration.available, ["prim", "arch"]);
});

test("JSON update commits the Matrix asset refresh before reporting status", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-cli-update-json-commit-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  assert.equal(spawnSync(process.execPath, ["bin/matrix.js", "init", project, "--yes", "--platform", "codex", "--without-mattpocock"], { cwd: root }).status, 0);
  const matrix = path.join(project, ".agents", "skills", "matrix");
  fs.appendFileSync(path.join(matrix, "SKILL.md"), "\nmanaged old release\n");
  const manifestFile = path.join(project, ".matrix", "installation.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.catalogVersion = "0.1.3";
  manifest.platforms.codex.skills.matrix.hash = hashDirectory(matrix);
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = spawnSync(process.execPath, ["bin/matrix.js", "update", project, "--skip-self-update", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).code, "OK");
  assert.equal(fs.readFileSync(path.join(matrix, "SKILL.md"), "utf8").includes("managed old release"), false);
});
