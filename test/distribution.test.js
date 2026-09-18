import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MATRIX_SKILLS, MATT_SKILLS, hashDirectory } from "../src/catalog.js";
import { MATT_AUTOMATIC_SKILLS, MATT_OFFICIAL_SKILLS, MATT_ROLES } from "../src/matt-catalog.mjs";
import { classifyMattTarget, createDistribution, installedIntent, recoverPendingTransaction } from "../src/distribution.js";
import { mattReceiptPath } from "../src/matt.js";
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

function fakeMattHashes(contentsFor) {
  return Object.fromEntries(MATT_SKILLS.map((skill) => {
    const hash = crypto.createHash("sha256").update("SKILL.md\0").update(contentsFor(skill)).digest("hex");
    return [skill, hash];
  }));
}

function fakeCandidate(base, platforms, contentsFor) {
  const roots = {};
  for (const platform of platforms) {
    const root = path.join(base, platform === "codex" ? ".agents" : ".claude", "skills");
    roots[platform] = root;
    for (const skill of MATT_SKILLS) {
      const target = path.join(root, skill);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), contentsFor(skill));
    }
  }
  return { ok: true, code: "OK", root: base, platforms: roots };
}

// Digests exactly as 0.1.4 computed them: raw bytes, no EOL normalization.
function rawHashDirectory(directory) {
  const hash = crypto.createHash("sha256");
  const files = [];
  const visit = (current, relative = "") => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(current, entry.name);
      const childRelative = path.join(relative, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile()) files.push([childRelative, fs.readFileSync(child)]);
    }
  };
  visit(directory);
  for (const [relative, contents] of files.sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${relative}\0`);
    hash.update(contents);
  }
  return hash.digest("hex");
}

test("requires a platform when no verified platform can be detected", (t) => {
  const { project, home } = fixture(t);
  const result = createDistribution().evaluate({ projectRoot: project, home, language: "en" });
  assert.equal(result.code, "INPUT_REQUIRED");
});

test("distribution installs only compatible reviewed Skills while Arch invokes the automatic cohort", () => {
  assert.deepEqual(MATT_SKILLS, MATT_OFFICIAL_SKILLS.filter((skill) => !MATT_ROLES.incompatible.includes(skill)));
  assert.equal(MATT_SKILLS.length, 23);
  assert.equal(MATT_AUTOMATIC_SKILLS.length, 10);
  assert.equal(MATT_AUTOMATIC_SKILLS.includes("implement"), false);
  assert.equal(MATT_AUTOMATIC_SKILLS.includes("wayfinder"), false);
  assert.equal(MATT_SKILLS.includes("implement"), false);
  assert.equal(MATT_SKILLS.includes("resolving-merge-conflicts"), false);
});

test("installed update intent follows a retained project manifest before global config", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  assert.equal(distribution.commit(distribution.evaluate({ projectRoot: project, home, scope: "project", platforms: ["codex"], matt: "none" }).plan).ok, true);
  fs.writeFileSync(path.join(project, ".matrix", "config.yaml"), "schema: matrix/config/v1\ninstallation_scope: global\nlanguage: en\n");
  fs.mkdirSync(path.join(home, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(home, ".matrix", "installation.json"), JSON.stringify({ language: "zh-CN", platforms: { "claude-code": {} } }));
  const installed = installedIntent({ projectRoot: project, home });
  assert.equal(installed.intent.scope, "project");
  assert.deepEqual(installed.intent.platforms, ["codex"]);
  assert.equal(installed.intent.language, "en");
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
  assert.ok(fs.existsSync(path.join(project, ".claude", "skills", "matrix", "scripts", "workflow-transaction.js")));
  const fallback = spawnSync(process.execPath, [path.join(project, ".claude", "skills", "matrix", "scripts", "matrix-runtime.mjs"), "inspect"], { cwd: project, encoding: "utf8" });
  assert.equal(fallback.status, 2);
  assert.equal(JSON.parse(fallback.stdout).code, "NO_ACTIVE_CHANGE");
  assert.doesNotMatch(fallback.stderr, /MODULE_TYPELESS_PACKAGE_JSON/);
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
  assert.match(fs.readFileSync(path.join(project, ".matrix", "config.yaml"), "utf8"), /^language: zh-CN$/m);
  assert.equal(installedIntent({ projectRoot: project, home }).intent.language, "zh-CN");
});

test("project Matt readiness never combines local and global Skills", (t) => {
  const { project, home } = fixture(t);
  fs.mkdirSync(path.join(project, ".claude", "skills", "grilling"), { recursive: true });
  fs.writeFileSync(path.join(project, ".claude", "skills", "grilling", "SKILL.md"), "local");
  for (const skill of MATT_SKILLS.filter((skill) => skill !== "grilling")) {
    fs.mkdirSync(path.join(home, ".claude", "skills", skill), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "skills", skill, "SKILL.md"), "global");
  }
  const evaluation = createDistribution().evaluate({ projectRoot: project, home, platforms: ["claude-code"] });
  assert.equal(evaluation.observations[0].matt.state, "partial");
  assert.equal(evaluation.observations[0].matt.inherited, 0);
  assert.equal(evaluation.observations[0].matt.ignoredGlobal, MATT_SKILLS.length - 1);
  assert.deepEqual(evaluation.observations[0].matt.missing, MATT_SKILLS.filter((skill) => skill !== "grilling"));
});

test("global Matrix scope still installs Matt only into the target project", (t) => {
  const { project, home } = fixture(t);
  const globalMatt = path.join(home, ".agents", "skills", "tdd");
  fs.mkdirSync(globalMatt, { recursive: true });
  fs.writeFileSync(path.join(globalMatt, "SKILL.md"), "global-user-copy");
  const calls = [];
  const candidate = fakeCandidate(path.join(home, "global-project-candidate"), ["codex"], (skill) => `# ${skill}\n`);
  const distribution = createDistribution({ mattContentHashes: fakeMattHashes((skill) => `# ${skill}\n`), mattAdapter: {
    prepareCandidate(request) {
      calls.push(request);
      return candidate;
    },
    discardCandidate() {}
  } });
  const evaluation = distribution.evaluate({ projectRoot: project, home, scope: "global", platforms: ["codex"], matt: "missing", nonInteractive: true });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].platforms, ["codex"]);
  assert.ok(fs.existsSync(path.join(home, ".agents", "skills", "matrix", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "grilling", "SKILL.md")));
  assert.equal(fs.readFileSync(path.join(globalMatt, "SKILL.md"), "utf8"), "global-user-copy");
  assert.ok(fs.existsSync(path.join(project, ".matrix", "matt-installation.json")));
  assert.equal(fs.existsSync(path.join(home, ".matrix", "matt-installation.json")), false);
});

test("two global-scope Matrix projects retain independent Matt receipts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-global-projects-"));
  const home = path.join(root, "home");
  const projects = [path.join(root, "one"), path.join(root, "two")];
  fs.mkdirSync(home, { recursive: true });
  for (const project of projects) fs.mkdirSync(project, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [index, project] of projects.entries()) {
    const candidate = path.join(root, `candidate-${index}`);
    const candidateRoot = path.join(candidate, ".agents", "skills");
    for (const skill of MATT_SKILLS) {
      const target = path.join(candidateRoot, skill);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), `${index}:${skill}\n`);
    }
    const distribution = createDistribution({ mattContentHashes: fakeMattHashes((skill) => `${index}:${skill}\n`), mattAdapter: {
      prepareCandidate() { return { ok: true, code: "OK", root: candidate, platforms: { codex: candidateRoot } }; },
      discardCandidate() {}
    } });
    const evaluation = distribution.evaluate({ projectRoot: project, home, scope: "global", platforms: ["codex"], matt: "missing", nonInteractive: true });
    assert.equal(distribution.commit(evaluation.plan).ok, true);
  }
  const first = fs.readFileSync(mattReceiptPath(projects[0]), "utf8");
  const second = fs.readFileSync(mattReceiptPath(projects[1]), "utf8");
  assert.notEqual(first, second);
  assert.match(fs.readFileSync(path.join(projects[0], ".agents", "skills", "tdd", "SKILL.md"), "utf8"), /^0:/);
  assert.match(fs.readFileSync(path.join(projects[1], ".agents", "skills", "tdd", "SKILL.md"), "utf8"), /^1:/);
});

test("fresh installation records Prim as the only available orchestration without Arch", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(project, ".matrix", "installation.json"), "utf8"));
  assert.deepEqual(manifest.orchestration, { default: "prim", available: ["prim"] });
  assert.match(fs.readFileSync(path.join(project, ".matrix", "config.yaml"), "utf8"), /^default_orchestration: prim$/m);
});

test("verified Arch setup records hashes and defaults first non-interactive setup to Arch", (t) => {
  const { project, home } = fixture(t);
  const candidate = fakeCandidate(path.join(home, "arch-candidate"), ["claude-code", "codex"], (skill) => `# ${skill}\n`);
  const adapter = {
    prepareCandidate() { return candidate; },
    discardCandidate() {}
  };
  const distribution = createDistribution({ mattAdapter: adapter, mattContentHashes: fakeMattHashes((skill) => `# ${skill}\n`) });
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["claude-code", "codex"], matt: "missing", nonInteractive: true });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(project, ".matrix", "installation.json"), "utf8"));
  const receipt = JSON.parse(fs.readFileSync(path.join(project, ".matrix", "matt-installation.json"), "utf8"));
  assert.equal(manifest.version, 4);
  assert.deepEqual(manifest.orchestration, { default: "arch", available: ["prim", "arch"] });
  assert.equal(manifest.platforms.codex.matt, undefined);
  assert.equal(Object.keys(receipt.platforms.codex.skills).length, MATT_SKILLS.length);
  assert.equal(Object.keys(receipt.platforms["claude-code"].skills).length, MATT_SKILLS.length);
  assert.match(fs.readFileSync(path.join(project, ".matrix", "config.yaml"), "utf8"), /^default_orchestration: arch$/m);
});

test("rerunning setup preserves an existing orchestration default unless explicitly changed", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  assert.equal(distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" }).plan).ok, true);
  const repeated = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none", defaultOrchestration: "arch" });
  assert.equal(repeated.code, "ARCH_INSTALLATION_INCOMPLETE");
  const changed = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none", defaultOrchestration: "prim" });
  assert.equal(distribution.commit(changed.plan).ok, true);
  assert.match(fs.readFileSync(path.join(project, ".matrix", "config.yaml"), "utf8"), /^default_orchestration: prim$/m);
});

test("rerunning init without Matt preserves an existing compatible Arch receipt", (t) => {
  const { project, home } = fixture(t);
  const hashes = fakeMattHashes((skill) => `# ${skill}\n`);
  const candidate = fakeCandidate(path.join(home, "preserved-arch-candidate"), ["codex"], (skill) => `# ${skill}\n`);
  const distribution = createDistribution({
    mattContentHashes: hashes,
    mattAdapter: { prepareCandidate() { return candidate; }, discardCandidate() {} }
  });
  const installed = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true });
  assert.equal(distribution.commit(installed.plan).ok, true);
  const receiptFile = mattReceiptPath(project);
  const receiptBefore = fs.readFileSync(receiptFile, "utf8");

  const repeated = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" });
  const result = distribution.commit(repeated.plan);

  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(receiptFile, "utf8"), receiptBefore);
  const manifest = JSON.parse(fs.readFileSync(path.join(project, ".matrix", "installation.json"), "utf8"));
  assert.deepEqual(manifest.orchestration, { default: "arch", available: ["prim", "arch"] });
});

test("failed Arch platform expansion preserves the configured platform set", (t) => {
  const { project, home } = fixture(t);
  const candidate = fakeCandidate(path.join(home, "initial-candidate"), ["codex"], (skill) => skill);
  const installing = createDistribution({ mattContentHashes: fakeMattHashes((skill) => skill), mattAdapter: {
    prepareCandidate() { return candidate; },
    discardCandidate() {}
  } });
  assert.equal(installing.commit(installing.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true }).plan).ok, true);
  const manifestFile = path.join(project, ".matrix", "installation.json");
  const configFile = path.join(project, ".matrix", "config.yaml");
  const manifestBefore = fs.readFileSync(manifestFile, "utf8");
  const configBefore = fs.readFileSync(configFile, "utf8");

  const failing = createDistribution({ mattAdapter: { prepareCandidate() { return { ok: false, code: "MATT_INSTALL_FAILED", recovery: "failed" }; } } });
  const expansion = failing.evaluate({ projectRoot: project, home, platforms: ["claude-code"], matt: "missing", nonInteractive: true });
  const result = failing.commit(expansion.plan);
  assert.equal(result.code, "PARTIAL");
  assert.equal(fs.existsSync(path.join(project, ".claude", "skills", "matrix")), false);
  assert.equal(fs.readFileSync(manifestFile, "utf8"), manifestBefore);
  assert.equal(fs.readFileSync(configFile, "utf8"), configBefore);
});

test("pre-existing explicit and incompatible Skills are preserved while incompatible extras are reported", (t) => {
  const { project, home } = fixture(t);
  for (const skill of ["grill-with-docs", "implement", "improve-codebase-architecture"]) {
    const target = path.join(project, ".agents", "skills", skill);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), "user-owned");
  }
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" });
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  const diagnosis = distribution.diagnose({ projectRoot: project, home, platforms: ["codex"], matt: "none" });
  const unmanaged = diagnosis.diagnosis.find((item) => item.code === "ARCH_UNMANAGED_EXTRA");
  assert.deepEqual(unmanaged.skills, ["implement"]);
  assert.equal(diagnosis.observations[0].matt.present, 2);
  assert.equal(fs.readFileSync(path.join(project, ".agents", "skills", "implement", "SKILL.md"), "utf8"), "user-owned");
});

test("unverified local Matt files cannot self-attest an Arch receipt", (t) => {
  const { project, home } = fixture(t);
  for (const skill of MATT_SKILLS) {
    const target = path.join(project, ".agents", "skills", skill);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `arbitrary ${skill}\n`);
  }
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" });
  assert.equal(distribution.commit(evaluation.plan).code, "OK");
  const manifest = JSON.parse(fs.readFileSync(path.join(project, ".matrix", "installation.json"), "utf8"));
  assert.deepEqual(manifest.orchestration.available, ["prim"]);
  assert.equal(fs.existsSync(mattReceiptPath(project)), false);
  const arch = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none", defaultOrchestration: "arch" });
  assert.equal(arch.code, "ARCH_INSTALLATION_INCOMPLETE");
});

test("Distribution fails closed when a Matt adapter cannot provide an isolated candidate", (t) => {
  const { project, home } = fixture(t);
  let directInstallCalls = 0;
  const distribution = createDistribution({ mattAdapter: {
    installMissing({ skills }) {
      directInstallCalls += 1;
      for (const skill of skills) {
        const target = path.join(project, ".agents", "skills", skill);
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, "SKILL.md"), `wrong ${skill}\n`);
      }
      return { ok: true, code: "OK" };
    }
  } });
  const result = distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true }).plan);
  assert.equal(result.code, "PARTIAL");
  assert.equal(directInstallCalls, 0);
  assert.equal(fs.existsSync(mattReceiptPath(project)), false);
  assert.equal(fs.existsSync(path.join(project, ".agents", "skills", "tdd")), false);
});

test("Matt installation commits a staged candidate without exposing the project to the skills CLI", (t) => {
  const { project, home } = fixture(t);
  const lockFile = path.join(project, "skills-lock.json");
  fs.writeFileSync(lockFile, "user-lock-bytes\n");
  const candidate = path.join(home, "matrix-owned-candidate");
  const candidateSkillRoot = path.join(candidate, ".agents", "skills");
  for (const skill of MATT_SKILLS) {
    const target = path.join(candidateSkillRoot, skill);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `# ${skill}\n`);
  }
  let prepared = null;
  let discarded = false;
  const distribution = createDistribution({ mattContentHashes: fakeMattHashes((skill) => `# ${skill}\n`), mattAdapter: {
    prepareCandidate(request) {
      prepared = request;
      return { ok: true, code: "OK", root: candidate, platforms: { codex: candidateSkillRoot } };
    },
    discardCandidate(result) {
      assert.equal(result.root, candidate);
      discarded = true;
    }
  } });
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true });
  const result = distribution.commit(evaluation.plan);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(prepared.platforms, ["codex"]);
  assert.deepEqual(prepared.skills, MATT_SKILLS);
  assert.equal(discarded, true);
  assert.equal(fs.readFileSync(lockFile, "utf8"), "user-lock-bytes\n");
  for (const skill of MATT_SKILLS) assert.ok(fs.existsSync(path.join(project, ".agents", "skills", skill, "SKILL.md")), skill);
});

test("Arch readiness requires every reviewed Matt hash to match its trusted receipt record", (t) => {
  const { project, home } = fixture(t);
  const candidate = path.join(home, "matrix-owned-candidate");
  const hashes = fakeMattHashes((skill) => `# ${skill}\n`);
  const distribution = createDistribution({
    mattContentHashes: hashes,
    mattAdapter: {
      prepareCandidate() { return fakeCandidate(candidate, ["codex"], (skill) => `# ${skill}\n`); }
    }
  });
  const installed = distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true }).plan);
  assert.equal(installed.ok, true, installed.error);
  const receiptFile = mattReceiptPath(project);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  receipt.platforms.codex.skills[MATT_SKILLS[0]].hash = "incorrect-recorded-hash";
  fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none", defaultOrchestration: "arch" });
  assert.equal(evaluation.code, "ARCH_INSTALLATION_INCOMPLETE");
});

test("Distribution rejects a staged candidate that differs from the reviewed release", (t) => {
  const { project, home } = fixture(t);
  const candidate = path.join(home, "untrusted-candidate");
  const candidateRoot = path.join(candidate, ".agents", "skills");
  for (const skill of MATT_SKILLS) {
    const target = path.join(candidateRoot, skill);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `untrusted ${skill}\n`);
  }
  const distribution = createDistribution({ mattAdapter: {
    prepareCandidate() { return { ok: true, code: "OK", root: candidate, platforms: { codex: candidateRoot } }; },
    discardCandidate() {}
  } });
  const result = distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true }).plan);
  assert.equal(result.code, "MATRIX_COMMIT_FAILED");
  assert.match(result.error, /did not match the reviewed release/);
  assert.equal(fs.existsSync(mattReceiptPath(project)), false);
  assert.equal(fs.existsSync(path.join(project, ".agents", "skills", "tdd")), false);
});

test("explicit Matt init safely replaces receipt-matching older content with the pinned candidate", (t) => {
  const { project, home } = fixture(t);
  const oldCandidate = fakeCandidate(path.join(home, "old-candidate"), ["codex"], (skill) => `old ${skill}\n`);
  const legacy = createDistribution({ mattContentHashes: fakeMattHashes((skill) => `old ${skill}\n`), mattAdapter: {
    prepareCandidate() { return oldCandidate; },
    discardCandidate() {}
  } });
  assert.equal(legacy.commit(legacy.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true }).plan).ok, true);

  const candidate = path.join(home, "new-candidate");
  const candidateRoot = path.join(candidate, ".agents", "skills");
  for (const skill of MATT_SKILLS) {
    const target = path.join(candidateRoot, skill);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `new ${skill}\n`);
  }
  let prepared = 0;
  const updating = createDistribution({ mattContentHashes: fakeMattHashes((skill) => `new ${skill}\n`), mattAdapter: {
    prepareCandidate() { prepared += 1; return { ok: true, code: "OK", root: candidate, platforms: { codex: candidateRoot } }; },
    discardCandidate() {}
  } });
  const evaluation = updating.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true });
  assert.equal(evaluation.observations[0].matt.classifications.tdd.state, "safe-update");
  assert.equal(updating.commit(evaluation.plan).ok, true);
  assert.equal(prepared, 1);
  assert.equal(fs.readFileSync(path.join(project, ".agents", "skills", "tdd", "SKILL.md"), "utf8"), "new tdd\n");
});

test("explicit Matt init preserves user modifications unless Matt replacement is separately authorized", (t) => {
  const { project, home } = fixture(t);
  const oldCandidate = fakeCandidate(path.join(home, "old-modified-candidate"), ["codex"], (skill) => `old ${skill}\n`);
  const legacy = createDistribution({ mattContentHashes: fakeMattHashes((skill) => `old ${skill}\n`), mattAdapter: {
    prepareCandidate() { return oldCandidate; },
    discardCandidate() {}
  } });
  assert.equal(legacy.commit(legacy.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true }).plan).ok, true);
  const modified = path.join(project, ".agents", "skills", "tdd", "SKILL.md");
  fs.appendFileSync(modified, "user change\n");
  const candidate = path.join(home, "replacement-candidate");
  const candidateRoot = path.join(candidate, ".agents", "skills");
  for (const skill of MATT_SKILLS) {
    const target = path.join(candidateRoot, skill);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `new ${skill}\n`);
  }
  const adapter = { prepareCandidate() { return { ok: true, code: "OK", root: candidate, platforms: { codex: candidateRoot } }; }, discardCandidate() {} };
  const guarded = createDistribution({ mattAdapter: adapter, mattContentHashes: fakeMattHashes((skill) => `new ${skill}\n`) });
  const blockedEvaluation = guarded.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", nonInteractive: true });
  assert.equal(blockedEvaluation.observations[0].matt.classifications.tdd.state, "user-modified");
  assert.equal(blockedEvaluation.code, "MATT_USER_MODIFIED");
  const blocked = guarded.commit(blockedEvaluation.plan);
  assert.equal(blocked.code, "MATT_USER_MODIFIED");
  assert.match(fs.readFileSync(modified, "utf8"), /user change/);
  const forced = createDistribution({ mattAdapter: adapter, mattContentHashes: fakeMattHashes((skill) => `new ${skill}\n`) });
  const approved = forced.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing", mattPolicy: "replace", nonInteractive: true });
  assert.equal(forced.commit(approved.plan).ok, true);
  assert.equal(fs.readFileSync(modified, "utf8"), "new tdd\n");
});

test("installed update intent keeps Matt strictly read-only even when Arch is incomplete", (t) => {
  const { project, home } = fixture(t);
  const initial = createDistribution();
  assert.equal(initial.commit(initial.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" }).plan).ok, true);
  const manifestFile = path.join(project, ".matrix", "installation.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.orchestration = { default: "arch", available: ["prim", "arch"] };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(project, ".matrix", "config.yaml"), "schema: matrix/config/v1\ndefault_orchestration: arch\ninstallation_scope: project\nlanguage: en\n");
  let calls = 0;
  const distribution = createDistribution({ mattAdapter: { installMissing() { calls += 1; throw new Error("must stay read-only"); } } });
  const installed = installedIntent({ projectRoot: project, home });
  assert.equal(installed.intent.matt, "readonly");
  const evaluation = distribution.evaluate(installed.intent);
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.actions[0].matt.kind, "keep");
  const result = distribution.commit(evaluation.plan);
  assert.equal(result.ok, true);
  assert.equal(result.code, "OK");
  assert.equal(calls, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, "utf8")).orchestration.available, ["prim", "arch"]);
});

test("read-only update never recovers a pending init journal that can write Matt", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  assert.equal(distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" }).plan).ok, true);
  const target = path.join(project, ".agents", "skills", "tdd");
  const backup = path.join(project, ".matrix", "backups", "pending-init", "matt", "codex", "tdd");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "SKILL.md"), "new candidate\n");
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, "SKILL.md"), "old user bytes\n");
  const journalFile = path.join(project, ".matrix", "transaction.json");
  fs.writeFileSync(journalFile, JSON.stringify({ id: "pending-init", stagingRoot: path.join(project, ".matrix", "staging", "pending-init"), mattReceipt: { path: mattReceiptPath(project), written: true }, operations: [{ kind: "matt", target, backup, status: "committed" }] }));
  const beforeTarget = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
  const beforeBackup = fs.readFileSync(path.join(backup, "SKILL.md"), "utf8");
  const installed = installedIntent({ projectRoot: project, home });
  const result = distribution.commit(distribution.evaluate(installed.intent).plan);
  assert.equal(result.code, "RECOVERY_REQUIRED");
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), beforeTarget);
  assert.equal(fs.readFileSync(path.join(backup, "SKILL.md"), "utf8"), beforeBackup);
  assert.ok(fs.existsSync(journalFile));
});

test("Matt target classification exposes every init approval state", () => {
  assert.equal(classifyMattTarget({ present: false }), "missing");
  assert.equal(classifyMattTarget({ present: true, readable: false }), "unreadable");
  assert.equal(classifyMattTarget({ present: true, actual: "candidate", expected: "candidate", recorded: "candidate", receiptTrusted: true }), "matching");
  assert.equal(classifyMattTarget({ present: true, actual: "candidate", expected: "candidate", receiptTrusted: false }), "adoptable");
  assert.equal(classifyMattTarget({ present: true, actual: "old", expected: "candidate", recorded: "old", receiptTrusted: false }), "safe-update");
  assert.equal(classifyMattTarget({ present: true, actual: "changed", expected: "candidate", recorded: "old", receiptTrusted: true }), "user-modified");
});

test("legacy active Matt records survive repeated read-only Matrix updates", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  assert.equal(distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none" }).plan).ok, true);
  const manifestFile = path.join(project, ".matrix", "installation.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.version = 2;
  manifest.orchestration = { default: "arch", available: ["prim", "arch"] };
  manifest.platforms.codex.matt = { state: "complete", skills: { grilling: { hash: "legacy-hash" } } };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(project, ".matrix", "config.yaml"), "schema: matrix/config/v1\ndefault_orchestration: arch\ninstallation_scope: project\nlanguage: en\n");

  for (let pass = 0; pass < 2; pass += 1) {
    const installed = installedIntent({ projectRoot: project, home });
    const evaluation = distribution.evaluate(installed.intent);
    const result = distribution.commit(evaluation.plan);
    assert.equal(result.code, "OK");
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, "utf8")).platforms.codex.matt, manifest.platforms.codex.matt);
  }
});

test("v3 manifests from a CRLF checkout refresh safely under normalized digests", (t) => {
  const { project, home } = fixture(t);
  const distribution = createDistribution();
  assert.equal(distribution.commit(distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "none", nonInteractive: true }).plan).ok, true);
  const manifestFile = path.join(project, ".matrix", "installation.json");
  // Simulate a 0.1.4-era install: manifest v3 with raw-byte hashes over CRLF content.
  const guidance = path.join(project, ".agents", "skills", "matrix", "SKILL.md");
  fs.writeFileSync(guidance, fs.readFileSync(guidance, "utf8").replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.version = 3;
  manifest.catalogVersion = "0.0.9";
  for (const record of Object.values(manifest.platforms)) {
    for (const skill of MATRIX_SKILLS) record.skills[skill] = { hash: rawHashDirectory(path.join(record.root, skill)) };
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "readonly", nonInteractive: true, matrixPolicy: "safe" });
  assert.equal(evaluation.code, "OK");
  assert.equal(distribution.commit(evaluation.plan).ok, true);
  assert.equal(JSON.parse(fs.readFileSync(manifestFile, "utf8")).version, 4);
});

test("newer manifest-backed Matrix cohorts are kept without downgrade", (t) => {  const { project, home } = fixture(t);
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

test("a malformed Matt directory is classified before approval and never reaches the installer", (t) => {
  const { project, home } = fixture(t); const malformed = path.join(project, ".agents", "skills", "tdd"); fs.mkdirSync(malformed, { recursive: true });
  const calls = []; const distribution = createDistribution({ mattAdapter: { installMissing(request) { calls.push(request); return { ok: false, code: "MATT_INSTALL_FAILED" }; } } });
  const evaluation = distribution.evaluate({ projectRoot: project, home, platforms: ["codex"], matt: "missing" });
  assert.ok(evaluation.observations[0].matt.missing.includes("tdd"));
  assert.equal(evaluation.observations[0].matt.classifications.tdd.state, "user-modified");
  assert.equal(evaluation.code, "MATT_USER_MODIFIED");
  const result = distribution.commit(evaluation.plan); assert.equal(result.code, "MATT_USER_MODIFIED"); assert.equal(calls.length, 0);
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
