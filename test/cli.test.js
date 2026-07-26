import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
