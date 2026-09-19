import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildNpmProcessInvocation, resolveNpmCli } from "../src/npm-invocation.js";

function withEnv(value, run) {
  const original = process.env.npm_execpath;
  if (value === undefined) delete process.env.npm_execpath; else process.env.npm_execpath = value;
  try { return run(); } finally {
    if (original === undefined) delete process.env.npm_execpath; else process.env.npm_execpath = original;
  }
}

test("non-Windows platforms run npm and npx directly without a shell", () => {
  assert.equal(resolveNpmCli({ platform: "linux" }), null);
  assert.deepEqual(buildNpmProcessInvocation({ command: "npm", args: ["root", "-g"], platform: "linux" }), { executable: "npm", args: ["root", "-g"], shell: false });
  assert.deepEqual(buildNpmProcessInvocation({ command: "npx", args: ["--yes", "pkg", "add"], platform: "linux" }), { executable: "npx", args: ["--yes", "pkg", "add"], shell: false });
});

test("Windows resolution prefers explicit path, then npm_execpath, then the bundled CLI", (t) => {
  const fakeNode = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-npm-cli-"));
  t.after(() => fs.rmSync(fakeNode, { recursive: true, force: true }));
  const bundled = path.join(fakeNode, "node_modules", "npm", "bin", "npm-cli.js");
  fs.mkdirSync(path.dirname(bundled), { recursive: true });
  fs.writeFileSync(bundled, "");
  const nodeExe = path.join(fakeNode, "node.exe");
  assert.equal(resolveNpmCli({ platform: "win32", nodeExecutable: nodeExe, npmCliPath: "C:/explicit/npm-cli.js" }), "C:/explicit/npm-cli.js");
  const envCli = path.join(fakeNode, "env-npm-cli.js");
  fs.writeFileSync(envCli, "");
  withEnv(envCli, () => {
    assert.equal(resolveNpmCli({ platform: "win32", nodeExecutable: nodeExe }), envCli);
  });
  withEnv(undefined, () => {
    assert.equal(resolveNpmCli({ platform: "win32", nodeExecutable: nodeExe }), bundled);
  });
  const emptyNode = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-npm-cli-empty-"));
  t.after(() => fs.rmSync(emptyNode, { recursive: true, force: true }));
  withEnv(undefined, () => {
    assert.throws(() => resolveNpmCli({ platform: "win32", nodeExecutable: path.join(emptyNode, "node.exe") }), /npm i -g/);
  });
});

test("Windows npm and npx run through the Node executable without a shell", () => {
  const npm = buildNpmProcessInvocation({ command: "npm", args: ["install", "--global", "pkg"], platform: "win32", nodeExecutable: "C:/node.exe", npmCliPath: "C:/npm-cli.js" });
  assert.deepEqual(npm, { executable: "C:/node.exe", args: ["C:/npm-cli.js", "install", "--global", "pkg"], shell: false });
  const npx = buildNpmProcessInvocation({ command: "npx", args: ["--yes", "skills@1.5.22", "add", "archive", "--skill", "tdd"], platform: "win32", nodeExecutable: "C:/node.exe", npmCliPath: "C:/npm-cli.js" });
  assert.deepEqual(npx, { executable: "C:/node.exe", args: ["C:/npm-cli.js", "exec", "--yes", "skills@1.5.22", "--", "add", "archive", "--skill", "tdd"], shell: false });
  assert.throws(() => buildNpmProcessInvocation({ command: "npx", args: ["install", "x"], platform: "win32", nodeExecutable: "C:/node.exe", npmCliPath: "C:/npm-cli.js" }), /fixed npm exec arguments/);
  assert.deepEqual(buildNpmProcessInvocation({ command: "git", args: ["status"], platform: "win32" }), { executable: "git", args: ["status"], shell: false });
});
