import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildProcessInvocation, createMattAdapter, inspectMattInstallation, mattReceiptPath } from "../src/matt.js";
import { MATT_CATALOG_DIGEST, MATT_COMPATIBILITY, MATT_INSTALLABLE_SKILLS } from "../src/matt-catalog.mjs";
import { hashDirectory } from "../src/catalog.js";

test("Matt candidate preparation uses the pinned archive, compatible Skills, and a Matrix-owned cwd", () => {
  const calls = [];
  const adapter = createMattAdapter({ run: (request) => calls.push(request), makeTemporary: () => "C:/temp/matrix-matt-candidate", remove: () => {}, verifyCandidate: () => {} });
  const result = adapter.prepareCandidate({ platforms: ["claude-code", "codex"], timeout: 1234 });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args.slice(0, 8), ["--yes", MATT_COMPATIBILITY.skillsCli, "add", MATT_COMPATIBILITY.archive, "--yes", "--copy", "--agent", "claude-code"]);
  assert.deepEqual(calls[0].args.filter((value, index) => calls[0].args[index - 1] === "--skill"), MATT_INSTALLABLE_SKILLS);
  assert.equal(calls[0].args.includes("implement"), false);
  assert.equal(calls[0].args.includes("resolving-merge-conflicts"), false);
  assert.equal(calls[0].args.includes("--global"), false);
  assert.equal(calls[0].cwd, "C:/temp/matrix-matt-candidate");
  assert.equal(calls[1].args[7], "codex");
  assert.equal(calls[0].timeout, 1234);
  assert.equal(result.root, "C:/temp/matrix-matt-candidate");
});

test("Matt adapter returns a recovery diagnostic for launch or command failure", () => {
  const removed = [];
  const adapter = createMattAdapter({ run: () => { throw new Error("spawn npx ENOENT"); }, makeTemporary: () => "C:/temp/failed", remove: (target) => removed.push(target) });
  const result = adapter.prepareCandidate({ platforms: ["codex"] });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MATT_INSTALL_FAILED");
  assert.match(result.recovery, /matrix init/);
  assert.deepEqual(removed, ["C:/temp/failed"]);
});

test("Matt adapter requests every compatible Skill when preparing the default release candidate", () => {
  const calls = [];
  const adapter = createMattAdapter({ run: (request) => calls.push(request), makeTemporary: () => "C:/temp/candidate", remove: () => {}, verifyCandidate: () => {} });
  assert.equal(adapter.prepareCandidate({ platforms: ["codex"] }).ok, true);
  for (const skill of MATT_INSTALLABLE_SKILLS) assert.ok(calls[0].args.includes(skill), skill);
  assert.equal(calls[0].args.includes("implement"), false);
  assert.equal(calls[0].args.includes("resolving-merge-conflicts"), false);
});

test("Matt candidate preparation can suppress child output for structured CLI mode", () => {
  const calls = [];
  const adapter = createMattAdapter({
    stdio: "pipe",
    run: (request) => calls.push(request),
    makeTemporary: () => "C:/temp/quiet-candidate",
    remove: () => {},
    verifyCandidate: () => {}
  });
  assert.equal(adapter.prepareCandidate({ platforms: ["codex"] }).ok, true);
  assert.equal(calls[0].stdio, "pipe");
});

test("legacy direct-install adapter fails closed with an explicit migration path", () => {
  const result = createMattAdapter().installMissing({ projectRoot: "C:/user-project", platforms: ["codex"] });
  assert.equal(result.code, "MATT_DIRECT_INSTALL_UNSUPPORTED");
  assert.match(result.recovery, /matrix init --with-mattpocock/);
});

test("production candidate validation rejects bytes outside the reviewed release", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-matt-invalid-candidate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const adapter = createMattAdapter({
    makeTemporary: () => root,
    run({ cwd }) {
      const target = path.join(cwd, ".agents", "skills", "tdd");
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), "not the reviewed release\n");
    }
  });
  const result = adapter.prepareCandidate({ platforms: ["codex"], skills: ["tdd"] });
  assert.equal(result.code, "MATT_INSTALL_FAILED");
  assert.match(result.message, /did not match the reviewed release/);
  assert.equal(fs.existsSync(root), false);
});

test("Windows npx invocation runs npm's Node CLI without a shell", () => {
  const invocation = buildProcessInvocation({
    command: "npx", args: ["--yes", "skills@latest", "add", "mattpocock/skills"], platform: "win32",
    nodeExecutable: "C:/node/node.exe", npmCliPath: "C:/node/node_modules/npm/bin/npm-cli.js"
  });
  assert.equal(invocation.executable, "C:/node/node.exe");
  assert.deepEqual(invocation.args, ["C:/node/node_modules/npm/bin/npm-cli.js", "exec", "--yes", "skills@latest", "--", "add", "mattpocock/skills"]);
  assert.equal(invocation.shell, false);
});

test("Matt inspector trusts only a matching project receipt and project-local hashes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-matt-inspect-"));
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skillRoot = path.join(project, ".agents", "skills");
  const skills = {};
  const contentHashes = {};
  for (const skill of MATT_INSTALLABLE_SKILLS) {
    const target = path.join(skillRoot, skill);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `# ${skill}\n`);
    skills[skill] = { root: target, hash: hashDirectory(target) };
    contentHashes[skill] = skills[skill].hash;
  }
  fs.mkdirSync(path.dirname(mattReceiptPath(project)), { recursive: true });
  fs.writeFileSync(mattReceiptPath(project), `${JSON.stringify({ version: 1, compatibility: MATT_COMPATIBILITY, catalogDigest: MATT_CATALOG_DIGEST, platforms: { codex: { root: skillRoot, skills } } }, null, 2)}\n`);
  const globalOnly = path.join(home, ".agents", "skills", "global-only");
  fs.mkdirSync(globalOnly, { recursive: true });
  fs.writeFileSync(path.join(globalOnly, "SKILL.md"), "ignored");

  assert.equal(inspectMattInstallation({ projectRoot: project, home, platforms: ["codex"] }).status, "user-modified");
  assert.equal(inspectMattInstallation({ projectRoot: project, home, platforms: ["codex"], contentHashes }).status, "compatible");
  fs.appendFileSync(path.join(skillRoot, "tdd", "SKILL.md"), "modified");
  assert.equal(inspectMattInstallation({ projectRoot: project, home, platforms: ["codex"], contentHashes }).status, "user-modified");
  fs.rmSync(path.join(skillRoot, "wizard"), { recursive: true, force: true });
  assert.equal(inspectMattInstallation({ projectRoot: project, home, platforms: ["codex"], contentHashes }).status, "incomplete");
});

test("Matt inspector does not guess a version without a project receipt", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-matt-unverified-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const target = path.join(project, ".agents", "skills", "grilling");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "SKILL.md"), "# grilling\n");
  const result = inspectMattInstallation({ projectRoot: project, platforms: ["codex"] });
  assert.equal(result.status, "unverified");
  assert.equal(result.installed, "unknown");
  assert.equal(result.action, "matrix init . --with-mattpocock");
});
