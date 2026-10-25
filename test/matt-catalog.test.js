import assert from "node:assert/strict";
import test from "node:test";
import * as mattCatalog from "../src/matt-catalog.mjs";
import {
  MATT_COMPATIBILITY, MATT_CONTENT_HASHES, MATT_INSTALLABLE_SKILLS, MATT_OFFICIAL_SKILLS, MATT_ROLES, MATT_AUTOMATIC_SKILLS
} from "../src/matt-catalog.mjs";

test("Matrix 0.1.8 freezes the reviewed Matt Skills v1.3.1 release and all official roles", () => {
  assert.deepEqual(MATT_COMPATIBILITY, {
    matrixVersion: "0.1.8",
    release: "v1.3.1",
    commit: "24fe0ef7737efae15c87225755e9f6f5965e4888",
    archive: "https://github.com/mattpocock/skills/archive/24fe0ef7737efae15c87225755e9f6f5965e4888.tar.gz",
    skillsCli: "skills@1.7.4"
  });
  assert.deepEqual(MATT_ROLES.automatic, [
    "grilling", "domain-modeling", "research", "prototype", "codebase-design",
    "tdd", "diagnosing-bugs", "code-review", "wizard", "writing-for-agents"
  ]);
  assert.deepEqual(MATT_ROLES.handoff, [
    "setup-matt-pocock-skills", "improve-codebase-architecture", "wayfinder", "handoff", "to-questionnaire", "retro"
  ]);
  assert.deepEqual(MATT_ROLES.standalone, [
    "ask-matt", "grill-with-docs", "triage", "to-spec", "to-tickets", "grill-me", "teach", "wait-what", "pr"
  ]);
  assert.deepEqual(MATT_ROLES.incompatible, ["implement", "implement-spec"]);
  assert.deepEqual(MATT_AUTOMATIC_SKILLS, MATT_ROLES.automatic);
  assert.equal(MATT_OFFICIAL_SKILLS.length, 27);
  assert.equal(new Set(MATT_OFFICIAL_SKILLS).size, 27);
  assert.deepEqual(new Set(MATT_OFFICIAL_SKILLS), new Set(Object.values(MATT_ROLES).flat()));
  assert.equal(MATT_INSTALLABLE_SKILLS.length, 25);
  assert.deepEqual(MATT_INSTALLABLE_SKILLS, [...MATT_ROLES.automatic, ...MATT_ROLES.handoff, ...MATT_ROLES.standalone]);
  assert.equal(MATT_INSTALLABLE_SKILLS.some((skill) => MATT_ROLES.incompatible.includes(skill)), false);
  assert.deepEqual(Object.keys(MATT_CONTENT_HASHES).sort(), [...MATT_OFFICIAL_SKILLS].sort());
  assert.ok(Object.values(MATT_CONTENT_HASHES).every((value) => /^[a-f0-9]{64}$/.test(value)));
  assert.equal("MATT_POLICIES" in mattCatalog, false);
});
