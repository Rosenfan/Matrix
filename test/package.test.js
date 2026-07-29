import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("package publishes under the documented Matrix name with a release gate", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, "@rosenfan/matrix");
  assert.equal(manifest.bin.matrix, "bin/matrix.js");
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.scripts.prepublishOnly, "npm run test && npm run pack:check");
});

test("Matrix Skill guidance has no Claude-only runtime path assumption", () => {
  for (const skill of ["matrix", "matrix-claude"]) {
    const guidance = fs.readFileSync(path.join(root, ".claude", "skills", skill, "SKILL.md"), "utf8");
    assert.equal(guidance.includes(".claude/skills/matrix"), false, skill);
  }
});

test("Chinese release cohort contains every Matrix Skill with matching machine commands", () => {
  const englishRoot = path.join(root, ".claude", "skills");
  const chineseRoot = path.join(root, "assets", "skills-zh-CN");
  const matrixSkills = ["matrix", "matrix-open", "matrix-design", "matrix-build", "matrix-verify", "matrix-archive", "matrix-hotfix", "matrix-tweak", "matrix-status", "matrix-claude"];
  for (const skill of matrixSkills) {
    const guidance = fs.readFileSync(path.join(chineseRoot, skill, "SKILL.md"), "utf8");
    assert.ok(fs.existsSync(path.join(englishRoot, skill, "SKILL.md")), skill);
    assert.match(guidance, new RegExp(`name: ${skill}`));
    assert.equal(guidance.includes("鎸"), false, `${skill} must not contain garbled Chinese text`);
  }
  assert.match(fs.readFileSync(path.join(chineseRoot, "matrix", "SKILL.md"), "utf8"), /matrix workflow inspect/);
  assert.match(fs.readFileSync(path.join(chineseRoot, "matrix-build", "SKILL.md"), "utf8"), /matrix workflow transition verify/);
  assert.match(fs.readFileSync(path.join(chineseRoot, "matrix-claude", "SKILL.md"), "utf8"), /matrix workflow export --task-id/);
  for (const command of [
    "matrix workflow return design --reason design-gap",
    "matrix workflow return build --reason verification-failed",
    "matrix workflow return design --reason acceptance-or-design-gap",
    "matrix workflow abort --reason"
  ]) {
    assert.ok(fs.readFileSync(path.join(englishRoot, "matrix", "SKILL.md"), "utf8").includes(command), `English matrix is missing ${command}`);
    assert.ok(fs.readFileSync(path.join(chineseRoot, "matrix", "SKILL.md"), "utf8").includes(command), `Chinese matrix is missing ${command}`);
  }
});

test("Prim and Arch guidance excludes orchestration wrappers from managed phases", () => {
  for (const base of [path.join(root, ".claude", "skills"), path.join(root, "assets", "skills-zh-CN")]) {
    assert.match(fs.readFileSync(path.join(base, "matrix", "SKILL.md"), "utf8"), /Prim/);
    assert.match(fs.readFileSync(path.join(base, "matrix", "SKILL.md"), "utf8"), /Arch/);
    assert.equal(fs.readFileSync(path.join(base, "matrix-open", "SKILL.md"), "utf8").includes("`grill-with-docs`"), false);
    assert.equal(fs.readFileSync(path.join(base, "matrix-build", "SKILL.md"), "utf8").includes("`implement`"), false);
    assert.equal(fs.readFileSync(path.join(base, "matrix-verify", "SKILL.md"), "utf8").includes("`improve-codebase-architecture`"), false);
  }
});

test("published shortcut guidance shares one lightweight path with explicit approval", () => {
  for (const base of [path.join(root, ".claude", "skills"), path.join(root, "assets", "skills-zh-CN")]) {
    const open = fs.readFileSync(path.join(base, "matrix-open", "SKILL.md"), "utf8");
    const hotfix = fs.readFileSync(path.join(base, "matrix-hotfix", "SKILL.md"), "utf8");
    const tweak = fs.readFileSync(path.join(base, "matrix-tweak", "SKILL.md"), "utf8");
    assert.match(open, /matrix workflow transition build --confirmed/);
    assert.match(hotfix, /open → build → verify → archive/);
    assert.match(tweak, /open → build → verify → archive/);
    assert.match(hotfix, /root.?cause|根因/i);
    assert.match(tweak, /diff boundary|diff 边界/i);
  }
});
