import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hashDirectory } from "../src/catalog.js";
import { createDistribution } from "../src/distribution.js";
import { resolveProjectRuntime } from "../src/runtime-resolver.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a trusted project Runtime is selected before the global launcher implementation", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-project-runtime-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, platforms: ["codex"], matt: "none" });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  const runtime = path.join(project, ".agents", "skills", "matrix", "scripts", "matrix-runtime.mjs");

  const resolved = resolveProjectRuntime({ projectRoot: project });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.runtime, runtime);
  const invoked = spawnSync(process.execPath, [path.join(repository, "bin", "matrix.js"), "workflow", "doctor", "--json"], { cwd: project, encoding: "utf8" });
  assert.equal(invoked.status, 0, invoked.stderr);
  assert.equal(JSON.parse(invoked.stdout).code, "OK");
});

test("a modified project Runtime is rejected instead of falling back globally", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-untrusted-runtime-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const matrix = path.join(project, ".agents", "skills", "matrix");
  fs.mkdirSync(path.join(matrix, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(matrix, "SKILL.md"), "changed\n");
  fs.writeFileSync(path.join(matrix, "scripts", "matrix-runtime.mjs"), "console.log('unsafe');\n");
  fs.mkdirSync(path.join(project, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".matrix", "config.yaml"), "installation_scope: project\n");
  fs.writeFileSync(path.join(project, ".matrix", "installation.json"), JSON.stringify({ platforms: { codex: { skills: { matrix: { hash: "0".repeat(64) } } } } }));
  assert.equal(resolveProjectRuntime({ projectRoot: project }).code, "PROJECT_RUNTIME_UNTRUSTED");
});

test("a trusted project Runtime still wins when config now names global scope", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-project-global-coexist-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const distribution = createDistribution();
  assert.equal(distribution.commit(distribution.evaluate({ projectRoot: project, platforms: ["codex"], matt: "none" }).plan).ok, true);
  const runtime = path.join(project, ".agents", "skills", "matrix", "scripts", "matrix-runtime.mjs");
  fs.writeFileSync(path.join(project, ".matrix", "config.yaml"), "installation_scope: global\n");
  const resolved = resolveProjectRuntime({ projectRoot: project });
  assert.equal(resolved.code, "PROJECT_RUNTIME");
  assert.equal(resolved.runtime, runtime);
});

test("a same-release self-consistent Runtime that differs from the release catalog is rejected", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-project-release-mismatch-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const matrix = path.join(project, ".agents", "skills", "matrix");
  fs.mkdirSync(path.join(matrix, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(matrix, "SKILL.md"), "# divergent 0.1.6 Runtime\n");
  fs.writeFileSync(path.join(matrix, "scripts", "matrix-runtime.mjs"), "console.log('divergent');\n");
  fs.mkdirSync(path.join(project, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".matrix", "installation.json"), JSON.stringify({
    catalogVersion: "0.1.6",
    language: "en",
    catalogDigest: "self-consistent-but-not-release",
    platforms: { codex: { skills: { matrix: { hash: hashDirectory(matrix) } } } }
  }));
  const resolved = resolveProjectRuntime({ projectRoot: project });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "PROJECT_RUNTIME_RELEASE_MISMATCH");
});

test("a same-release Runtime fails closed when its claimed catalog language is unsupported", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-project-release-language-invalid-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const matrix = path.join(project, ".agents", "skills", "matrix");
  fs.mkdirSync(path.join(matrix, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(matrix, "SKILL.md"), "# divergent 0.1.6 Runtime\n");
  fs.writeFileSync(path.join(matrix, "scripts", "matrix-runtime.mjs"), "console.log('divergent');\n");
  fs.mkdirSync(path.join(project, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".matrix", "installation.json"), JSON.stringify({
    catalogVersion: "0.1.6",
    language: "unsupported",
    catalogDigest: "self-consistent-but-not-release",
    platforms: { codex: { skills: { matrix: { hash: hashDirectory(matrix) } } } }
  }));
  const resolved = resolveProjectRuntime({ projectRoot: project });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "PROJECT_RUNTIME_RELEASE_MISMATCH");
});

test("a manifest-backed Runtime from a different project release is not replaced or auto-executed", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-project-different-release-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const matrix = path.join(project, ".agents", "skills", "matrix");
  const runtime = path.join(matrix, "scripts", "matrix-runtime.mjs");
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  fs.writeFileSync(path.join(matrix, "SKILL.md"), "# project release authority\n");
  fs.writeFileSync(runtime, "console.log('project release');\n");
  fs.mkdirSync(path.join(project, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".matrix", "installation.json"), JSON.stringify({
    catalogVersion: "0.1.3",
    platforms: { codex: { skills: { matrix: { hash: hashDirectory(matrix) } } } }
  }));
  const resolved = resolveProjectRuntime({ projectRoot: project });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "PROJECT_RUNTIME_VERSION_MISMATCH");
  assert.equal(resolved.runtime, runtime);
});

test("a different-release project Runtime is authoritative but requires explicit invocation", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-project-explicit-runtime-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const matrix = path.join(project, ".agents", "skills", "matrix");
  const runtime = path.join(matrix, "scripts", "matrix-runtime.mjs");
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  fs.writeFileSync(path.join(matrix, "SKILL.md"), "# project release authority\n");
  fs.writeFileSync(runtime, "console.log(JSON.stringify({ok:true,code:'UNSAFE_AUTO_EXECUTION'}));\n");
  fs.mkdirSync(path.join(project, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(project, ".matrix", "installation.json"), JSON.stringify({
    catalogVersion: "0.1.3",
    platforms: { codex: { skills: { matrix: { hash: hashDirectory(matrix) } } } }
  }));

  const resolved = resolveProjectRuntime({ projectRoot: project });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "PROJECT_RUNTIME_VERSION_MISMATCH");
  assert.equal(resolved.runtime, runtime);
  assert.match(resolved.recovery_command, /matrix-runtime\.mjs/);
  const invoked = spawnSync(process.execPath, [path.join(repository, "bin", "matrix.js"), "workflow", "inspect", "--json"], { cwd: project, encoding: "utf8" });
  assert.equal(invoked.status, 2);
  const failure = JSON.parse(invoked.stdout);
  assert.equal(failure.code, "PROJECT_RUNTIME_VERSION_MISMATCH");
  assert.match(failure.recovery_command, /matrix-runtime\.mjs" inspect$/);
  assert.equal(invoked.stdout.includes("UNSAFE_AUTO_EXECUTION"), false);
});
