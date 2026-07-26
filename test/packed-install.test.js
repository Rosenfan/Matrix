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

test("packed npm artifact installs and initializes Codex without repository source", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-packed-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  // `npm publish --dry-run` propagates npm_config_dry_run to child npm commands.
  // This integration seam must always create a real tarball.
  run("npm", ["pack", "--pack-destination", temporary], { cwd: root, env: { ...process.env, npm_config_dry_run: "false" } });
  const tarball = fs.readdirSync(temporary).find((name) => name.endsWith(".tgz"));
  assert.ok(tarball);
  const prefix = path.join(temporary, "prefix");
  run("npm", ["install", "--ignore-scripts", "--prefix", prefix, path.join(temporary, tarball)], { cwd: temporary, env: { ...process.env, npm_config_dry_run: "false" } });
  const project = path.join(temporary, "project");
  fs.mkdirSync(project);
  const binary = path.join(prefix, "node_modules", "@rosenfan", "matrix", "bin", "matrix.js");
  run(process.execPath, [binary, "init", project, "--yes", "--language", "zh-CN", "--platform", "codex", "--without-mattpocock"], { cwd: temporary });
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md")));
  assert.match(fs.readFileSync(path.join(project, ".agents", "skills", "matrix", "SKILL.md"), "utf8"), /持久化的 Matrix 开发工作流/);
});
