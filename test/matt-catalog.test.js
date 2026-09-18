import assert from "node:assert/strict";
import test from "node:test";
import * as mattCatalog from "../src/matt-catalog.mjs";
import {
  MATT_COMPATIBILITY, MATT_CONTENT_HASHES, MATT_INSTALLABLE_SKILLS, MATT_OFFICIAL_SKILLS, MATT_ROLES, MATT_AUTOMATIC_SKILLS
} from "../src/matt-catalog.mjs";

test("Matrix 0.1.5 freezes the reviewed Matt Skills v1.2.3 release and all official roles", () => {
  assert.deepEqual(MATT_COMPATIBILITY, {
    matrixVersion: "0.1.5",
    release: "v1.2.3",
    commit: "6acc160e4e0cd062dbbbd7a1b26ae92855edf07e",
    archive: "https://github.com/mattpocock/skills/archive/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e.tar.gz",
    skillsCli: "skills@1.5.22"
  });
  assert.deepEqual(MATT_ROLES.automatic, [
    "grilling", "domain-modeling", "research", "prototype", "codebase-design",
    "tdd", "diagnosing-bugs", "code-review", "wizard", "writing-for-agents"
  ]);
  assert.deepEqual(MATT_ROLES.handoff, [
    "setup-matt-pocock-skills", "improve-codebase-architecture", "wayfinder", "handoff", "to-questionnaire"
  ]);
  assert.deepEqual(MATT_ROLES.standalone, [
    "ask-matt", "grill-with-docs", "triage", "to-spec", "to-tickets", "grill-me", "teach", "wait-what"
  ]);
  assert.deepEqual(MATT_ROLES.incompatible, ["implement", "resolving-merge-conflicts"]);
  assert.deepEqual(MATT_AUTOMATIC_SKILLS, MATT_ROLES.automatic);
  assert.equal(MATT_OFFICIAL_SKILLS.length, 25);
  assert.equal(new Set(MATT_OFFICIAL_SKILLS).size, 25);
  assert.deepEqual(new Set(MATT_OFFICIAL_SKILLS), new Set(Object.values(MATT_ROLES).flat()));
  assert.equal(MATT_INSTALLABLE_SKILLS.length, 23);
  assert.deepEqual(MATT_INSTALLABLE_SKILLS, [...MATT_ROLES.automatic, ...MATT_ROLES.handoff, ...MATT_ROLES.standalone]);
  assert.equal(MATT_INSTALLABLE_SKILLS.some((skill) => MATT_ROLES.incompatible.includes(skill)), false);
  assert.deepEqual(Object.keys(MATT_CONTENT_HASHES).sort(), [...MATT_OFFICIAL_SKILLS].sort());
  assert.ok(Object.values(MATT_CONTENT_HASHES).every((value) => /^[a-f0-9]{64}$/.test(value)));
  assert.equal("MATT_POLICIES" in mattCatalog, false);
});
