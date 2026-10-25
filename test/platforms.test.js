import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PLATFORMS, PLATFORM_IDS } from "../src/catalog.js";
import { PLATFORM_SKILL_ROOTS } from "../src/workflow.js";

test("platform registry exposes the four verified agent platforms", () => {
  assert.deepEqual(PLATFORM_IDS, ["claude-code", "codex", "zcode", "deepseek"]);
  for (const id of PLATFORM_IDS) {
    const platform = PLATFORMS[id];
    assert.equal(platform.id, id);
    assert.ok(platform.name.length > 0);
    assert.ok(platform.skillsCliAgent.length > 0);
    assert.ok(Array.isArray(platform.legacyRoots("base")));
  }
});

test("bundled runtime platform roots stay in parity with catalog PLATFORMS", () => {
  assert.deepEqual(Object.keys(PLATFORM_SKILL_ROOTS).sort(), [...PLATFORM_IDS].sort());
  for (const id of PLATFORM_IDS) {
    const base = path.join("parity", "base");
    assert.equal(path.join(base, PLATFORM_SKILL_ROOTS[id]), PLATFORMS[id].skillRoot(base));
  }
});

test("deepseek produces its Matt candidate in the codex layout and remaps to .deepcode/skills", () => {
  assert.equal(PLATFORMS.deepseek.skillsCliAgent, "codex");
  assert.equal(path.join("base", ".agents", "skills"), PLATFORMS.deepseek.candidateLayout("base"));
  assert.equal(path.join("base", ".deepcode", "skills"), PLATFORMS.deepseek.skillRoot("base"));
  for (const id of ["claude-code", "codex", "zcode"]) {
    assert.equal("candidateLayout" in PLATFORMS[id], false);
  }
});
