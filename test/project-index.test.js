import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { projectsIndexPath, readProjectsIndex, registerProject, pruneProject } from "../src/project-index.js";

function home(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-projects-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("registers projects atomically, deduplicates, and refreshes repeats at the front", (t) => {
  const root = home(t);
  assert.deepEqual(readProjectsIndex({ home: root }), { ok: true, projects: [] });
  registerProject({ projectRoot: "D:/work/a", scope: "project", platforms: ["codex"], language: "en", home: root });
  registerProject({ projectRoot: "D:/work/b", scope: "project", platforms: ["codex"], language: "zh-CN", home: root });
  registerProject({ projectRoot: "D:/work/a", scope: "project", platforms: ["codex", "claude-code"], language: "en", home: root });
  const { ok, projects } = readProjectsIndex({ home: root });
  assert.equal(ok, true);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].path, path.resolve("D:/work/a"));
  assert.deepEqual(projects[0].platforms, ["codex", "claude-code"]);
  assert.ok(projects.every((entry) => typeof entry.updatedAt === "string"));
});

test("prune removes exactly one project and reports unknown entries", (t) => {
  const root = home(t);
  registerProject({ projectRoot: "D:/work/a", scope: "project", platforms: ["codex"], language: "en", home: root });
  const removed = pruneProject({ projectRoot: "D:/work/a", home: root });
  assert.equal(removed.removed.path, path.resolve("D:/work/a"));
  assert.deepEqual(readProjectsIndex({ home: root }).projects, []);
  assert.equal(pruneProject({ projectRoot: "D:/work/never", home: root }).removed, null);
});

test("a corrupt index degrades to an explicit failure and can be overwritten", (t) => {
  const root = home(t);
  fs.mkdirSync(path.join(root, ".matrix"), { recursive: true });
  fs.writeFileSync(projectsIndexPath(root), "{ not json");
  const read = readProjectsIndex({ home: root });
  assert.equal(read.ok, false);
  assert.equal(read.code, "PROJECTS_INDEX_CORRUPT");
  registerProject({ projectRoot: "D:/work/c", scope: "project", platforms: ["codex"], language: "en", home: root });
  assert.equal(readProjectsIndex({ home: root }).projects.length, 1);
});
