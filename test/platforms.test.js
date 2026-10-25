import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PLATFORMS, PLATFORM_IDS } from "../src/catalog.js";
import { PLATFORM_SKILL_ROOTS } from "../src/workflow.js";

test("platform registry exposes the three verified agent platforms", () => {
  assert.deepEqual(PLATFORM_IDS, ["claude-code", "codex", "zcode"]);
  for (const id of PLATFORM_IDS) {
    const platform = PLATFORMS[id];
    assert.equal(platform.id, id);
    assert.ok(platform.name.length > 0);
    assert.ok(platform.skillsCliAgent.length > 0);
    assert.ok(Array.isArray(platform.legacyRoots("base")));
    // Every registered platform has a dedicated skills-CLI agent; agents that
    // share the Agent Skills open-standard directory ride on Codex instead.
    assert.equal("candidateLayout" in platform, false);
  }
});

test("bundled runtime platform roots stay in parity with catalog PLATFORMS", () => {
  assert.deepEqual(Object.keys(PLATFORM_SKILL_ROOTS).sort(), [...PLATFORM_IDS].sort());
  for (const id of PLATFORM_IDS) {
    const base = path.join("parity", "base");
    assert.equal(path.join(base, PLATFORM_SKILL_ROOTS[id]), PLATFORMS[id].skillRoot(base));
  }
});
